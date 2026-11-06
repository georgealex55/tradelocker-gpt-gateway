#!/usr/bin/env python3
"""Cache public HistData Generic ASCII bid archives for offline XMI research."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from time import sleep
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener
from zipfile import ZipFile


ORIGIN = "https://www.histdata.com"
SYMBOLS = ("EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "XAUUSD")
FORM_FIELDS = {"tk", "date", "datemonth", "platform", "timeframe", "fxpair"}


class DownloadForm(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.fields = {}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "form":
            self.active = values.get("id") == "file_down" and values.get("action") == "/get.php"
        if self.active and tag == "input" and values.get("name") in FORM_FIELDS:
            self.fields[values["name"]] = values.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form":
            self.active = False


def verify_archive(path, symbol, year):
    member = f"DAT_ASCII_{symbol}_M1_{year}.csv"
    with ZipFile(path) as archive:
        if member not in archive.namelist() or archive.testzip() is not None:
            raise ValueError("Wrong archive member or corrupt ZIP")


def download(cache, symbol, year):
    target = cache / f"{symbol.lower()}-{year}.zip"
    if target.exists():
        verify_archive(target, symbol, year)
        return target

    page_url = f"{ORIGIN}/download-free-forex-data/?/ascii/1-minute-bar-quotes/{symbol.lower()}/{year}"
    opener = build_opener(HTTPCookieProcessor())
    opener.addheaders = [("User-Agent", "Mozilla/5.0")]
    temp = target.with_suffix(".part")
    try:
        for attempt in range(3):
            try:
                with opener.open(page_url, timeout=30) as response:
                    parser = DownloadForm()
                    parser.feed(response.read().decode("utf-8", errors="replace"))
                if set(parser.fields) != FORM_FIELDS or not parser.fields["tk"]:
                    raise ValueError(f"Missing archive download form for {symbol} {year}")
                request = Request(
                    f"{ORIGIN}/get.php",
                    data=urlencode(parser.fields).encode(),
                    headers={"Referer": page_url, "Origin": ORIGIN},
                )
                with opener.open(request, timeout=75) as response, temp.open("wb") as output:
                    for chunk in iter(lambda: response.read(262144), b""):
                        output.write(chunk)
                verify_archive(temp, symbol, year)
                temp.replace(target)
                return target
            except OSError as exc:
                if attempt == 2 or isinstance(exc, HTTPError) and exc.code not in (429, 500, 502, 503, 504):
                    raise
                retry_after = exc.headers.get("Retry-After", "") if isinstance(exc, HTTPError) else ""
                sleep(max(4 * (2 ** attempt), int(retry_after) if retry_after.isdecimal() else 0))
    finally:
        temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--symbols", nargs="+", choices=SYMBOLS, default=SYMBOLS)
    parser.add_argument("--years", nargs="+", type=int, default=(2022, 2023, 2024, 2025))
    parser.add_argument("--workers", type=int, choices=range(1, 5), default=4)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    jobs = [(s, y) for y in dict.fromkeys(args.years) for s in dict.fromkeys(args.symbols)]
    failed = []
    with ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(download, args.cache, s, y): (s, y) for s, y in jobs}
        from concurrent.futures import as_completed

        for future in as_completed(futures):
            symbol, year = futures[future]
            try:
                print(f"{symbol} {year} {future.result().stat().st_size:,} bytes", flush=True)
            except (OSError, ValueError, RuntimeError) as exc:
                print(f"{symbol} {year} download failed ({type(exc).__name__}: {exc})", flush=True)
                failed.append((symbol, year))
    if failed:
        raise SystemExit(f"{len(failed)} archives failed: {failed}")


if __name__ == "__main__":
    main()
