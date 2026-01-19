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

client.on('ready', () => console.log(`🚀 Renzu Terminal Online! Debugging enabled.`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // --- SCREENSHOT COMMAND ---
    if (msg.toLowerCase().startsWith('?screenshot')) {
        const url = msg.split(' ')[1];
        if (!url) return message.reply("❌ URL missing! Example: `?screenshot google.com` ");

        const waitMsg = await message.reply("📸 Opening headless browser...");
        let browser;

        try {
            browser = await puppeteer.launch({
                // Railway/Docker ke liye default chromium use karna best hai
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });
            
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            console.log(`Navigating to: ${url}`);
            await page.goto(url.startsWith('http') ? url : `https://${url}`, { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
            
            const path = `${PUBLIC_DIR}/screen_${Date.now()}.png`; // Unique filename to avoid cache issues
            await page.screenshot({ path });
            
            const file = new AttachmentBuilder(path);
            await message.reply({ content: `✅ Result for: ${url}`, files: [file] });
            
            // Clean up file after sending
            setTimeout(() => fs.unlinkSync(path), 5000);
            waitMsg.delete().catch(() => {});

        } catch (err) {
            console.error("SCREENSHOT ERROR:", err);
            // Discord par detailed error bhej raha hai
            const errorReport = `❌ **Screenshot Failed!**\n\`\`\`js\n${err.message}\n\`\`\`\n*Check console for full stack trace.*`;
            waitMsg.edit(errorReport);
        } finally {
            if (browser) await browser.close();
        }
        return;
    }

    // --- SMART INPUT ---
    if (activeProcess && !msg.startsWith('!') && !msg.startsWith('?')) {
        try {
            activeProcess.stdin.write(msg + '\n');
            return message.react('📥');
        } catch (err) {
            message.reply(`❌ Input Error: ${err.message}`);
        }
    }

    // --- TERMINAL EXECUTION ---
    if (msg.startsWith('!')) {
        const cmd = msg.slice(1).trim();
        if (activeProcess) activeProcess.kill();

        const live = await message.reply("⚡ Executing...");
        
        activeProcess = spawn('/bin/bash', ['-c', cmd], { 
            cwd: PUBLIC_DIR, 
            env: { ...process.env, TERM: 'xterm' } 
        });

        let buffer = "";
        const interval = setInterval(() => {
            if (buffer.trim()) {
                const clean = stripAnsi(buffer).slice(-1900);
                live.edit(`\`\`\`\n${clean}\n\`\`\``).catch(() => {});
            }
        }, 2500);

        activeProcess.stdout.on('data', (d) => buffer += d);
        activeProcess.stderr.on('data', (d) => buffer += d);

        activeProcess.on('error', (err) => {
            message.reply(`❌ **Failed to start process:** ${err.message}`);
        });

        activeProcess.on('close', (c) => {
            clearInterval(interval);
            activeProcess = null;
            message.channel.send(`✅ **Command Finished** (Exit Code: ${c})`);
        });
    }

    // --- STATUS & STOP ---
    if (msg === '?status') {
        exec('df -h /app/storage', (e, out) => {
            const s = out ? out.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A","N/A","0%"];
            message.reply(`📊 Storage: ${s[4] || '0%'} | RAM: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)}MB`);
        });
    }

    if (msg === '?stop') {
        if (activeProcess) { 
            activeProcess.kill('SIGKILL'); 
            activeProcess = null; 
            return message.reply("🛑 Process killed forcefully."); 
        }
        message.reply("Bhai, filhal koi process active nahi hai.");
    }
});

client.login(process.env.TOKEN);
