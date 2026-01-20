const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
require('dotenv').config();

const app = express();
app.listen(process.env.PORT || 3000);

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates]
});

const PUBLIC_DIR = '/app/storage/public_root';
const USER_DATA_DIR = '/app/storage/user_data';
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

let activeProcess = null, currentBrowser = null, currentPage = null, isStreaming = false;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- BROWSER FUNCTIONS (Same as yours) ---
async function applySmartTags(page) {
    try {
        await page.evaluate(() => {
            document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
            window.renzuElements = [];
            let idCounter = 1;
            const selectors = 'button, input, a, [role="button"], textarea, li';
            document.querySelectorAll(selectors).forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 2 && rect.height > 2) {
                    const id = idCounter++;
                    const tag = document.createElement('div');
                    tag.className = 'renzu-tag';
                    tag.style = `position: absolute; left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px; background: #FFD700; color: black; font-weight: bold; border: 1px solid black; padding: 0px 2px; z-index: 2147483647; font-size: 11px; pointer-events: none;`;
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
            currentBrowser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: "new", userDataDir: USER_DATA_DIR, args: ['--no-sandbox'] });
            currentPage = (await currentBrowser.pages())[0];
            await currentPage.setViewport({ width: 1280, height: 720 });
        }
        if (url) await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2' });
        await applySmartTags(currentPage);
        const path = `${PUBLIC_DIR}/s_${Date.now()}.png`;
        await currentPage.screenshot({ path });
        const payload = { content: `🌐 **URL:** \`${currentPage.url()}\``, files: [new AttachmentBuilder(path)] };
        if (interaction) await interaction.editReply(payload); else if (message) await message.reply(payload);
    } catch (err) { console.error(err); }
}

// --- MESSAGE HANDLER (The Critical Fix) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // FIXED: Terminal Logic for Zphisher
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);

        // Agar process chal raha hai, toh input bhejo (!input 35)
        if (cmd.startsWith('input ')) {
            const val = cmd.replace('input ', '') + '\n';
            if (activeProcess) {
                activeProcess.stdin.write(val); // Yeh zphisher ke menu mein number dalega
                return message.react('✅');
            }
            return message.reply("🚨 No active process!");
        }

        // New Process Start
        const live = await message.reply("⚡ **Renzu-Terminal Active...**");
        let buffer = "";
        if (activeProcess) activeProcess.kill();

        activeProcess = spawn(cmd, { shell: true, cwd: PUBLIC_DIR, env: { ...process.env, TERM: 'xterm' } });

        const intv = setInterval(() => {
            if (buffer.trim()) live.edit(`\`\`\`bash\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(() => {});
        }, 2000);

        activeProcess.stdout.on('data', d => buffer += d.toString());
        activeProcess.stderr.on('data', d => buffer += d.toString());
        activeProcess.on('close', () => { clearInterval(intv); activeProcess = null; });
        return;
    }

    // Baki browser control (Same as yours)
    if (currentPage && !msg.startsWith('?')) {
        if (/^\d+$/.test(msg)) {
            const coords = await currentPage.evaluate(id => {
                const found = window.renzuElements?.find(e => e.id === id);
                return found ? { x: found.x, y: found.y } : null;
            }, parseInt(msg));
            if (coords) {
                await currentPage.mouse.click(coords.x, coords.y);
                return setTimeout(() => captureAndSend(message), 1500);
            }
        }
        await currentPage.keyboard.type(msg, { delay: 50 });
        return setTimeout(() => captureAndSend(message), 1000);
    }

    if (msg.toLowerCase().startsWith('?screenshot')) await captureAndSend(message, msg.split(' ')[1]);
});

client.login(process.env.TOKEN);
