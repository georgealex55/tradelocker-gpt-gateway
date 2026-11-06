#!/usr/bin/env python3
"""Offline $1,000 session research on verified HistData minute bid bars."""

import argparse
import ctypes as ct
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass
from hashlib import sha256
from itertools import product
import json
from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

import numpy as np
import pandas as pd
from scipy.signal import lfilter


SYMBOLS = ("EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "XAUUSD")
DEVELOPMENT = (2022, 2023, 2024)
HOLDOUT = 2025
FOLDS = (
    ("train_2022", "2022-01-01", "2023-01-01"),
    ("train_2023", "2023-01-01", "2024-01-01"),
    ("validation_h1_2024", "2024-01-01", "2024-07-01"),
    ("validation_h2_2024", "2024-07-01", "2025-01-01"),
)
WINDOWS = {
    "london-open": ("Europe/London", 480, 600, "open"),
    "ny-open": ("America/New_York", 480, 600, "open"),
    "london-close": ("Europe/London", 900, 1020, "close"),
    "ny-close": ("America/New_York", 900, 1005, "close"),
    "gold-us-midday-close": ("America/New_York", 750, 825, "close"),
    "london-intraday": ("Europe/London", 600, 900, "intraday"),
    "ny-intraday": ("America/New_York", 600, 900, "intraday"),
    "london-late": ("Europe/London", 930, 990, "close"),
    "gold-us-open": ("America/New_York", 500, 620, "open"),
}
DUAL_WINDOWS = {
    "dual-open": ("london-open", "ny-open"),
    "dual-close": ("london-close", "ny-close"),
}
PILOT_WINDOWS = tuple(WINDOWS)[:7]
GOLD_WINDOWS = {"gold-us-midday-close", "gold-us-open"}
OPEN_CONTEXT_WINDOWS = ("london-open", "ny-open", "gold-us-open", "dual-open")
CLOSE_CONTEXT_WINDOWS = ("london-close", "london-late", "ny-close", "gold-us-midday-close", "dual-close")
PREOPEN_MINUTES = 60
BASELINES = ("ema-trend", "rsi-recovery", "donchian-breakout", "trend-momentum")
LEGACY = ("legacy-v1", "legacy-soft", "legacy-a2")
SOURCE_FILES = (Path(__file__), Path(__file__).with_name("xmi-session-execution.cpp"),
                Path(__file__).with_name("xmi-session-legacy.mjs"))


@dataclass(frozen=True)
class Variant:
    rule: str
    minutes: int
    window: str
    risk: float
    stop_atr: float
    reward: float
    hold_minutes: int
    rule_parameter: int = 0
    max_trades: int = 0
    cooldown: int = 0
    min_stop_to_cost: float = 0


class FillModel(ct.Structure):
    _fields_ = [
        (name, ct.c_double) for name in
        ("risk", "spread", "slippage", "commission_per_unit_side", "unit_step",
         "leverage", "reward", "unit_cap", "max_drawdown")
    ] + [
        (name, ct.c_int) for name in
        ("max_minutes", "trades_per_window", "usd_base", "cooldown_minutes", "exit_on_flip")
    ]


class Result(ct.Structure):
    _fields_ = [
        (name, ct.c_double) for name in
        ("equity", "gross_profit", "gross_loss", "drawdown", "r_total", "cost", "win_count",
         "trade_count", "size_skips", "stop_count", "target_count", "time_count", "ambiguous_count", "halted",
         "risk_exits", "flip_exits")
    ]


class Trade(ct.Structure):
    _fields_ = [(name, ct.c_double) for name in ("net", "r", "units", "cost")] + [
        (name, ct.c_int32) for name in ("entry", "exit", "side", "reason")
    ]


def file_hash(path):
    with path.open("rb") as file:
        digest = sha256()
        for chunk in iter(lambda: file.read(262144), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_identity():
    return {path.name: file_hash(path) for path in SOURCE_FILES}


def utc_minute(value):
    return int(pd.Timestamp(value, tz="UTC").timestamp() // 60)


def read_history(cache, symbol, years):
    data, manifest = [], []
    for year in years:
        path = cache / f"{symbol.lower()}-{year}.zip"
        with ZipFile(path) as archive, archive.open(f"DAT_ASCII_{symbol}_M1_{year}.csv") as csv:
            df = pd.read_csv(csv, sep=";", header=None, names=["time", "o", "h", "l", "c", "v"])
        stamps = pd.DatetimeIndex(pd.to_datetime(df.pop("time"), format="%Y%m%d %H%M%S", utc=True))
        if df.empty or (stamps.year != year).any() or (stamps.second != 0).any():
            raise ValueError(f"{symbol} {year} has invalid archive dates")
        stamps += pd.Timedelta(hours=5)
        t = stamps.asi8 // 60_000_000_000
        values = df[["o", "h", "l", "c"]].to_numpy(dtype=np.float64)
        volume = df["v"].to_numpy(dtype=np.float64)
        if not np.isfinite(values).all() or np.any(values <= 0):
            raise ValueError(f"{symbol} {year} has nonfinite or nonpositive prices")
        o, h, low, c = values.T
        if np.any(h < np.maximum(o, c)) or np.any(low > np.minimum(o, c)):
            raise ValueError(f"{symbol} {year} has invalid candle ranges")
        backwards = int(np.count_nonzero(np.diff(t) < 0))
        if backwards:
            order = np.argsort(t, kind="stable")
            t, values, volume, stamps = t[order], values[order], volume[order], stamps[order]
        duplicates = np.flatnonzero(np.diff(t) == 0) + 1
        if np.any(values[duplicates] != values[duplicates - 1]) or np.any(volume[duplicates] != volume[duplicates - 1]):
            raise ValueError(f"{symbol} {year} has conflicting duplicate minutes")
        keep = np.ones(len(t), dtype=bool)
        keep[duplicates] = False
        ny = stamps.tz_convert("America/New_York")
        weekday, hour = ny.dayofweek.to_numpy(), ny.hour.to_numpy()
        weekend = (weekday == 5) | ((weekday == 6) & (hour < 17)) | ((weekday == 4) & (hour >= 17))
        manifest.append({
            "year": year, "archive_sha256": file_hash(path), "raw_bars": len(t),
            "backward_transitions_sorted": backwards,
            "exact_duplicate_bars_removed": len(duplicates),
            "outside_weekly_hours": int((keep & weekend).sum()),
            "nonzero_volume_bars": int(np.count_nonzero(np.isfinite(volume) & (volume > 0))),
            "first_utc": stamps[0].isoformat(), "last_utc": stamps[-1].isoformat(),
        })
        data.append((t[keep & ~weekend], values[keep & ~weekend]))
    timestamps = np.ascontiguousarray(np.concatenate([t for t, _ in data]))
    if np.any(np.diff(timestamps) <= 0):
        raise ValueError(f"{symbol} archives overlap")
    return timestamps, np.ascontiguousarray(np.concatenate([x for _, x in data]).T), manifest


def roll(values, period, operation):
    return getattr(pd.Series(values).rolling(period), operation)().to_numpy()


def previous(values):
    return np.r_[np.nan, values[:-1]]


def smooth(values, period, alpha=None):
    alpha = 2 / (period + 1) if alpha is None else alpha
    output = np.full(len(values), np.nan)
    finite = np.flatnonzero(np.isfinite(values))
    if len(finite) < period:
        return output
    first = finite[0] + period - 1
    seed = np.mean(values[first - period + 1:first + 1])
    output[first] = seed
    output[first + 1:] = lfilter([alpha], [1, -(1 - alpha)], values[first + 1:], zi=[(1 - alpha) * seed])[0]
    return output


def cross(values, other):
    return (values > other) & (previous(values) <= (previous(other) if np.ndim(other) else other))


def directional(long, short):
    return long.astype(np.int8) - short.astype(np.int8)


class Frame:
    def __init__(self, times, prices, minutes, anchor=0):
        groups = ((times - anchor) // minutes) * minutes + anchor
        first = np.r_[0, np.flatnonzero(np.diff(groups)) + 1]
        last = np.r_[first[1:] - 1, len(times) - 1]
        complete = last - first + 1 == minutes
        self.t = groups[first[complete]]
        self.decision = self.t + minutes
        self.next = last[complete] + 1
        self.o = prices[0, first[complete]]
        self.h = np.maximum.reduceat(prices[1], first)[complete]
        self.low = np.minimum.reduceat(prices[2], first)[complete]
        self.c = prices[3, last[complete]]
        self.minutes = minutes
        self.indicators = {}

    def ema(self, length):
        if length not in self.indicators:
            self.indicators[length] = smooth(self.c, length)
        return self.indicators[length]

    def core(self):
        if "core" in self.indicators:
            return self.indicators["core"]
        close_prev = previous(self.c)
        tr = np.maximum.reduce((self.h - self.low, np.abs(self.h - close_prev), np.abs(self.low - close_prev)))
        tr[0] = self.h[0] - self.low[0]
        atr = smooth(tr, 14, 1 / 14)
        delta = self.c - close_prev
        gain = smooth(np.maximum(delta, 0), 14, 1 / 14)
        loss = smooth(np.maximum(-delta, 0), 14, 1 / 14)
        with np.errstate(divide="ignore", invalid="ignore"):
            rsi = np.where(loss == 0, np.where(gain == 0, 50, 100), 100 - 100 / (1 + gain / loss))
            up, down = self.h - previous(self.h), previous(self.low) - self.low
            pdi = 100 * smooth(np.where((up > down) & (up > 0), up, 0.0), 14, 1 / 14) / atr
            mdi = 100 * smooth(np.where((down > up) & (down > 0), down, 0.0), 14, 1 / 14) / atr
            dx = np.divide(100 * np.abs(pdi - mdi), pdi + mdi, out=np.zeros(len(atr)), where=pdi + mdi != 0)
        adx = smooth(dx, 14, 1 / 14)
        macd = self.ema(12) - self.ema(26)
        result = {"atr": atr, "rsi": rsi, "pdi": pdi, "mdi": mdi, "adx": adx, "hist": macd - smooth(macd, 9)}
        self.indicators["core"] = result
        return result

    def higher(self, other, values):
        indexes = np.searchsorted(other.decision, self.decision, side="right") - 1
        ready = (indexes >= 0) & (self.decision - other.decision[np.maximum(indexes, 0)] < other.minutes)
        return np.where(ready, values[np.maximum(indexes, 0)], np.nan)


def session_specs(window):
    return tuple(WINDOWS[name] for name in DUAL_WINDOWS.get(window, (window,)))


def lane_for(window):
    return session_specs(window)[0][3]


class Session:
    def __init__(self, times, window):
        self.begin = np.full(len(times), -1, dtype=np.int32)
        self.end = np.full(len(times), -1, dtype=np.int32)
        self.complete = []
        self.coverage = {}
        for zone, start, end, _lane in session_specs(window):
            self.add(times, zone, start, end)

    def add(self, times, zone, start, end):
        date_index = pd.to_datetime(times[[0, -1]], unit="m", utc=True).tz_convert(zone)
        days = pd.date_range(date_index[0].normalize(), date_index[-1].normalize(), freq="B").tz_localize(None)
        starts = (days + pd.Timedelta(minutes=start)).tz_localize(zone).tz_convert("UTC").asi8 // 60_000_000_000
        left, right = np.searchsorted(times, starts), np.searchsorted(times, starts + end - start)
        for t, i, j, year in zip(starts, left, right, days.year):
            counts = self.coverage.setdefault(str(year), {"weekdays": 0, "complete": 0, "missing_minutes": 0})
            counts["weekdays"] += 1
            counts["missing_minutes"] += int(end - start - (j - i))
            if j - i == end - start:
                if np.any(self.begin[i:j] >= 0):
                    raise ValueError("Combined session windows overlap")
                counts["complete"] += 1
                self.begin[i:j] = i
                self.end[i:j] = j - 1
                self.complete.append((int(t), int(i), int(j)))


def alignment(long, short):
    return directional(long & ~np.r_[False, long[:-1]], short & ~np.r_[False, short[:-1]])


def channel(frame, lookback):
    upper, lower = previous(roll(frame.h, lookback, "max")), previous(roll(frame.low, lookback, "min"))
    return cross(frame.c, upper), cross(-frame.c, -lower)


def standard_signals(rule, frame, frames, parameter):
    c = frame.c
    fast, slow = frame.ema(20), frame.ema(50)
    trend = fast - slow
    atr, rsi, adx, hist = (frame.core()[x] for x in ("atr", "rsi", "adx", "hist"))
    long_pullback = (previous(frame.low) <= previous(fast)) & (c > fast) & (c > frame.o)
    short_pullback = (previous(frame.h) >= previous(fast)) & (c < fast) & (c < frame.o)
    structure = None
    if rule == "ema-trend":
        diff = frame.ema(10) - frame.ema(30)
        signal = directional(cross(diff, 0), cross(-diff, 0))
    elif rule == "rsi-recovery":
        signal = directional(cross(rsi, parameter or 30), cross(-rsi, -(100 - (parameter or 30))))
    elif rule == "donchian-breakout":
        signal = directional(*channel(frame, parameter or 20))
    elif rule == "trend-momentum":
        signal = directional((frame.ema(10) > frame.ema(30)) & cross(rsi, 55),
                             (frame.ema(10) < frame.ema(30)) & cross(-rsi, -45))
    elif rule in ("preset-scalp", "preset-day-no-vwap", "preset-eur-session"):
        long, short = (trend > 0) & (rsi >= 55), (trend < 0) & (rsi <= 45)
        if rule == "preset-scalp":
            long, short = long & (hist > 0), short & (hist < 0)
        if rule == "preset-eur-session":
            long, short = long & (adx >= 20), short & (adx >= 20)
        signal = alignment(long, short)
    elif rule == "preset-swing-intraday":
        higher = frames[240]
        htrend = frame.higher(higher, higher.ema(50) - higher.ema(200))
        hm = frame.higher(higher, higher.core()["hist"])
        hr = frame.higher(higher, higher.core()["rsi"])
        signal = directional(long_pullback & (htrend > 0) & (hm > 0) & (hr >= 55),
                             short_pullback & (htrend < 0) & (hm < 0) & (hr <= 45))
    elif rule in ("preset-eur-5m", "intraday-pullback"):
        higher = frames[15 if rule == "preset-eur-5m" else 60]
        htrend = frame.higher(higher, higher.ema(20) - higher.ema(50))
        adx_min = parameter or 25
        signal = directional(long_pullback & (trend > 0) & (htrend > 0) & (rsi >= 50) & (adx >= adx_min),
                             short_pullback & (trend < 0) & (htrend < 0) & (rsi <= 50) & (adx >= adx_min))
        if rule == "preset-eur-5m":
            structure = np.where(signal > 0, c - roll(frame.low, 6, "min"), roll(frame.h, 6, "max") - c)
    elif rule == "preset-gbp-break":
        long, short = channel(frame, 20)
        signal = directional(long & (adx >= 20) & (rsi >= 55), short & (adx >= 20) & (rsi <= 45))
    elif rule == "preset-jpy-stoch":
        low, high = roll(frame.low, 14, "min"), roll(frame.h, 14, "max")
        k = np.divide(100 * (c - low), high - low, out=np.full(len(c), np.nan), where=high > low)
        d = roll(k, 3, "mean")
        signal = directional((trend > 0) & (rsi >= 50) & (adx >= 20) & cross(k, d),
                             (trend < 0) & (rsi <= 50) & (adx >= 20) & cross(-k, -d))
    elif rule == "intraday-mean":
        center, deviation = roll(c, 24, "mean"), roll(c, 24, "std")
        z = np.divide(c - center, deviation, out=np.full(len(c), np.nan), where=deviation > 0)
        signal = directional(cross(z, -1.8) & (adx <= parameter), cross(-z, -1.8) & (adx <= parameter))
    elif rule == "intraday-channel-trend":
        higher = frames[60]
        ht = frame.higher(higher, higher.ema(20) - higher.ema(50))
        long, short = channel(frame, parameter)
        signal = directional(long & (ht > 0) & (adx >= 20) & (hist > 0),
                             short & (ht < 0) & (adx >= 20) & (hist < 0))
    elif rule == "intraday-sweep":
        hi, lo = previous(roll(frame.h, parameter, "max")), previous(roll(frame.low, parameter, "min"))
        signal = directional((frame.low < lo) & (c > lo) & (c > frame.o) & (rsi < 50) & (adx < 27),
                             (frame.h > hi) & (c < hi) & (c < frame.o) & (rsi > 50) & (adx < 27))
    elif rule == "soft-regime-modeled":
        higher = frames[60]
        hema200 = frame.higher(higher, higher.ema(200))
        ht = frame.higher(higher, higher.ema(50)) - hema200
        hc = frame.higher(higher, higher.c)
        weak = frame.higher(higher, higher.core()["adx"]) < 20
        prior_bear = previous(roll(((trend < 0) & (rsi < 50) & (hist < 0)).astype(float), 6, "max")) == 1
        prior_bull = previous(roll(((trend > 0) & (rsi > 50) & (hist > 0)).astype(float), 6, "max")) == 1
        signal = directional((ht > 0) & (hc > hema200) & weak & prior_bear & (c > fast) & (rsi >= 50) & cross(hist, 0),
                             (ht < 0) & (hc < hema200) & weak & prior_bull & (c < fast) & (rsi <= 50) & cross(-hist, 0))
    elif rule == "v1-usdchf-modeled":
        higher = frames[60]
        hema50 = frame.higher(higher, higher.ema(50))
        hema200 = frame.higher(higher, higher.ema(200))
        hclose = frame.higher(higher, higher.c)
        hadx, hpdi, hmdi = (frame.higher(higher, higher.core()[x]) for x in ("adx", "pdi", "mdi"))
        hlong = (hema50 > hema200) & (hclose > hema200) & (hadx >= 20) & (hpdi > hmdi)
        hshort = (hema50 < hema200) & (hclose < hema200) & (hadx >= 20) & (hpdi < hmdi)
        near = (frame.low <= np.maximum(fast, slow) + 0.25 * atr) & (frame.h >= np.minimum(fast, slow) - 0.25 * atr)
        reset_long = previous(roll((near & (rsi >= 40) & (rsi <= 55) & (c >= slow)).astype(float), 3, "max")) == 1
        reset_short = previous(roll((near & (rsi >= 45) & (rsi <= 60) & (c <= slow)).astype(float), 3, "max")) == 1
        shock = (atr > 2 * previous(roll(atr, 20, "median"))) | (frame.h - frame.low > 2.5 * atr)
        quiet = roll(shock.astype(float), 5, "max") == 0
        signal = directional(hlong & quiet & reset_long & (trend > 0) & (rsi > 50) & cross(hist, 0) & (c > previous(frame.h)),
                             hshort & quiet & reset_short & (trend < 0) & (rsi < 50) & cross(-hist, 0) & (c < previous(frame.low)))
        structure = np.where(signal > 0, c - roll(frame.low, 5, "min"), roll(frame.h, 5, "max") - c) + 0.2 * atr
    else:
        raise ValueError(f"Unknown standard strategy {rule}")
    signal[:41] = 0
    return signal, structure


def session_signals(rule, frame, session, times, prices, parameter):
    sample = np.searchsorted(times, frame.decision)
    safe = np.minimum(sample, len(times) - 1)
    at = session.begin[safe]
    active = (at >= 0) & (sample < len(times)) & (times[safe] == frame.decision)
    atr, rsi = frame.core()["atr"], frame.core()["rsi"]
    c, p = frame.c, previous(frame.c)
    if rule.startswith("opening-"):
        upper, lower = np.full(len(times), np.nan), np.full(len(times), np.nan)
        for _t, i, _j in session.complete:
            upper[i] = np.max(prices[1, i:i + parameter])
            lower[i] = np.min(prices[2, i:i + parameter])
        hi, lo = upper[np.maximum(at, 0)], lower[np.maximum(at, 0)]
        # The entry minute begins after the closed decision candle.
        # A candle forming the initial range cannot also trigger a trade.
        if rule == "opening-impulse":
            initial = prices[0, np.maximum(at, 0)]
            width = hi - lo
            active &= sample - at == parameter
            long = (c - initial >= 0.5 * width) & (c >= hi - 0.2 * width) & (width > atr)
            short = (initial - c >= 0.5 * width) & (c <= lo + 0.2 * width) & (width > atr)
            return directional(active & long, active & short), None
        active &= sample - at >= parameter + frame.minutes
        if rule in ("opening-break", "opening-break-trend"):
            long, short = (c > hi + 0.1 * atr) & (p <= hi), (c < lo - 0.1 * atr) & (p >= lo)
            if rule == "opening-break-trend":
                trend = frame.ema(20) - frame.ema(50)
                long, short = long & (trend > 0) & (rsi >= 55), short & (trend < 0) & (rsi <= 45)
        elif rule == "opening-failure":
            long = (frame.low < lo - 0.1 * atr) & (c > lo) & (c < hi)
            short = (frame.h > hi + 0.1 * atr) & (c < hi) & (c > lo)
        elif rule == "opening-retest":
            long = (p > hi) & (frame.low <= hi + 0.1 * atr) & (c > hi) & (c > frame.o)
            short = (p < lo) & (frame.h >= lo - 0.1 * atr) & (c < lo) & (c < frame.o)
        else:
            raise ValueError(f"Unknown opening strategy {rule}")
    else:
        anchor = np.full(len(times), np.nan)
        for t, i, _j in session.complete:
            j = i - parameter
            if j >= 0 and times[j] == t - parameter:
                anchor[i] = prices[0, j]
        delta = p - anchor[np.maximum(at, 0)]
        fast, slow = frame.ema(20), frame.ema(50)
        if rule == "close-continuation":
            long = (delta > 2 * atr) & (fast > slow) & cross(c, fast)
            short = (delta < -2 * atr) & (fast < slow) & cross(-c, -fast)
        elif rule == "close-reversal":
            long = (delta < -2.5 * atr) & cross(rsi, 35)
            short = (delta > 2.5 * atr) & cross(-rsi, -65)
        elif rule == "close-break-trend":
            bh, bl = channel(frame, 8)
            long = (delta > 1.5 * atr) & (fast > slow) & bh
            short = (delta < -1.5 * atr) & (fast < slow) & bl
        else:
            raise ValueError(f"Unknown closing strategy {rule}")
    return directional(active & long, active & short), None


def has_preopen_history(times, start, left):
    return left >= PREOPEN_MINUTES and times[left - PREOPEN_MINUTES] == start - PREOPEN_MINUTES


def opening_context_signals(rule, frame, session, times, prices, range_minutes):
    confirmation, regime = rule.removeprefix("opening-context-").split("-")
    if range_minutes <= 0 or range_minutes % frame.minutes:
        raise ValueError("Opening range must contain a whole number of anchored decision bars")
    upper = np.full(len(times), np.nan)
    lower = np.full(len(times), np.nan)
    drift = np.full(len(times), np.nan)
    for start, left, right in session.complete:
        if not has_preopen_history(times, start, left) or left + range_minutes >= right:
            continue
        pre = left - PREOPEN_MINUTES
        width = prices[1, pre:left].max() - prices[2, pre:left].min()
        if width > 0:
            drift[left] = (prices[3, left - 1] - prices[0, pre]) / width
            upper[left] = prices[1, left:left + range_minutes].max()
            lower[left] = prices[2, left:left + range_minutes].min()

    fill = np.minimum(frame.next, len(times) - 1)
    start = session.begin[fill]
    safe = np.maximum(start, 0)
    hi, lo, bias = upper[safe], lower[safe], drift[safe]
    buffer = 0.1 * frame.core()["atr"]
    prev = previous(frame.c)
    elapsed = frame.decision - times[safe]
    active = ((start >= 0) & (frame.next < len(times)) & (times[fill] == frame.decision)
              & (elapsed >= range_minutes + frame.minutes) & np.isfinite(bias) & (buffer > 0))

    if confirmation == "break":
        long = (frame.c > hi + buffer) & (prev <= hi)
        short = (frame.c < lo - buffer) & (prev >= lo)
    elif confirmation == "failure":
        inside = (frame.c > lo) & (frame.c < hi)
        long = inside & (frame.low < lo - buffer)
        short = inside & (frame.h > hi + buffer)
    elif confirmation == "retest":
        active &= elapsed >= range_minutes + 2 * frame.minutes
        prior_buffer = previous(buffer)
        long = (prev > hi + prior_buffer) & (frame.low <= hi + buffer) & (frame.c > hi) & (frame.c > frame.o)
        short = (prev < lo - prior_buffer) & (frame.h >= lo - buffer) & (frame.c < lo) & (frame.c < frame.o)
    else:
        raise ValueError(f"Unknown opening confirmation {confirmation}")

    signal = directional(long, short)
    if regime == "aligned":
        active &= signal * bias >= 0.25
    elif regime == "counter":
        active &= signal * bias <= -0.25
    elif regime == "balanced":
        active &= np.abs(bias) < 0.25
    elif regime != "plain":
        raise ValueError(f"Unknown pre-open filter {regime}")
    return np.where(active, signal, 0), None


def opening_context_strategies(window):
    duration = min(end - start for _, start, end, _ in session_specs(window))
    for confirmation, regime, minutes, span in product(
        ("break", "failure", "retest"), ("plain", "aligned", "counter", "balanced"),
        (5, 15, 30), (15, 30, 60),
    ):
        decision_bars = 2 if confirmation == "retest" else 1
        if span % minutes or span + decision_bars * minutes >= duration:
            continue
        for stop, reward, risk in product((1.5, 2.25, 3.0), (1.4, 2.0), (0.0025, 0.005, 0.01)):
            yield Variant(f"opening-context-{confirmation}-{regime}", minutes, window, risk,
                          stop, reward, 90, span, min_stop_to_cost=2.0)


def strategies(symbol, windows, profile):
    risks = (0.0025, 0.005, 0.01)
    search = (
        product((0.85, 1.25, 1.8), (1.2, 1.8, 2.5), risks)
        if profile == "expanded" else product((1.0, 1.6), (1.4, 2.0), risks)
    )
    grid = tuple(search)
    for window in windows:
        lane = lane_for(window)
        if profile == "opening-context":
            yield from opening_context_strategies(window)
            continue
        if profile == "closing-context":
            for rule, minutes, lookback, stop, reward, risk in product(
                ("close-continuation", "close-reversal", "close-break-trend"), (5, 15, 30),
                (60, 120), (1.5, 2.25, 3.0), (1.4, 2.0), risks,
            ):
                yield Variant(rule, minutes, window, risk, stop, reward, 90, lookback, min_stop_to_cost=2.0)
            continue
        if profile == "legacy":
            for risk in risks:
                yield Variant("legacy-v1", 15, window, risk, 0, 1.8, 240, max_trades=2, cooldown=60)
                yield Variant("legacy-soft", 15, window, risk, 0, 1.8, 240, max_trades=2, cooldown=60)
                yield Variant("legacy-a2", 60, window, risk, 0, 0, 300, max_trades=2)
            continue
        if profile == "targeted":
            yield from targeted_strategies(window, lane)
            continue
        for rule, minutes in product(BASELINES, (5, 15, 30)):
            yield Variant(rule, minutes, window, 0.005, 0, 2, minutes * 24)
            for stop, reward, risk in grid:
                yield Variant(rule, minutes, window, risk, stop, reward, min(180, minutes * 12))
        if lane == "open":
            rules = list(product(("opening-break", "opening-failure", "opening-retest"), (1, 5, 15), (15, 30)))
        elif lane == "close":
            rules = list(product(("close-continuation", "close-reversal"), (5, 15), (60, 120)))
        else:
            rules = [("intraday-pullback", t, adx) for t, adx in product((5, 15), (20, 25))]
            rules += [("intraday-mean", t, adx) for t, adx in product((5, 15, 30), (20, 24))]
        rules += [("preset-scalp", 1, 0), ("preset-day-no-vwap", 15, 0), ("preset-swing-intraday", 5, 0)]
        rules += {
            "EURUSD": [("preset-eur-5m", 5, 25), ("preset-eur-session", 5, 0)],
            "GBPUSD": [("preset-gbp-break", 15, 0)],
            "USDJPY": [("preset-jpy-stoch", 5, 0)],
        }.get(symbol, [])
        for rule, minutes, parameter in rules:
            for stop, reward, risk in grid:
                yield Variant(rule, minutes, window, risk, stop, reward,
                              40 if rule == "preset-eur-5m" else min(120, max(30, minutes * 8)),
                              parameter)
        if symbol == "USDCHF":
            yield Variant("v1-usdchf-modeled", 15, window, 0.01, 0, 1.8, 240, max_trades=2, cooldown=60)


def targeted_strategies(window, lane):
    if lane == "open":
        families = list(product(("opening-impulse", "opening-break-trend", "opening-failure", "opening-retest"),
                                (5, 15), (15, 30)))
    elif lane == "close":
        families = list(product(("close-break-trend", "close-continuation", "close-reversal"), (5, 15), (60, 120)))
    else:
        families = list(product(("intraday-channel-trend", "intraday-sweep"), (5, 15, 30), (12, 24)))
        families.extend([("intraday-pullback", 15, 20), ("intraday-mean", 15, 24), ("soft-regime-modeled", 15, 0)])
    families += [(rule, minutes, 0) for rule, minutes in product(BASELINES, (15, 30, 60))]
    for (rule, minutes, parameter), stop, reward, risk in product(
        families, (1.7, 2.4, 3.2), (0.9, 1.4, 2.2), (0.0025, 0.005, 0.01)
    ):
        yield Variant(rule, minutes, window, risk, stop, reward, 210, parameter, min_stop_to_cost=2.5)


def build_executable(directory):
    directory.mkdir(parents=True, exist_ok=True)
    source = SOURCE_FILES[1]
    output = directory / f"xmi-execution-{file_hash(source)[:16]}.so"
    if not output.exists():
        with NamedTemporaryFile(dir=directory, suffix=".so", delete=False) as file:
            temp = Path(file.name)
        try:
            subprocess.run(["g++", "-std=c++17", "-O3", "-Wall", "-Wextra", "-Werror",
                            "-shared", "-fPIC", str(source), "-o", str(temp)], check=True)
            temp.replace(output)
        finally:
            temp.unlink(missing_ok=True)
    return output.resolve()


def pointer(array):
    return array.ctypes.data_as(ct.c_void_p)


def money_model(symbol, variant, stress, gold_step):
    gold = symbol == "XAUUSD"
    pip = 0.01 if symbol.endswith("JPY") else 0.0001
    lane = lane_for(variant.window)
    return FillModel(
        variant.risk, (0.45 if gold else 2 * pip) * stress,
        (0.07 if gold else 0.3 * pip) * stress, 0.035 if gold else 0.000035,
        gold_step if gold else 1000, 20 if gold else 30, variant.reward,
        1000 if variant.rule in (*LEGACY, "v1-usdchf-modeled") else 1e9,
        0.1, variant.hold_minutes, variant.max_trades or (2 if lane == "open" else 3 if lane == "close" else 5),
        int(symbol.startswith("USD")), variant.cooldown, int(variant.rule in BASELINES),
    )


def metrics(result):
    n = int(result.trade_count)
    return {
        "n": n, "ending_usd": round(result.equity, 6), "net_usd": round(result.equity - 1000, 6),
        "expectancy_usd": round((result.equity - 1000) / n, 6) if n else None,
        "expectancy_r": round(result.r_total / n, 6) if n else None,
        "profit_factor": round(result.gross_profit / result.gross_loss, 6) if result.gross_loss > 0 else None,
        "gross_profit": round(result.gross_profit, 6), "gross_loss": round(result.gross_loss, 6),
        "win_rate": round(result.win_count / n, 6) if n else None,
        "max_drawdown": round(result.drawdown, 8), "halted": bool(result.halted),
        "cost_usd": round(result.cost, 6), "minimum_size_skips": int(result.size_skips),
        "stop_exits": int(result.stop_count), "target_exits": int(result.target_count),
        "time_exits": int(result.time_count), "stop_first_conflicts": int(result.ambiguous_count),
        "risk_halt_exits": int(result.risk_exits), "opposite_signal_exits": int(result.flip_exits),
    }


class Study:
    def __init__(self, cache, symbol, years, executable, windows):
        self.symbol = symbol
        self.t, self.prices, self.manifest = read_history(cache, symbol, years)
        self.frames = {m: Frame(self.t, self.prices, m) for m in (1, 5, 15, 30, 60, 240)}
        self.sessions = {window: Session(self.t, window) for window in windows}
        self.signal_cache = {}
        self.legacy_signals = None
        self.library = ct.CDLL(str(executable))
        self.library.replay.argtypes = [ct.c_void_p] * 9 + [ct.c_int32, ct.POINTER(FillModel),
                                                           ct.POINTER(Result), ct.POINTER(Trade)]
        self.library.replay.restype = None
        self.price_ptrs = tuple(pointer(row) for row in self.prices)

    def load_legacy(self):
        if self.symbol != "USDCHF":
            raise ValueError("Legacy XMI V1 and the two shadow strategies are defined for USDCHF")
        if self.legacy_signals is None:
            bars = {}
            for name, frame in [("m15", self.frames[15]), ("h1", self.frames[60])]:
                bars[name] = [
                    {"time": int(t) * 60_000, "open": o, "high": h, "low": low, "close": c}
                    for t, o, h, low, c in zip(frame.t, frame.o, frame.h, frame.low, frame.c)
                ]
            result = subprocess.run(["node", str(SOURCE_FILES[2])], input=json.dumps(bars),
                                    stdout=subprocess.PIPE, text=True, check=True)
            self.legacy_signals = json.loads(result.stdout)
        return self.legacy_signals

    def plan(self, variant):
        rule, minutes, window, parameter = variant.rule, variant.minutes, variant.window, variant.rule_parameter
        session, frame = self.sessions[window], self.frames[minutes]
        key = (rule, minutes, window, parameter)
        if key in self.signal_cache:
            return self.signal_cache[key]
        if rule.startswith("opening-context-"):
            anchors = {start % minutes for _, start, _, _ in session_specs(window)}
            if len(anchors) != 1:
                raise ValueError("Opening windows use different decision-bar anchors")
            anchor = anchors.pop()
            if anchor:
                anchored_key = (minutes, anchor)
                if anchored_key not in self.frames:
                    self.frames[anchored_key] = Frame(self.t, self.prices, minutes, anchor)
                frame = self.frames[anchored_key]
            signal, structure = opening_context_signals(rule, frame, session, self.t, self.prices, parameter)
        elif rule in LEGACY:
            legacy = self.load_legacy()
            entries = np.asarray(legacy[rule], dtype=float).reshape(-1, 3)
            decision, direction, stops = entries.T
            loc = np.searchsorted(frame.decision, decision.astype(np.int64))
            if np.any(loc >= len(frame.t)) or np.any(frame.decision[loc] != decision):
                raise ValueError("Legacy signal does not match a closed candle")
            signal, structure = np.zeros(len(frame.t), dtype=np.int8), np.full(len(frame.t), np.nan)
            signal[loc], structure[loc] = direction, stops
        elif rule.startswith(("opening-", "close-")):
            signal, structure = session_signals(rule, frame, session, self.t, self.prices, parameter)
        else:
            signal, structure = standard_signals(rule, frame, self.frames, parameter)
        keep = np.flatnonzero((signal != 0) & (frame.next < len(self.t)))
        first = frame.next[keep]
        valid = (self.t[first] == frame.decision[keep]) & (session.begin[first] >= 0)
        if rule in ("legacy-v1", "legacy-a2", "v1-usdchf-modeled"):
            utc_clock = self.t[first] % 1440
            valid &= (utc_clock >= 420) & (utc_clock < 960)
        keep, first = keep[valid], first[valid]
        stop_data = np.ascontiguousarray(structure[keep]) if structure is not None else None
        limit = np.ascontiguousarray(session.end[first])
        if rule in ("legacy-v1", "legacy-soft"):
            stop_data = (self.prices[0, first] - stop_data) * signal[keep]
        elif rule == "legacy-a2":
            exits = np.asarray(legacy["a2Exit"], dtype=np.int64)
            if len(exits):
                future = np.searchsorted(exits, self.t[first], side="right")
                following = np.minimum(future, len(exits) - 1)
                exit_bars = np.searchsorted(self.t, exits[following]) - 1
                limit = np.where(future < len(exits), np.minimum(limit, exit_bars), limit).astype(np.int32)
        plan = (
            first.astype(np.int32), np.ascontiguousarray(session.end[first]), np.ascontiguousarray(signal[keep]),
            np.ascontiguousarray(frame.core()["atr"][keep]), stop_data, limit,
        )
        self.signal_cache[key] = plan
        return plan

    def run(self, variant, fold, stress=1.0, gold_step=1.0, retain=False, *, spread_override=None):
        start, end = np.searchsorted(self.t, [utc_minute(fold[1]), utc_minute(fold[2])])
        first, last, side, atr, structure, limit = self.plan(variant)
        a, b = np.searchsorted(first, [start, end])
        first, last, side = first[a:b], np.minimum(last[a:b], end - 1).astype(np.int32), side[a:b]
        if variant.stop_atr:
            stop = variant.stop_atr * atr[a:b]
            if structure is not None:
                stop = np.maximum(stop, structure[a:b])
        elif structure is not None:
            stop = structure[a:b]
        else:
            distance = 4 if self.symbol == "XAUUSD" else 0.2 if self.symbol.endswith("JPY") else 0.002
            stop = np.full(len(first), distance)
        model, result = money_model(self.symbol, variant, stress, gold_step), Result()
        if spread_override is not None:
            if not np.isfinite(spread_override) or spread_override < 0:
                raise ValueError("Spread override must be a finite, nonnegative quote-price amount")
            model.spread = spread_override * stress
        if variant.min_stop_to_cost:
            conversion = self.prices[0, first] if model.usd_base else 1.0
            cost_in_price = model.spread + 2 * model.slippage + 2 * model.commission_per_unit_side * conversion
            stop = np.where(stop >= variant.min_stop_to_cost * cost_in_price, stop, np.nan)
        if variant.rule in (*LEGACY, "v1-usdchf-modeled"):
            # The source strategy rejects spreads greater than 20% of the stop.
            stop = np.where(stop >= 5 * model.spread, stop, np.nan)
            spread_cap = 0.0002 if variant.rule == "legacy-a2" else 0.0003
            if model.spread > spread_cap:
                stop = np.full(len(first), np.nan)
        log = (Trade * len(first))() if retain else None
        self.library.replay(*self.price_ptrs, pointer(first), pointer(last), pointer(side), pointer(stop),
                            pointer(limit[a:b]), len(first), ct.byref(model), ct.byref(result), log)
        output = metrics(result)
        output["eligible_window_signals"] = len(first)
        if retain:
            output["trades"] = [
                {"entry_minute": int(self.t[t.entry]), "exit_minute": int(self.t[t.exit]),
                 "pnl_usd": t.net, "r": t.r, "units": t.units, "cost_usd": t.cost,
                 "side": t.side, "exit_reason": t.reason}
                for t in log[:int(result.trade_count)]
            ]
        return output


def eligible(folds):
    val = folds[2:]
    return (
        sum(f["n"] for f in val) >= 150
        and all(f["n"] >= 25 and f["net_usd"] > 0 and not f["halted"] for f in folds)
        and all(f["profit_factor"] is not None and f["profit_factor"] > 1.05 for f in val)
    )


def rank(row):
    folds = row["folds"]
    return (
        row["screen_pass"],
        min(f["expectancy_r"] if f["expectancy_r"] is not None else -10 for f in folds),
        sum(f["net_usd"] for f in folds[2:]),
        -max(f["max_drawdown"] for f in folds),
    )


def screen_symbol(cache, symbol, executable, profile):
    names = {
        "targeted": (*WINDOWS, *DUAL_WINDOWS),
        "opening-context": OPEN_CONTEXT_WINDOWS,
        "closing-context": CLOSE_CONTEXT_WINDOWS,
    }.get(profile, PILOT_WINDOWS)
    windows = [w for w in names if w not in GOLD_WINDOWS or symbol == "XAUUSD"]
    study = Study(cache, symbol, DEVELOPMENT, executable, windows)
    rows = []
    for variant in strategies(symbol, windows, profile):
        folds = [study.run(variant, fold) for fold in FOLDS]
        row = {"symbol": symbol, "variant": asdict(variant), "folds": folds, "screen_pass": eligible(folds)}
        if profile in ("opening-context", "closing-context"):
            stress = [study.run(variant, fold, stress=1.5) for fold in FOLDS]
            stress_pass = all(f["net_usd"] > 0 and f["max_drawdown"] < 0.1 and not f["halted"] for f in stress)
            row.update({"base_screen_pass": row["screen_pass"], "stress_pass": stress_pass, "stress_folds": stress,
                        "screen_pass": row["screen_pass"] and stress_pass})
        rows.append(row)
    rows.sort(key=rank, reverse=True)
    print(f"{symbol} | {len(rows):,} configurations | {sum(x['screen_pass'] for x in rows)} screen passes", flush=True)
    result = {
        "symbol": symbol, "archives": study.manifest,
        "coverage": {name: session.coverage for name, session in study.sessions.items()}, "rows": rows,
    }
    if profile == "opening-context":
        result["preopen_coverage"] = {}
        for name, session in study.sessions.items():
            years = dict.fromkeys(session.coverage, 0)
            for start, left, _ in session.complete:
                if has_preopen_history(study.t, start, left):
                    years[str(pd.Timestamp(start, unit="m", tz="UTC").year)] += 1
            result["preopen_coverage"][name] = years
    return result


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temp = Path(file.name)
    try:
        temp.write_text(json.dumps(value, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def digest(value):
    return sha256(json.dumps(value, allow_nan=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def selection(screens):
    rows = [row for screen in screens for symbol in screen["symbols"] for row in symbol["rows"]]
    rows.sort(key=rank, reverse=True)
    winners = {}
    for row in rows:
        market = "gold" if row["symbol"] == "XAUUSD" else "forex"
        lane = lane_for(row["variant"]["window"])
        if row["screen_pass"]:
            winners.setdefault(f"{market}/{lane}", row)
    return [{"group": group, **row} for group, row in sorted(winners.items())]


def qualified(base, stress):
    return (
        base["n"] >= 200 and base["expectancy_usd"] is not None and base["expectancy_usd"] > 0
        and base["profit_factor"] is not None and base["profit_factor"] > 1.5
        and base["max_drawdown"] < 0.1 and not base["halted"]
        and stress["net_usd"] > 0 and stress["max_drawdown"] < 0.1 and not stress["halted"]
    )


def bootstrap_weekly(trades):
    if not trades:
        return None
    frame = pd.DataFrame(trades)
    weeks = pd.to_datetime(frame["exit_minute"], unit="m").dt.to_period("W-SUN")
    totals = frame.groupby(weeks)["pnl_usd"].agg(["sum", "size"]).to_numpy()
    rng = np.random.default_rng(20261106)
    block_samples = totals[rng.integers(len(totals), size=(10000, len(totals)))].sum(axis=1)
    bounds = np.quantile(block_samples[:, 0] / block_samples[:, 1], [0.025, 0.975])
    return {"active_weeks": len(totals), "resamples": len(block_samples),
            "expectancy_usd_95pct": [round(float(bound), 6) for bound in bounds]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("screen", "freeze", "holdout"))
    parser.add_argument("--cache", type=Path, required=True, help="Location of original HistData ZIPs")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--input", type=Path, nargs="+", help="Screen JSONs for freeze, a single freeze JSON for holdout")
    parser.add_argument("--symbols", nargs="+", choices=SYMBOLS, default=SYMBOLS)
    parser.add_argument("--profile", choices=("pilot", "expanded", "targeted", "legacy", "opening-context",
                                              "closing-context"), default="pilot")
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    identity = source_identity()
    if args.output.exists():
        parser.error("Output exists. Choose a new path to preserve the earlier result.")
    if args.phase == "screen":
        executable = build_executable(args.output.parent)
        symbols = ("USDCHF",) if args.profile == "legacy" else tuple(dict.fromkeys(args.symbols))
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(screen_symbol, args.cache, symbol, executable, args.profile) for symbol in symbols]
            results = [future.result() for future in futures]
        output = {"phase": "screen", "source": identity, "years": DEVELOPMENT, "folds": FOLDS,
                  "profile": args.profile, "symbols": results}
    else:
        if args.input is None:
            parser.error("--input is required to freeze or test a frozen shortlist")
        inputs = [json.loads(path.read_text(encoding="utf-8")) for path in args.input]
        if any(data.get("source") != identity for data in inputs):
            raise ValueError("The engine changed since screening. Screen again before freezing.")
        if args.phase == "freeze":
            archives = {}
            for data in inputs:
                if data.get("phase") != "screen" or data.get("years") != list(DEVELOPMENT):
                    raise ValueError("Freeze requires development-only screens")
                for symbol in data["symbols"]:
                    old = archives.setdefault(symbol["symbol"], symbol["archives"])
                    if old != symbol["archives"]:
                        raise ValueError(f"Development archives differ across screens for {symbol['symbol']}")
            finalists = selection(inputs)
            holdout = {row["symbol"]: file_hash(args.cache / f"{row['symbol'].lower()}-{HOLDOUT}.zip")
                       for row in finalists}
            output = {"phase": "freeze", "source": identity,
                      "screen_sha256": [file_hash(path) for path in args.input],
                      "holdout_year": HOLDOUT, "finalists": finalists,
                      "development_archives": archives, "holdout_archives": holdout}
            output["freeze_sha256"] = digest(output)
        else:
            if len(inputs) != 1:
                raise ValueError("Holdout accepts exactly one frozen shortlist")
            input_data = inputs[0]
            frozen_id = input_data.pop("freeze_sha256", None)
            if input_data.get("phase") != "freeze" or input_data.get("holdout_year") != HOLDOUT or frozen_id != digest(input_data):
                raise ValueError("Finalists must be frozen and their specification must match the freeze hash")
            executable = build_executable(args.output.parent)
            results = []
            for row in input_data["finalists"]:
                symbol, variant = row["symbol"], Variant(**row["variant"])
                for archive in input_data["development_archives"][symbol]:
                    actual = file_hash(args.cache / f"{symbol.lower()}-{archive['year']}.zip")
                    if actual != archive["archive_sha256"]:
                        raise ValueError(f"Development data changed for {symbol} {archive['year']}")
                if file_hash(args.cache / f"{symbol.lower()}-{HOLDOUT}.zip") != input_data["holdout_archives"][symbol]:
                    raise ValueError(f"Holdout archive changed for {symbol}")
                study = Study(args.cache, symbol, (*DEVELOPMENT, HOLDOUT), executable, [variant.window])
                fold = ("holdout", f"{HOLDOUT}-01-01", f"{HOLDOUT + 1}-01-01")
                base = study.run(variant, fold, retain=True)
                stress = study.run(variant, fold, stress=1.5)
                results.append({
                    **row, "base": base, "stress_1_5": stress, "stress_2_0": study.run(variant, fold, stress=2),
                    "bootstrap": bootstrap_weekly(base["trades"]), "qualified": qualified(base, stress),
                    "holdout_archive": study.manifest[-1],
                    "holdout_coverage": study.sessions[variant.window].coverage[str(HOLDOUT)],
                })
                if symbol == "XAUUSD":
                    results[-1]["fractional_0_1_oz_sensitivity"] = study.run(variant, fold, gold_step=0.1)
            output = {"phase": "holdout", "source": identity, "freeze_sha256": frozen_id, "results": results}
    write_json(args.output, output)
    print(f"Wrote {args.phase} {args.output} ({file_hash(args.output)})", flush=True)


if __name__ == "__main__":
    main()
