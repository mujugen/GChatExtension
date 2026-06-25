# Google Chat Pinned Chats

A Chrome extension that pins important chats to a persistent **Pinned** section at the top of Google Chat's chat list — so they stay visible no matter how active other conversations get.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![License MIT](https://img.shields.io/badge/License-MIT-blue)

---

## Features

- **Pin any chat** — DMs, group spaces, or threads
- **Persistent order** — pinned chats stay at the top even when Google Chat re-sorts the list on new messages
- **Reorder without dragging** — right-click → Move Up / Move Down
- **Survives everything** — page loads, full-screen mode, SPA navigations, and chat list rebuilds
- **Zero data collection** — no network requests, no account access; pins are stored locally in your browser

---

## Installation

### Chrome Web Store _(recommended)_

[Add to Chrome →](#) _(link coming soon)_

### Manual (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select the project folder
5. Open [Google Chat](https://chat.google.com) — the extension activates immediately

---

## Usage

| Action       | How                                                      |
| ------------ | -------------------------------------------------------- |
| Pin a chat   | Right-click any chat → **Pin chat**                      |
| Unpin a chat | Right-click a pinned chat → **Unpin chat**               |
| Reorder      | Right-click a pinned chat → **Move up** or **Move down** |
| Close menu   | Press `Esc` or click anywhere outside                    |

Pins are saved in `localStorage` and restored automatically on every visit.

---

## How It Works

The extension runs as a Manifest V3 content script on `chat.google.com`. It:

1. Locates the chat list container using a visibility-aware heuristic, excluding Google Chat's internal tooltip panels that duplicate span IDs
2. Injects a **Pinned** header and divider directly into the chat list DOM
3. Watches for Google Chat's re-sorts via `MutationObserver` and restores order within milliseconds
4. Maintains a 750ms watchdog as a safety net for SPA navigations and full-screen transitions

No data leaves your browser. No permissions beyond `chat.google.com` are requested.

---

## Contributing

This project is intentionally small — a single content script (`content.js`) and stylesheet (`styles.css`). Contributions are welcome.

```bash
git clone https://github.com/your-username/gchat-pinned-chats
```

Load the folder as an unpacked extension in `chrome://extensions`, make your changes, and hit the refresh icon on the extension card to reload. Please open an issue before submitting large changes.

---

## Support

If you'd like to support development, you can buy me a coffee at [https://ko-fi.com/mujugen](https://ko-fi.com/mujugen).

---

## License

MIT — see [LICENSE](LICENSE) for details.
