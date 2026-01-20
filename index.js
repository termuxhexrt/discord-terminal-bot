const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
const path = require('path');
require('dotenv').config();

// --- SERVER SETUP (Railway/Uptime) ---
const app = express();
app.get('/', (req, res) => res.send('Renzu OS is Active 🚀'));
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

[PUBLIC_DIR, USER_DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- VARIABLES ---
let activeProcess = null;
let currentBrowser = null;
let currentPage = null;
let terminalMsg = null; // Output message tracker

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- BROWSER FUNCTIONS ---
async function applySmartTags(page) {
    try {
        await page.evaluate(() => {
            document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
            window.renzuElements = [];
            let idCounter = 1;
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
                executablePath: '/usr/bin/chromium', 
                headless: "new",
                userDataDir: USER_DATA_DIR,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            currentPage = (await currentBrowser.pages())[0];
            await currentPage.setViewport({ width: 1280, height: 720 });
        }
        if (url) await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2' });
        await applySmartTags(currentPage);
        const imgPath = path.join(PUBLIC_DIR, `shot_${Date.now()}.jpg`);
        await currentPage.screenshot({ path: imgPath, type: 'jpeg', quality: 60 });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Close Browser').setStyle(ButtonStyle.Danger)
        );
        const payload = { 
            content: `🌐 **Browser Active:** \`${currentPage.url()}\``, 
            files: [new AttachmentBuilder(imgPath)], 
            components: [row] 
        };
        if (interaction) await interaction.editReply(payload);
        else if (message) await message.reply(payload);
        if (fs.existsSync(imgPath)) setTimeout(() => fs.unlinkSync(imgPath), 5000);
    } catch (err) { console.error(err); }
}

// --- MAIN MESSAGE HANDLER ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // 1. ?HELP COMMAND
    if (msg === '?help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🖥️ Renzu OS Help Menu")
            .setColor("#00ff00")
            .setDescription("Aapka Virtual Terminal aur Browser taiyaar hai!")
            .addFields(
                { name: '💻 Terminal', value: '`! <cmd>` (e.g. `! ls`), `!stop` (Kill current process)' },
                { name: '🌐 Browser', value: '`?screenshot <url>`, `?close` (Button se bhi hota hai)' },
                { name: '📊 System', value: '`?status` (Bot ki health check karne ke liye)' }
            );
        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. ?STATUS COMMAND
    if (msg === '?status') {
        return message.reply(`✅ **Renzu OS Status**\n📡 **Server:** Online\n📂 **Process:** ${activeProcess ? 'Running 🔴' : 'Idle 🟢'}\n🌍 **Browser:** ${currentBrowser ? 'Active 🔵' : 'Offline ⚪'}`);
    }

    // 3. !STOP COMMAND
    if (msg === '!stop' || msg === '!exit') {
        if (activeProcess) {
            activeProcess.kill();
            activeProcess = null;
            return message.reply("🛑 **Process Killed Successfully.**");
        }
        return message.reply("⚠️ Koi process nahi chal raha hai.");
    }

    // 4. INTERACTIVE INPUT (Terminal ON hone par)
    if (activeProcess && !msg.startsWith('!') && !msg.startsWith('?')) {
        try {
            activeProcess.stdin.write(msg + '\n');
            return message.react('✅');
        } catch (err) {
            activeProcess = null;
            return message.reply("🚨 Input failed. Process dead ho gaya.");
        }
    }

    // 5. NEW TERMINAL COMMAND
    if (msg.startsWith('!')) {
        const cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;
        
        terminalMsg = await message.reply("⏳ **Initializing...**");
        let outputBuffer = "";

        activeProcess = spawn(cmd, { 
            shell: true, 
            env: { ...process.env, TERM: 'xterm-color' } 
        });

        const updateUI = (force = false) => {
            const cleanText = stripAnsi(outputBuffer).slice(-1900);
            if (cleanText.trim() || force) {
                const finalContent = cleanText.trim() ? `\`\`\`bash\n${cleanText}\n\`\`\`` : "⚠️ No output received yet...";
                terminalMsg.edit(finalContent).catch(() => {});
            }
        };

        const interval = setInterval(() => updateUI(), 2000);

        activeProcess.stdout.on('data', d => { outputBuffer += d.toString(); });
        activeProcess.stderr.on('data', d => { outputBuffer += d.toString(); });

        activeProcess.on('close', (code) => {
            clearInterval(interval);
            updateUI(true);
            const statusEmoji = code === 0 ? "✅ Done" : `❌ Error (Code ${code})`;
            terminalMsg.reply(`🛑 **Process Finished:** ${statusEmoji}`).catch(() => {});
            activeProcess = null;
        });
        return;
    }

    // 6. BROWSER COMMANDS
    if (msg.startsWith('?screenshot')) {
        const url = msg.split(' ')[1];
        if (!url) return message.reply("Bhai URL toh likh! Jaise: `?screenshot google.com` ");
        return captureAndSend(message, url);
    }

    if (currentPage && !msg.startsWith('?')) {
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
        await currentPage.keyboard.type(msg, { delay: 50 });
        return setTimeout(() => captureAndSend(message), 1000);
    }
});

// Button Interaction
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.customId === 'close_browser' && currentBrowser) {
        await currentBrowser.close();
        currentBrowser = null; currentPage = null;
        await i.update({ content: "🛑 **Browser Session Closed.**", components: [], files: [] });
    }
});

client.login(process.env.TOKEN);
