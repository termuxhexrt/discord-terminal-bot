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
                // Check if already uploaded (basic check)
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

// Har 10 minute mein sync chalega
setInterval(autoSync, 10 * 60 * 1000);

client.on('ready', () => {
    console.log(`Bot online! Default path: ${PUBLIC_DIR}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ?status Command
    if (message.content.toLowerCase() === '?status') {
        exec('df -h /app/storage', async (error, stdout) => {
            let storageInfo = stdout ? stdout.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A", "N/A", "N/A", "N/A"];
            let driveStatus = "Checking...";
            try { 
                await drive.about.get({ fields: 'user' }); 
                driveStatus = "✅ Connected (15GB Sync ON)"; 
            } catch (e) { driveStatus = "❌ Error"; }

            message.reply(`📊 **STATUS**\n💾 Volume: ${storageInfo[4] || '0%'} used\n☁️ Drive: ${driveStatus}\n🤖 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        });
        return;
    }

    // ! Terminal Commands
    if (message.content.startsWith('!')) {
        const fullCmd = message.content.slice(1);
        exec(fullCmd, { shell: '/bin/bash', cwd: PUBLIC_DIR }, (error, stdout, stderr) => {
            let out = stdout || stderr;
            if (out) {
                if (out.length > 1900) return message.reply("Output too long, check logs.");
                message.reply(`\`\`\`\n${out}\n\`\`\``);
            } else {
                message.reply(error ? `Error: ${error.message}` : "Command executed (No output - maybe directory is empty).");
            }
        });
    }
});

client.login(process.env.TOKEN);
