const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null; 

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

client.on('ready', () => console.log(`Bot online! Screenshot feature ready.`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // --- SCREENSHOT COMMAND ---
    if (msg.toLowerCase().startsWith('?screenshot')) {
        const url = msg.split(' ')[1];
        if (!url) return message.reply("URL toh de bhai!");

        const waitMsg = await message.reply("📸 Capturing... (Cloud pe thoda time lagta hai)");
        let browser;

        try {
            browser = await puppeteer.launch({
                executablePath: '/usr/bin/google-chrome', // Agar custom path chahiye ho
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            await page.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2', timeout: 60000 });
            
            const path = `${PUBLIC_DIR}/screen.png`;
            await page.screenshot({ path });
            
            const file = new AttachmentBuilder(path);
            await message.reply({ files: [file] });
            waitMsg.delete().catch(() => {});
        } catch (err) {
            console.error(err);
            waitMsg.edit(`❌ Error: ${err.message.split('\n')[0]}`);
        } finally {
            if (browser) await browser.close(); // Zombie process preventer
        }
        return;
    }

    // --- SMART INPUT ---
    if (activeProcess && !msg.startsWith('!') && !msg.startsWith('?')) {
        activeProcess.stdin.write(msg + '\n');
        return message.react('📥').catch(() => {});
    }

    // --- TERMINAL EXECUTION ---
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1).trim();
        if (activeProcess) activeProcess.kill();

        const live = await message.reply("⚡ Executing...");
        activeProcess = spawn('/bin/bash', ['-c', cmd], { cwd: PUBLIC_DIR, env: { ...process.env, TERM: 'xterm' } });

        let buffer = "";
        const interval = setInterval(() => {
            if (buffer.trim()) live.edit(`\`\`\`\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(() => {});
        }, 2500);

        activeProcess.stdout.on('data', (d) => buffer += d);
        activeProcess.stderr.on('data', (d) => buffer += d);
        activeProcess.on('close', (c) => {
            clearInterval(interval);
            activeProcess = null;
            message.channel.send(`✅ Done (Code: ${c})`);
        });
    }

    // --- SYSTEM COMMANDS ---
    if (msg === '?status') {
        exec('df -h /app/storage', (e, out) => {
            const s = out ? out.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A","N/A","0%"];
            message.reply(`📊 Storage: ${s[4] || '0%'} | RAM: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)}MB`);
        });
    }

    if (msg === '?stop') {
        if (activeProcess) { activeProcess.kill('SIGKILL'); activeProcess = null; return message.reply("🛑 Stopped."); }
        message.reply("Kuch nahi chal raha.");
    }
});

client.login(process.env.TOKEN);
