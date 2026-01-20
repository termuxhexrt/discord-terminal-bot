const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
const https = require('https'); 
require('dotenv').config();

// --- EXPRESS SERVER ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Renzu OS is alive!'));
app.listen(port, () => console.log(`Server on port ${port}`));

// --- STEALTH SETUP ---
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PUBLIC_DIR = '/app/storage/public_root';
const USER_DATA_DIR = '/app/storage/user_data';

[PUBLIC_DIR, USER_DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let activeProcess = null, currentBrowser = null, currentPage = null, isStreaming = false, streamInterval = null;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- SMART TAGS ---
async function applySmartTags(page) {
    try {
        await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
        await page.evaluate(async () => {
            document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
            window.renzuElements = [];
            let idCounter = 1;
            const tagDoc = (doc, offsetX = 0, offsetY = 0) => {
                if (!doc || !doc.querySelectorAll) return;
                const selectors = 'button, input, a, [role="button"], textarea, li, [role="option"]';
                Array.from(doc.querySelectorAll(selectors)).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 2 && rect.height > 2 && window.getComputedStyle(el).visibility !== 'hidden') {
                        const id = idCounter++;
                        const tag = doc.createElement('div');
                        tag.className = 'renzu-tag';
                        tag.style = `position: absolute; left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px;
                            background: #FFD700; color: black; font-weight: bold; border: 1px solid black;
                            padding: 0px 2px; z-index: 2147483647; font-size: 11px; border-radius: 2px; pointer-events: none;`;
                        tag.innerText = id;
                        doc.body.appendChild(tag);
                        window.renzuElements.push({ id, x: rect.left + rect.width/2 + offsetX, y: rect.top + rect.height/2 + offsetY });
                    }
                });
            };
            tagDoc(document);
        });
    } catch (err) { console.log("Tags Error:", err.message); }
}

// --- CAPTURE & STREAM ---
async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
            currentBrowser = await puppeteer.launch({ 
                executablePath: '/usr/bin/chromium',
                headless: "new",
                userDataDir: USER_DATA_DIR,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] 
            });
            const pages = await currentBrowser.pages();
            currentPage = pages.length > 0 ? pages[0] : await currentBrowser.newPage();
            await currentPage.setViewport({ width: 1280, height: 720 });
        }
        
        if (url) await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2', timeout: 60000 });
        
        await applySmartTags(currentPage);
        const path = `${PUBLIC_DIR}/renzu_stream.png`;
        await currentPage.screenshot({ path });
        
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scroll_up').setLabel('⬆️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('scroll_down').setLabel('⬇️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('yt_play').setLabel('⏯️ Play/Pause').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('go_back_btn').setLabel('⬅️ Back').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('press_enter').setLabel('⏎ Enter').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('yt_f').setLabel('📺 Full').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );

        const payload = { 
            content: `🌐 **Live:** \`${currentPage.url()}\` ${isStreaming ? '🟢 STREAMING' : ''}`, 
            files: [new AttachmentBuilder(path)], 
            components: [row1, row2] 
        };
        
        if (interaction) await interaction.editReply(payload);
        else if (message) {
            if (message.editable && isStreaming) await message.edit(payload).catch(() => {});
            else await message.reply(payload).catch(() => {});
        }
        
        if (fs.existsSync(path)) setTimeout(() => fs.unlinkSync(path), 2000);
    } catch (err) { console.error(err); }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // COMMAND: !TERMINAL
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);
        const live = await message.reply("⚡ **Executing...**");
        let buffer = "";
        if (activeProcess) activeProcess.kill();
        activeProcess = spawn(cmd, { shell: true, cwd: PUBLIC_DIR, env: { ...process.env, TERM: 'xterm-256color' } });
        const intv = setInterval(() => {
            if (buffer.trim()) live.edit(`\`\`\`bash\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(() => {});
        }, 2000);
        activeProcess.stdout.on('data', d => buffer += d.toString());
        activeProcess.stderr.on('data', d => buffer += d.toString());
        activeProcess.on('close', (code) => {
            clearInterval(intv);
            live.edit(`\`\`\`bash\n${stripAnsi(buffer).slice(-1900)}\n\`\`\`\n**Code:** ${code}`).catch(() => {});
            activeProcess = null;
        });
        return;
    }

    // COMMAND: ?STREAM (VC Join + Slideshow)
    if (msg.toLowerCase() === '?stream') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply("🚨 Pehle VC mein aao!");
        if (!currentPage) return message.reply("🚨 Pehle `?screenshot [url]` chalao!");

        isStreaming = !isStreaming;
        if (isStreaming) {
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });
            const streamMsg = await message.reply("🛰️ **Stream Starting...**");
            streamInterval = setInterval(async () => {
                if (!isStreaming) return clearInterval(streamInterval);
                await captureAndSend(streamMsg);
            }, 4000); // 4s for stability
        } else {
            clearInterval(streamInterval);
            message.reply("🛑 Stream Stopped.");
        }
        return;
    }

    // COMMAND: SMART TAGS CLICKING
    if (currentPage && !msg.startsWith('?')) {
        if (/^\d+$/.test(msg)) {
            const coords = await currentPage.evaluate((id) => {
                const found = window.renzuElements ? window.renzuElements.find(e => e.id === id) : null;
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

// --- INTERACTION BUTTONS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate();
    if (!currentPage) return;

    if (interaction.customId === 'scroll_down') await currentPage.evaluate(() => window.scrollBy(0, 500));
    if (interaction.customId === 'scroll_up') await currentPage.evaluate(() => window.scrollBy(0, -500));
    if (interaction.customId === 'press_enter') await currentPage.keyboard.press('Enter');
    if (interaction.customId === 'go_back_btn') await currentPage.goBack();
    if (interaction.customId === 'yt_play') await currentPage.keyboard.press('k');
    if (interaction.customId === 'yt_f') await currentPage.keyboard.press('f');
    if (interaction.customId === 'close_browser') {
        isStreaming = false;
        clearInterval(streamInterval);
        if (currentBrowser) await currentBrowser.close();
        currentBrowser = null; currentPage = null;
        return interaction.followUp("🛑 Stopped.");
    }
    await captureAndSend(null, null, interaction);
});

client.login(process.env.TOKEN);
