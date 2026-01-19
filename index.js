const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer'); // Browser engine
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null; 

function stripAnsi(text) {
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

client.on('ready', () => console.log(`Bot online! Screenshot feature ready.`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msgContent = message.content.trim();

    // --- SCREENSHOT COMMAND (?) ---
    if (msgContent.toLowerCase().startsWith('?screenshot')) {
        const url = msgContent.split(' ')[1];
        if (!url) return message.reply("Bhai, URL toh de! Example: `?screenshot https://google.com` ");

        const waitMsg = await message.reply("📸 Browser open kar raha hoon, thoda sabar rakh...");

        try {
            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'] // Cloud compatibility
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            await page.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2' });
            
            const screenshotPath = `${PUBLIC_DIR}/screenshot.png`;
            await page.screenshot({ path: screenshotPath });
            await browser.close();

            const attachment = new AttachmentBuilder(screenshotPath);
            await message.reply({ content: `✅ Ye raha **${url}** ka live view:`, files: [attachment] });
            waitMsg.delete().catch(() => {});
        } catch (err) {
            waitMsg.edit(`❌ Error: ${err.message}`);
        }
        return;
    }

    // --- SMART INPUT ---
    if (activeProcess && !msgContent.startsWith('!') && !msgContent.startsWith('?')) {
        activeProcess.stdin.write(msgContent + '\n');
        return message.react('📥').catch(() => {});
    }

    // --- STATUS & STOP ---
    if (msgContent.toLowerCase() === '?status') {
        exec('df -h /app/storage', (error, stdout) => {
            let storage = stdout ? stdout.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A","N/A","0%"];
            message.reply(`📊 **Storage:** ${storage[4] || '0%'} Used | **RAM:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        });
        return;
    }

    if (msgContent.toLowerCase() === '?stop') {
        if (activeProcess) {
            activeProcess.kill('SIGKILL');
            activeProcess = null;
            return message.reply("🛑 **Killed!**");
        }
        return message.reply("Bhai, kuch chal hi nahi raha.");
    }

    // --- TERMINAL (!) ---
    if (msgContent.startsWith('!')) {
        const fullCmd = msgContent.slice(1).trim();
        if (activeProcess) activeProcess.kill();

        const liveMsg = await message.reply("⚡ **Executing...**");
        activeProcess = spawn('/bin/bash', ['-c', fullCmd], { 
            cwd: PUBLIC_DIR,
            env: { ...process.env, TERM: 'xterm' }
        });

        let outputBuffer = "";
        const updateOutput = () => {
            if (outputBuffer.trim().length > 0) {
                const clean = stripAnsi(outputBuffer).slice(-1900);
                liveMsg.edit(`\`\`\`\n${clean}\n\`\`\``).catch(() => {});
            }
        };

        const logInterval = setInterval(updateOutput, 2500);
        activeProcess.stdout.on('data', (data) => { outputBuffer += data.toString(); });
        activeProcess.stderr.on('data', (data) => { outputBuffer += data.toString(); });
        activeProcess.on('close', (code) => {
            clearInterval(logInterval);
            activeProcess = null;
            updateOutput();
            message.channel.send(`✅ **Finished** (Code: ${code})`);
        });
    }
});

client.login(process.env.TOKEN);
