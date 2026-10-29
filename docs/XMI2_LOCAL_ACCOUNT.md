# XMI device-local account and saved settings

The XMI 2.0 research workspace uses a **device-local account** instead of Google sign-in. No Google OAuth, account database, session cookies, remote user endpoints, environment variables or outside identity provider are required.

## How to use

1. Open `/xmi` on a modern HTTPS browser.
2. Open **Local login / Settings**, select **Create account**, enter a 3–32 character username and a password of at least 12 characters, and confirm it.
3. Customize charts, patterns, ticker news pins, selected strategy and banner/tab visibility.
4. Click **Save settings** to update your encrypted local backup. Use **Sign out** to clear the unencrypted working cache, then sign in again to decrypt and restore settings.
5. To keep settings elsewhere, use the existing workspace export for drawings/chart configuration, but note that it does not carry the encrypted account or other saved preferences.

## Security and recovery

- PBKDF2-HMAC-SHA256 (310,000 iterations) derives a non-extractable AES-256-GCM key from the entered password and a random 128-bit salt. A fresh 96-bit nonce is used for every save. The username is authenticated as associated data.
- Passwords and derived keys live in memory only while unlocked. Settings inside the account backup are ciphertext at rest in local browser storage.
- **Browser guest and working chart caches may still contain plaintext data** until sign-out clears those specific XMI caches. This local feature is not a full-device security boundary, an anti-XSS service or server authentication system.
- No Google sign-in API routes, cloud preferences API or account SQL schema is included in this release.
- Device/browser-specific storage means there is **no cross-device synchronization, password recovery or shared account**. Clearing browser site storage or losing the password makes the encrypted backup unrecoverable.
- Never reuse passwords. Use a browser profile/device with your own access controls. Broker orders and execution remain disabled in XMI research.

## Engine presentation

The nine-cell research visualization is one **square** subdivided into three equal rows and three equal columns. The highlighted cell is based on closed-candle trend and momentum estimates, not broker entry/exit instructions, trade confirmations or future-performance claims.
