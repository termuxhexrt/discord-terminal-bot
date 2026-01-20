# 🖥️ Renzu OS - Discord Virtual Terminal & Browser

**Renzu OS** is a powerful Discord bot that transforms your Discord channel into a fully functional **Linux Terminal** and **Virtual Web Browser**. Designed for Red Teaming practice, CTF challenges, and remote management, it provides a seamless interface between Discord and a live Linux environment.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg) ![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue.svg) ![Puppeteer](https://img.shields.io/badge/Puppeteer-Stealth-orange.svg)

---

## 🔥 Key Features

* **💻 Root Terminal Access:** Execute Linux shell commands directly from Discord (e.g., `!ls`, `!apt update`, `!git clone`).
* **🔄 Interactive Mode:** Supports interactive tools like **Zphisher**, **Metasploit**, and **Nmap**. Chat messages automatically become terminal inputs when a process is running.
* **🌐 Virtual Browser:** Browse the web, take screenshots, and interact with websites using Puppeteer Stealth.
* **🖱️ Smart Tags:** Click buttons and inputs on websites simply by typing their tag number, making it easy to bypass complex menus.
* **📡 Virtual Streaming:** Simulates a live stream in Voice Channels by rapidly updating screenshots within an embed.
* **🛡️ Stealth Mode:** Uses `puppeteer-extra-plugin-stealth` to evade bot detection and scraping protections.

---

## 🛠️ Installation & Setup

### 1. Clone the Repository
Open your terminal and run the following command to get the source code:
```bash
git clone https://github.com/YOUR_USERNAME/Renzu-OS.git
cd Renzu-OS
```

### 2. Install Dependencies
Ensure you have Node.js installed on your system. Run the following to install required packages:
```bash
npm install
```

### 3. Configuration (.env)
Create a file named `.env` in the root directory and add your bot token and port:
```
TOKEN=your_discord_bot_token_here
PORT=3000
```

### 4. Start the Bot
Run the bot locally or on your server using:
```bash
node index.js
```

---

## 🎮 Command Guide

### 💻 Terminal Commands (Prefix: `!`):
| Command | Description |
|---------|-------------|
| `! <command>` | Execute any Linux shell command (e.g., `!ls -la` or `!apt install git`). |
| `!stop` | Kill Switch. Instantly stops the currently running terminal process to prevent hanging. |
| Interactive Input | When a tool is running, simply type your choice (e.g., `1`, `35`, `username`) directly in the chat to send it to the process. |

### 🌐 Browser Commands (Prefix: `?`):
| Command | Description |
|---------|-------------|
| `?screenshot <url>` | Opens a URL and sends a high-quality screenshot (e.g., `?screenshot google.com`). |
| `?stream` | Toggles "Streaming Mode" which updates the screenshot every few seconds for a live feel. |
| Smart Clicking | Type the number seen on yellow tags in the screenshot to click that specific element. |
| Typing | Any text typed when Terminal is OFF will be typed into the active browser field. |

---

## 🏴‍☠️ How to Run Zphisher (Example)
Renzu OS is specifically optimized for tools like Zphisher. Follow this workflow:

1. **Install & Run:** Paste this one-liner into your Discord channel:
```bash
!apt update && apt install php curl git -y && git clone --depth=1 https://github.com/htr-tech/zphisher.git && cd zphisher && chmod +x zphisher.sh && bash zphisher.sh
```

2. **Navigate the Menu:**
   - Wait for the Zphisher menu to appear in the Discord Embed.
   - To select an option (like `35` for Roblox or `1` for Facebook), just type the number in chat.
   - The bot auto-detects the running process and sends your message as input.

3. **Stop the Tool:** Type `!stop` or `!exit` to kill the process and return to normal terminal mode.

---

## 🚀 Deployment (Railway/VPS)

### Docker / Railway
This project creates a `storage_public` and `storage_data` folder for temporary screenshots and browser data. Ensure your platform has write permissions.

- **Build Command:** `npm install`
- **Start Command:** `node index.js`

**Note for Railway Users:** The code is pre-configured to look for Chromium at `/usr/bin/chromium`, which is standard for Linux containers.

---

## ⚠️ Disclaimer
This tool is created strictly for **Educational Purposes** and **Red Teaming Practice**.

* Do not use this tool for illegal activities or unauthorized access.
* The developer is not responsible for any misuse or damage caused by Renzu OS.
* Always ensure you have consent before testing on any target.

---

**Made with ❤️ by Renzu Team**
