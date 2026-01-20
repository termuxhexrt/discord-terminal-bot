const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
const path = require('path');
require('dotenv').config();

// --- SERVER SETUP (Railway/Uptime ke liye) ---
const app = express();
app.get('/', (req, res) => res.send('Renzu OS is Active'));
app.listen(process.env.PORT || 3000);

// --- BROWSER SETUP ---
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PUBLIC_DIR = path.join(process.cwd(), 'storage_public');
const USER_DATA_DIR = path.join(process.cwd(), 'storage_data');

// Storage Directories Create Karna
[PUBLIC_DIR, USER_DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- VARIABLES ---
let activeProcess = null;    // Terminal Process Tracker
let currentBrowser = null;   // Browser Instance
let currentPage = null;      // Current Tab

// ANSI Colors Remove Karne ke liye (Terminal Output Clean Rahe)
const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- BROWSER FUNCTIONS ---
async function applySmartTags(page) {
    try {
        await page.evaluate(() => {
            // Purane tags hatao
            document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
            window.renzuElements = [];
            let idCounter = 1;
            // Kahan-kahan tag lagana hai
            const selectors = 'button, input, a, [role="button"], textarea, li, [role="option"]';
            document.querySelectorAll(selectors).forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 2 && rect.height > 2 && window.getComputedStyle(el).visibility !== 'hidden') {
                    const id = idCounter++;
                    const tag = document.createElement('div');
                    tag.className = 'renzu-tag';
                    tag.style = `position: absolute; left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px;
                        background: #ffff00; color: black; font-weight: bold; border: 1px solid red;
                        padding: 1px 4px; z-index: 9999999; font-size: 14px; border-radius: 4px; pointer-events: none;`;
                    tag.innerText = id;
                    document.body.appendChild(tag);
                    window.renzuElements.push({ id, x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
                }
            });
        });
    } catch (e) {}
}

async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
            currentBrowser = await puppeteer.launch({
                executablePath: '/usr/bin/chromium', // Railway path
                headless: "new",
                userDataDir: USER_DATA_DIR,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            currentPage = (await currentBrowser.pages())[0];
            await currentPage.setViewport({ width: 1280, height: 720 });
        }

        if (url) await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2' });
        
        await applySmartTags(currentPage);
        const path = `${PUBLIC_DIR}/shot_${Date.now()}.jpg`;
        await currentPage.screenshot({ path, type: 'jpeg', quality: 60 });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Close Browser').setStyle(ButtonStyle.Danger)
        );

        const payload = { 
            content: `🌐 **Current Page:** \`${currentPage.url()}\``, 
            files: [new AttachmentBuilder(path)], 
            components: [row] 
        };

        if (interaction) await interaction.editReply(payload);
        else if (message) await message.reply(payload);

        // Cleanup image
        if (fs.existsSync(path)) setTimeout(() => fs.unlinkSync(path), 3000);
    } catch (err) { console.error(err); }
}

// --- MAIN LOGIC (MESSAGE HANDLER) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // 🛑 STOP COMMAND (Sabse Pehle Check Hoga)
    if (msg === '!stop' || msg === '!exit') {
        if (activeProcess) {
            activeProcess.kill();
            activeProcess = null;
            return message.reply("🛑 **Terminal Process Killed.**");
        }
        return message.reply("⚠️ Koi process chal hi nahi raha.");
    }

    // 🔥 PRIORITY 1: TERMINAL INPUT (Critical Fix)
    // Agar Terminal process ON hai, toh jo bhi likhoge wo INPUT ban jayega.
    if (activeProcess) {
        try {
            activeProcess.stdin.write(msg + '\n'); // Zphisher ko "34 + Enter" bhejega
            await message.react('✅'); // Confirmation ki input chala gaya
        } catch (err) {
            activeProcess = null;
            message.reply("🚨 Process dead ho gaya tha. Reset kar diya.");
        }
        return; // Yahan return zaroori hai taaki Browser code na chale
    }

    // 💻 PRIORITY 2: NEW TERMINAL COMMAND
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);
        const terminalMsg = await message.reply("⏳ **Initializing...**");
        let outputBuffer = "";

        activeProcess = spawn(cmd, { 
            shell: true, 
            cwd: process.cwd(), // Root directory
            env: { ...process.env, TERM: 'xterm-color' } 
        });

        // Output Listener
        const sendOutput = () => {
            if (outputBuffer.trim()) {
                const cleanText = stripAnsi(outputBuffer).slice(-1900);
                if (cleanText) terminalMsg.edit(`\`\`\`bash\n${cleanText}\n\`\`\``).catch(() => {});
            }
        };

        const interval = setInterval(sendOutput, 2000); // Har 2 second update

        activeProcess.stdout.on('data', d => outputBuffer += d.toString());
        activeProcess.stderr.on('data', d => outputBuffer += d.toString());

        activeProcess.on('close', (code) => {
            clearInterval(interval);
            sendOutput();
            terminalMsg.edit(terminalMsg.content + `\n🛑 **Exited with code: ${code}**`);
            activeProcess = null; // Reset process
        });
        return;
    }

    // 🌐 PRIORITY 3: BROWSER COMMANDS
    // Ye tabhi chalega jab Terminal OFF hoga
    if (currentPage && !msg.startsWith('?')) {
        // Smart Tag Click (Number wala logic)
        if (/^\d+$/.test(msg)) {
            const coords = await currentPage.evaluate((id) => {
                const found = window.renzuElements ? window.renzuElements.find(e => e.id === id) : null;
                return found ? { x: found.x, y: found.y } : null;
            }, parseInt(msg));
            
            if (coords) {
                await currentPage.mouse.click(coords.x, coords.y);
                return setTimeout(() => captureAndSend(message), 2000);
            }
        }
        // Typing
        await currentPage.keyboard.type(msg, { delay: 50 });
        return setTimeout(() => captureAndSend(message), 1000);
    }

    if (msg.startsWith('?screenshot')) await captureAndSend(message, msg.split(' ')[1]);
});

// Button Handler
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    await i.deferUpdate();
    if (i.customId === 'close_browser' && currentBrowser) {
        await currentBrowser.close();
        currentBrowser = null; currentPage = null;
        i.followUp("Browser Closed.");
    }
});

client.login(process.env.TOKEN);
