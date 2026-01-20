const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
require('dotenv').config();

// --- WEB SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Renzu Terminal Online'));
app.listen(process.env.PORT || 3000);

// --- PUPPETEER STEALTH ---
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

const STORAGE = '/app/storage';
const PUBLIC_DIR = path.join(STORAGE, 'public_root');
const USER_DATA = path.join(STORAGE, 'user_data');
[PUBLIC_DIR, USER_DATA].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

let currentBrowser = null, currentPage = null, isStreaming = false, streamInterval = null, activeProcess = null;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- SMART TAGS (Captcha Bypass Ready) ---
async function applySmartTags(page) {
    try {
        await page.evaluate(() => {
            document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
            window.renzuElements = [];
            let idCounter = 1;
            const selectors = 'button, input, a, [role="button"], textarea, li, [role="option"], canvas, .g-recaptcha';
            document.querySelectorAll(selectors).forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 2 && rect.height > 2 && window.getComputedStyle(el).visibility !== 'hidden') {
                    const id = idCounter++;
                    const tag = document.createElement('div');
                    tag.className = 'renzu-tag';
                    tag.style = `position: absolute; left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px;
                        background: #FFD700; color: black; font-weight: bold; border: 1px solid black;
                        padding: 1px 3px; z-index: 9999999; font-size: 12px; border-radius: 3px; pointer-events: none;`;
                    tag.innerText = id;
                    document.body.appendChild(tag);
                    window.renzuElements.push({ id, x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
                }
            });
        });
    } catch (e) {}
}

// --- VIRTUAL STREAMING ENGINE ---
async function broadcast(message, interaction = null) {
    try {
        if (!currentPage) return;
        await applySmartTags(currentPage);
        
        const framePath = path.join(PUBLIC_DIR, `frame_${Date.now()}.jpg`);
        await currentPage.screenshot({ path: framePath, type: 'jpeg', quality: 50 });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sc_up').setLabel('⬆️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sc_down').setLabel('⬇️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('yt_play').setLabel('⏯️ Play').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('go_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('enter').setLabel('⏎ Enter').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('yt_full').setLabel('📺 Full').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('stop_all').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );

        const payload = { 
            content: `📡 **Live:** \`${currentPage.url()}\` ${isStreaming ? '🟢' : ''}`, 
            files: [new AttachmentBuilder(framePath)], 
            components: [row1, row2] 
        };

        if (interaction) await interaction.editReply(payload);
        else if (message?.editable) await message.edit(payload).catch(() => {});
        else if (message) await message.reply(payload);

        if (fs.existsSync(framePath)) setTimeout(() => fs.unlinkSync(framePath), 3000);
    } catch (err) { console.error("Broadcast Error:", err); }
}

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const content = msg.content.trim();

    // 1. TERMINAL RESTORED (!)
    if (content.startsWith('!')) {
        const cmd = content.slice(1);
        const terminalMsg = await msg.reply("💻 **Executing...**");
        let output = "";
        if (activeProcess) activeProcess.kill();
        activeProcess = spawn(cmd, { shell: true, cwd: STORAGE });
        
        const updateLog = () => {
            if (output.trim()) terminalMsg.edit(`\`\`\`bash\n${stripAnsi(output).slice(-1900)}\n\`\`\``).catch(() => {});
        };
        const logIntv = setInterval(updateLog, 2000);

        activeProcess.stdout.on('data', d => output += d);
        activeProcess.stderr.on('data', d => output += d);
        activeProcess.on('close', (code) => {
            clearInterval(logIntv);
            updateLog();
            terminalMsg.edit(terminalMsg.content + `\n**Process Exit:** ${code}`);
            activeProcess = null;
        });
        return;
    }

    // 2. VC STREAM (?stream)
    if (content.toLowerCase() === '?stream') {
        const vc = msg.member.voice.channel;
        if (!vc) return msg.reply("🚨 VC join karo!");
        if (!currentPage) return msg.reply("🚨 Pehle `?screenshot google.com` chalao.");

        isStreaming = !isStreaming;
        if (isStreaming) {
            joinVoiceChannel({ channelId: vc.id, guildId: vc.guild.id, adapterCreator: vc.guild.voiceAdapterCreator });
            const sMsg = await msg.reply("🚀 **Virtual Screening Active!**");
            streamInterval = setInterval(() => broadcast(sMsg), 3800);
        } else {
            clearInterval(streamInterval);
            msg.reply("🛑 Stream stopped.");
        }
        return;
    }

    // 3. TAG CLICK & TYPE
    if (currentPage && !content.startsWith('?')) {
        if (/^\d+$/.test(content)) {
            const pos = await currentPage.evaluate(id => {
                const e = window.renzuElements?.find(x => x.id === id);
                return e ? { x: e.x, y: e.y } : null;
            }, parseInt(content));
            if (pos) await currentPage.mouse.click(pos.x, pos.y);
        } else {
            await currentPage.keyboard.type(content, { delay: 50 });
        }
        if (!isStreaming) await broadcast(msg);
        return;
    }

    if (content.startsWith('?screenshot')) await broadcast(msg, null, content.split(' ')[1]);
});

// --- BUTTONS ---
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    await i.deferUpdate();
    if (!currentPage) return;

    if (i.customId === 'sc_down') await currentPage.evaluate(() => window.scrollBy(0, 500));
    if (i.customId === 'yt_play') await currentPage.keyboard.press('k');
    if (i.customId === 'stop_all') {
        isStreaming = false; clearInterval(streamInterval);
        await currentBrowser.close(); currentBrowser = null; currentPage = null;
        return i.followUp("Session Terminated.");
    }
    if (!isStreaming) await broadcast(null, i);
});

client.login(process.env.TOKEN);
