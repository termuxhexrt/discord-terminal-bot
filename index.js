const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null;
let currentBrowser = null;
let currentPage = null;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

client.on('ready', () => console.log(`🚀 Renzu Remote Control Online!`));

// Browser Control Function
async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
            currentBrowser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
            currentPage = await currentBrowser.newPage();
            await currentPage.setViewport({ width: 1280, height: 720 });
        }

        if (url) {
            await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2', timeout: 60000 });
        }

        const path = `${PUBLIC_DIR}/remote_${Date.now()}.png`;
        await currentPage.screenshot({ path });
        const file = new AttachmentBuilder(path);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scroll_up').setLabel('⬆️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('scroll_down').setLabel('⬇️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('click_center').setLabel('🖱️ Click').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('type_text').setLabel('⌨️ Type').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );

        const payload = { content: `🌐 **Live View:** ${url || ''}`, files: [file], components: [row] };
        
        if (interaction) await interaction.editReply(payload);
        else await message.reply(payload);

        setTimeout(() => { if (fs.existsSync(path)) fs.unlinkSync(path); }, 5000);
    } catch (err) {
        const errorMsg = `❌ **Browser Error:** ${err.message}`;
        if (interaction) interaction.followUp(errorMsg);
        else message.reply(errorMsg);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    if (msg.toLowerCase().startsWith('?screenshot')) {
        const url = msg.split(' ')[1];
        if (!url) return message.reply("URL toh de bhai!");
        await captureAndSend(message, url);
    }

    // Command/Input Handling
    if (activeProcess && !msg.startsWith('!') && !msg.startsWith('?')) {
        activeProcess.stdin.write(msg + '\n');
        return message.react('📥');
    }

    // Terminal Commands
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1).trim();
        if (activeProcess) activeProcess.kill();
        const live = await message.reply("⚡ Processing...");
        activeProcess = spawn('/bin/bash', ['-c', cmd], { cwd: PUBLIC_DIR, env: { ...process.env, TERM: 'xterm' } });
        let buffer = "";
        const interval = setInterval(() => {
            if (buffer.trim()) live.edit(`\`\`\`\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(() => {});
        }, 2500);
        activeProcess.on('close', (c) => { clearInterval(interval); activeProcess = null; });
    }

    if (msg === '?stop') {
        if (currentBrowser) { await currentBrowser.close(); currentBrowser = null; }
        if (activeProcess) { activeProcess.kill('SIGKILL'); activeProcess = null; }
        message.reply("🛑 Everything Stopped.");
    }
});

// Button Interactions (The "No-Command" Control)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate();

    try {
        if (interaction.customId === 'scroll_down') await currentPage.evaluate(() => window.scrollBy(0, 300));
        if (interaction.customId === 'scroll_up') await currentPage.evaluate(() => window.scrollBy(0, -300));
        if (interaction.customId === 'click_center') await currentPage.mouse.click(640, 360); // Middle of screen click
        
        if (interaction.customId === 'type_text') {
            await interaction.followUp("Bhai, kya type karna hai? Agla message jo tum bhejoge, wo browser mein type ho jayega.");
            const collector = interaction.channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30000 });
            collector.on('collect', async m => {
                await currentPage.keyboard.type(m.content);
                await m.react('⌨️');
                await captureAndSend(null, null, interaction);
            });
            return;
        }

        if (interaction.customId === 'close_browser') {
            await currentBrowser.close();
            currentBrowser = null;
            return interaction.followUp("🛑 Browser closed.");
        }

        await captureAndSend(null, null, interaction);
    } catch (err) {
        console.error(err);
    }
});

client.login(process.env.TOKEN);
