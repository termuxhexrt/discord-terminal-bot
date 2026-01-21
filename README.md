# 🖥️ RENZU OS - GOD MODE (v1.0)

**RENZU OS** is a premium Discord Virtual Operating System. It combines a **Linux Terminal**, a **Stealth Browser**, and a **Live Web Dashboard** into one powerful bot.

---

## 🔥 Key Features

* **💻 4-Terminal Matrix:** Switch between 4 simultaneous terminal sessions.
* **🌐 Stealth Browser:** Run a headless browser (Puppeteer) with Stealth mode enabled.
* **🖱️ Smart Tagging:** Browser screenshots come with "Yellow Tags". Type the number to click!
* **📟 Terminal Stream:** Live terminal output updates in real-time within Discord.
* **📡 Live Dashboard:** View your terminal AND browser activity on a high-tech web interface.
* **🛡️ Hybrid Security:** Ownership is locked to your ID. Public can use safe commands (`ls`, `ping`), but system-level commands are RESTRICTED.

---

## 🎮 Command Guide

### 💻 Terminal (Prefix: `!`)
| Command | Description |
|---------|-------------|
| `! <cmd>` | Execute shell command (e.g., `! ls`, `! ping google.com`) |
| `!web <folder>` | Host a specific folder on the public URL (e.g., `!web auth`) |
| **Interactive** | Type directly in chat to interact with running apps (like ZPhisher). |

### 🌐 Browser (Prefix: `?`)
| Command | Description |
|---------|-------------|
| `?go <url>` | Open a website and get a screenshot with tags. |
| `?click <#>` | Click an element by its "Yellow Tag" number (e.g., `?click 5`). |
| `?type <text>` | Type text into the active field and press Enter. |
| `?screen` | Get the latest live view from the browser. |
| `?status` | View bot status and directory info. |

---

## 🏴‍☠️ Security & Permissions
- **Owner ID:** `1104652354655113268` (Hardcoded)
- **Restricted Commands:** `rm`, `sudo`, `mv`, `chmod`, `cat`, etc.
- **Unauthorized Users:** Will get a security alert if they try to access system internals.

---

## 🛠️ Setup
1. `npm install`
2. Configure `TOKEN` in `.env`.
3. `node index.js`

**Made with ❤️ by Renzu Team**
