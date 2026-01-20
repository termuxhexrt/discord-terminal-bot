const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
const https = require('https'); 
require('dotenv').config();

// --- EXPRESS SERVER FOR RAILWAY ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Renzu OS is running!'));
app.listen(port, () => console.log(`Express server listening on port ${port}`));

// --- STEALTH BYPASS SETUP ---
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null, currentBrowser = null, currentPage = null;

// Ensure directory exists on startup
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

function getPublicIP() {
    return new Promise((resolve) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', () => resolve('Unknown'));
    });
}

// --- ERROR-PROOF SMART TAGS ---
async function applySmartTags(page) {
    try {
        await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
        await page.evaluate(async () => {
            document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
            window.renzuElements = [];
            let idCounter = 1;
            const tagDoc = (doc, offsetX = 0, offsetY = 0) => {
                if (!doc || !doc.querySelectorAll) return;
                const selectors = 'button, input, a, [role="button"], textarea, [role="checkbox"], li, [role="option"]';
                Array.from(doc.querySelectorAll(selectors)).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 2 && rect.height > 2 && window.getComputedStyle(el).visibility !== 'hidden') {
                        const id = idCounter++;
                        const tag = doc.createElement('div');
                        tag.className = 'renzu-tag';
                        tag.style = `position: absolute; left: ${rect.left + doc.defaultView.scrollX}px; top: ${rect.top + doc.defaultView.scrollY}px;
                            background: #FFD700; color: black; font-weight: bold; border: 1px solid black;
                            padding: 0px 2px; z-index: 2147483647; font-size: 11px; border-radius: 2px; pointer-events: none;`;
                        tag.innerText = id;
                        doc.body.appendChild(tag);
                        window.renzuElements.push({ id, x: rect.left + rect.width/2 + offsetX, y: rect.top + rect.height/2 + offsetY });
                    }
                });
            };
            tagDoc(document);
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const rect = iframe.getBoundingClientRect();
                    tagDoc(iframe.contentDocument, rect.left, rect.top);
                } catch (e) {}
            });
        });
    } catch (err) { console.log("Smart Tags Error:", err.message); }
}

async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
           currentBrowser = await puppeteer.launch({ 
    executablePath: '/usr/bin/chromium',
    headless: "new",
    userDataDir: './user_data_dir', // <--- Ye line cookies save karegi
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ] 
});
            currentPage = await currentBrowser.newPage();
            await currentPage.setViewport({ width: 1280, height: 720 });
        }
        if (url) await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle0', timeout: 60000 });
        await applySmartTags(currentPage);
        const path = `${PUBLIC_DIR}/smart_${Date.now()}.png`;
        await currentPage.screenshot({ path });
        await currentPage.evaluate(() => document.querySelectorAll('.renzu-tag').forEach(el => el.remove())).catch(() => {});
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scroll_up').setLabel('⬆️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('scroll_down').setLabel('⬇️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('press_enter').setLabel('⏎ Enter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('go_back_btn').setLabel('⬅️ Back').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('backspace_key').setLabel('⌫ BS').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('clear_input').setLabel('✂️ Cut').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );
        const payload = { content: `🌐 **URL:** \`${await currentPage.url()}\``, files: [new AttachmentBuilder(path)], components: [row1, row2] };
        if (interaction) await interaction.editReply(payload);
        else if (message) await message.reply(payload);
        if (fs.existsSync(path)) setTimeout(() => fs.unlinkSync(path), 5000);
    } catch (err) {
        console.error(err);
        if (message) message.reply(`❌ **Error:** ${err.message}`);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // --- TERMINAL LOGIC FIX ---
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);
        const live = await message.reply("⚡ **Executing Command...**");
        let buffer = "";

        if (activeProcess) activeProcess.kill();
        
        // Using shell: true and correct environment for output stream
        activeProcess = spawn(cmd, { shell: true, cwd: PUBLIC_DIR, env: { ...process.env, TERM: 'xterm-256color' } });

        const updateUI = () => {
            if (buffer.trim()) {
                live.edit(`\`\`\`bash\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(() => {});
            }
        };

        const intv = setInterval(updateUI, 2000);

        activeProcess.stdout.on('data', d => { buffer += d.toString(); });
        activeProcess.stderr.on('data', d => { buffer += d.toString(); });
        
        activeProcess.on('close', (code) => {
            clearInterval(intv);
            setTimeout(() => {
                const finalOutput = buffer.trim() ? `\`\`\`bash\n${stripAnsi(buffer).slice(-1900)}\n\`\`\`` : "✅ Command executed (No output returned).";
                live.edit(`${finalOutput}\n**Exit Code:** ${code}`).catch(() => {});
                activeProcess = null;
            }, 1000);
        });
        return;
    }

    if (msg.toLowerCase() === '?status') {
        const ip = await getPublicIP();
        const embed = new EmbedBuilder().setTitle('📊 Status').addFields({ name: '🌐 IP', value: `\`${ip}\``, inline: true }).setColor(0x00AE86);
        return message.reply({ embeds: [embed] });
    }

    if (currentPage && !msg.startsWith('?')) {
        if (/^\d+$/.test(msg)) {
            const coords = await currentPage.evaluate((id) => {
                const found = window.renzuElements ? window.renzuElements.find(e => e.id === id) : null;
                return found ? { x: found.x, y: found.y } : null;
            }, parseInt(msg));
            if (coords) {
                await currentPage.mouse.click(coords.x, coords.y, { delay: 100 });
                return setTimeout(() => captureAndSend(message), 1500);
            }
        }
        await currentPage.keyboard.type(msg, { delay: 60 });
        return setTimeout(() => captureAndSend(message), 1000);
    }

    if (msg.toLowerCase().startsWith('?screenshot')) await captureAndSend(message, msg.split(' ')[1]);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate();
    if (!currentPage) return interaction.followUp({ content: "❌ Session expired.", ephemeral: true });

    if (interaction.customId === 'scroll_down') await currentPage.evaluate(() => window.scrollBy(0, 500));
    if (interaction.customId === 'scroll_up') await currentPage.evaluate(() => window.scrollBy(0, -500));
    if (interaction.customId === 'press_enter') await currentPage.keyboard.press('Enter');
    if (interaction.customId === 'go_back_btn') await currentPage.goBack();
    if (interaction.customId === 'close_browser') {
        if (currentBrowser) await currentBrowser.close();
        currentBrowser = null; currentPage = null;
        return interaction.followUp("🛑 Stopped.");
    }
    await captureAndSend(null, null, interaction);
});

process.on('unhandledRejection', error => console.error('Unhandled Promise Rejection:', error));
client.login(process.env.TOKEN);
