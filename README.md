# 🖥️ RENZU OS - TERMINAL BOT (v1.0)

**RENZU OS** is a lightweight, high-performance Discord Terminal Bot designed for remote system management and security research.

---

## 🔥 Key Features

*   **💻 4-Terminal Matrix:** Switch between 4 simultaneous terminal sessions.
*   **📟 Live Terminal Stream:** Real-time terminal output updates directly within Discord.
*   **🌍 Universal Access:** Optimized to work in any channel (Private, Public, or DMs).
*   **🔓 Unrestricted Execution:** No hardcoded owner or command restrictions. Full terminal power.
*   **⚡ Lightweight:** Removed heavy browser dependencies (Puppeteer) for maximum speed.
*   **📡 Web Dashboard:** Monitor your terminal output via a simple web interface on port 2909.

---

## 🎮 Command Guide

### 💻 Terminal (Prefix: `!`)
| Command | Description |
| :--- | :--- |
| `! <cmd>` | Execute shell command (e.g., `! ls`, `! ping google.com`) |
| `!sys` | View system resources (RAM, OS, CPU usage) |
| `!cd <path>` | Change the working directory of the terminal sessions |
| **Interactive** | Type directly in chat to send input to running terminal apps. |

---

## 🛠️ Setup & Deployment

### Local Setup
1. `npm install`
2. Configure `TOKEN` in `.env`.
3. `node index.js`

### Railway Deployment
- Ensure `TOKEN` is set in the Railway Environment Variables.
- The bot uses `PORT 2909` (or the environment variable `$PORT`) for the dashboard.

---

**Made with ❤️ by Renzu Team**
