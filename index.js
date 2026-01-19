const { Client, GatewayIntentBits } = require('discord.js');
const { exec } = require('child_process');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
const FOLDER_ID = '12WNvwLFXzihn4f6ePz9kRNhQXb1tkVZp';
let activeProcess = null; // Current command track karne ke liye

// Google Drive Auth
const driveJson = JSON.parse(process.env.GOOGLE_DRIVE_JSON);
const auth = new google.auth.JWT(
    driveJson.client_email,
    null,
    driveJson.private_key,
    ['https://www.googleapis.com/auth/drive']
);
const drive = google.drive({ version: 'v3', auth });

// --- AUTO-SYNC LOGIC ---
async function autoSync() {
    console.log("Auto-Sync starting...");
    try {
        const files = fs.readdirSync(PUBLIC_DIR);
        for (const file of files) {
            const filePath = `${PUBLIC_DIR}/${file}`;
            if (fs.lstatSync(filePath).isFile()) {
                await drive.files.create({
                    requestBody: { name: file, parents: [FOLDER_ID] },
                    media: { body: fs.createReadStream(filePath) }
                });
                console.log(`Auto-Synced: ${file}`);
            }
        }
    } catch (err) {
        console.error("Sync Error:", err.message);
    }
}
setInterval(autoSync, 10 * 60 * 1000);

client.on('ready', () => {
    console.log(`Bot online! Default path: ${PUBLIC_DIR}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.toLowerCase();

    // --- ? STATUS COMMAND ---
    if (msg === '?status') {
        exec('df -h /app/storage', async (error, stdout) => {
            let storageInfo = stdout ? stdout.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A", "N/A", "N/A", "N/A"];
            let driveStatus = "Checking...";
            try { 
                await drive.about.get({ fields: 'user' }); 
                driveStatus = "✅ Connected"; 
            } catch (e) { driveStatus = "❌ Error"; }

            message.reply(`📊 **SYSTEM STATUS**\n💾 Disk: ${storageInfo[4] || '0%'} used\n☁️ Drive: ${driveStatus}\n🤖 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        });
        return;
    }

    // --- ? STOP COMMAND (The Kill Switch) ---
    if (msg === '?stop') {
        if (activeProcess) {
            activeProcess.kill('SIGINT'); // Ctrl+C signal
            activeProcess = null;
            return message.reply("🛑 **Emergency Stop!** Saari running commands band kar di gayi hain.");
        } else {
            // Backup kill just in case
            exec('pkill -u root'); 
            return message.reply("Bhai, koi active process nahi mila, par maine safety ke liye cleanup command chala di hai.");
        }
    }

    // --- ! TERMINAL COMMANDS ---
    if (message.content.startsWith('!')) {
        const fullCmd = message.content.slice(1);
        
        message.channel.sendTyping(); // Bot is thinking...

        activeProcess = exec(fullCmd, { shell: '/bin/bash', cwd: PUBLIC_DIR }, (error, stdout, stderr) => {
            activeProcess = null; // Command khatam
            let out = stdout || stderr;
            if (out) {
                if (out.length > 1900) {
                    const truncated = out.substring(0, 1900) + "\n...[Output too long]";
                    message.reply(`\`\`\`\n${truncated}\n\`\`\``);
                } else {
                    message.reply(`\`\`\`\n${out}\n\`\`\``);
                }
            } else {
                message.reply(error ? `❌ Error: ${error.message}` : "✅ Command executed (No output).");
            }
        });
    }
});

client.login(process.env.TOKEN);
