const { Client, GatewayIntentBits } = require('discord.js');
const { spawn, exec } = require('child_process');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null; 

// --- ANSI STRIPPER (Saaf output ke liye) ---
function stripAnsi(text) {
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

client.on('ready', () => console.log(`Bot online! Root: ${PUBLIC_DIR}`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msgContent = message.content.trim();
    
    // --- 1. SMART INPUT (Jab process chal raha ho) ---
    if (activeProcess && !msgContent.startsWith('!') && !msgContent.startsWith('?')) {
        activeProcess.stdin.write(msgContent + '\n');
        // Acknowledgment ke liye ek reaction de sakte ho
        return message.react('📥').catch(() => {});
    }

    // --- 2. COMMANDS (?) ---
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
            return message.reply("🛑 **Killed!** Process ko forcefully band kar diya gaya hai.");
        }
        return message.reply("Bhai, kuch chal hi nahi raha.");
    }

    // --- 3. TERMINAL (!) ---
    if (msgContent.startsWith('!')) {
        const fullCmd = msgContent.slice(1).trim();
        
        // Agar pehle se koi process chal raha hai, usse pehle kill karo
        if (activeProcess) {
            activeProcess.kill();
        }

        const liveMsg = await message.reply("⚡ **Executing...**");
        
        // Bash shell ke through command chalana better hota hai
        activeProcess = spawn('/bin/bash', ['-c', fullCmd], { 
            cwd: PUBLIC_DIR,
            env: { ...process.env, TERM: 'xterm' } // Terminal environment simulate karne ke liye
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
            message.channel.send(`✅ **Finished** (Exit Code: ${code})`);
        });

        activeProcess.on('error', (err) => {
            message.channel.send(`❌ **Process Error:** ${err.message}`);
        });
    }
});

client.login(process.env.TOKEN);
