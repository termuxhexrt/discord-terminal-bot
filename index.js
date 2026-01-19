const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { spawn, exec } = require('child_process');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
const FOLDER_ID = '12WNvwLFXzihn4f6ePz9kRNhQXb1tkVZp';
let activeProcess = null; 

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
    try {
        const files = fs.readdirSync(PUBLIC_DIR);
        for (const file of files) {
            const filePath = `${PUBLIC_DIR}/${file}`;
            if (fs.lstatSync(filePath).isFile()) {
                await drive.files.create({
                    requestBody: { name: file, parents: [FOLDER_ID] },
                    media: { body: fs.createReadStream(filePath) }
                });
            }
        }
    } catch (err) { console.error("Sync Error:", err.message); }
}
setInterval(autoSync, 10 * 60 * 1000);

client.on('ready', () => console.log(`Bot online! Default path: ${PUBLIC_DIR}`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const lowerMsg = message.content.toLowerCase();

    // ? HELP
    if (lowerMsg === '?help') {
        return message.reply("🛠️ **Commands:** `! <cmd>` (Terminal), `?status`, `?stop` (Kill Process)");
    }

    // ? STATUS
    if (lowerMsg === '?status') {
        exec('df -h /app/storage', async (error, stdout) => {
            let storageInfo = stdout ? stdout.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A", "N/A", "N/A", "N/A"];
            message.reply(`📊 **STATUS**\n💾 Volume: ${storageInfo[4] || '0%'} used\n🤖 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        });
        return;
    }

    // ? STOP
    if (lowerMsg === '?stop') {
        if (activeProcess) {
            activeProcess.kill('SIGINT');
            activeProcess = null;
            return message.reply("🛑 **Emergency Stop!** Process killed.");
        }
        return message.reply("Bhai, kuch chal hi nahi raha.");
    }

    // ! TERMINAL (LIVE LOGS MODE)
    if (message.content.startsWith('!')) {
        const fullCmd = message.content.slice(1).trim();
        const liveMsg = await message.reply("🚀 Starting process...");

        // spawn is better for continuous logs
        activeProcess = spawn(fullCmd, { shell: true, cwd: PUBLIC_DIR });

        let outputBuffer = "";
        
        // Output ko update karne ka function
        const updateOutput = () => {
            if (outputBuffer.trim().length > 0) {
                const cleanOutput = outputBuffer.slice(-1800); // Last 1800 chars to avoid Discord limit
                liveMsg.edit(`\`\`\`\n${cleanOutput}\n\`\`\``).catch(() => {});
            }
        };

        // Har 2 second mein Discord message update hoga
        const logInterval = setInterval(updateOutput, 2000);

        activeProcess.stdout.on('data', (data) => { outputBuffer += data.toString(); });
        activeProcess.stderr.on('data', (data) => { outputBuffer += data.toString(); });

        activeProcess.on('close', (code) => {
            clearInterval(logInterval);
            activeProcess = null;
            updateOutput(); // Final update
            message.channel.send(`✅ Process finished (Code: ${code})`);
        });
    }
});

client.login(process.env.TOKEN);
