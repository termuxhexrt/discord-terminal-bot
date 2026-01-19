const { Client, GatewayIntentBits } = require('discord.js');
const { exec } = require('child_process');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Google Drive Auth Setup
const driveJson = JSON.parse(process.env.GOOGLE_DRIVE_JSON);
const auth = new google.auth.JWT(
    driveJson.client_email,
    null,
    driveJson.private_key,
    ['https://www.googleapis.com/auth/drive']
);
const drive = google.drive({ version: 'v3', auth });

client.on('ready', () => {
    console.log(`Bot is online! Default directory: /app/storage/public_root`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- SPECIAL STATUS COMMAND (Prefix: ?) ---
    if (message.content.toLowerCase() === '?status') {
        exec('df -h /app/storage', async (error, stdout) => {
            let storageInfo = stdout ? stdout.split('\n')[1].replace(/\s+/g, ' ').split(' ') : ["N/A", "N/A", "N/A", "N/A"];
            
            let driveStatus = "Checking...";
            try {
                await drive.about.get({ fields: 'user' });
                driveStatus = "✅ Connected (15GB Ready)";
            } catch (e) {
                driveStatus = "❌ Disconnected";
            }

            const statusEmbed = `
📊 **RENZU TERMINAL STATUS** 📊
---
💾 **Volume Storage (434MB):**
• Total: ${storageInfo[1] || 'N/A'}
• Used: ${storageInfo[2] || 'N/A'}
• Available: ${storageInfo[3] || 'N/A'}
• Usage: ${storageInfo[4] || '0%'}

☁️ **Google Drive:** ${driveStatus}

🤖 **System:**
• Uptime: ${Math.floor(process.uptime() / 60)} mins
• RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
---
*Use \`!\` for Terminal and \`?status\` for this menu.*`;
            
            return message.reply(statusEmbed);
        });
        return; 
    }

    // --- NORMAL COMMANDS (Prefix: !) ---
    if (message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'upload') {
            const fileName = args[0];
            if (!fileName) return message.reply("Bhai, file name toh batao!");

            const filePath = `/app/storage/public_root/${fileName}`;
            if (!fs.existsSync(filePath)) return message.reply("Bhai, file nahi mili.");

            try {
                const res = await drive.files.create({
                    requestBody: { name: fileName, parents: ['12WNvwLFXzihn4f6ePz9kRNhQXb1tkVZp'] },
                    media: { body: fs.createReadStream(filePath) }
                });
                message.reply(`✅ Drive par upload ho gayi! ID: \`${res.data.id}\``);
            } catch (err) {
                message.reply(`❌ Drive Error: ${err.message}`);
            }
        } 
        else {
            const fullCmd = message.content.slice(1);
            exec(fullCmd, { shell: '/bin/bash', cwd: '/app/storage/public_root' }, (error, stdout, stderr) => {
                let response = "";
                if (error) response += `**Error:**\n\`\`\`\n${error.message}\n\`\`\`\n`;
                if (stderr) response += `**Stderr:**\n\`\`\`\n${stderr}\n\`\`\`\n`;
                if (stdout) response += `**Output:**\n\`\`\`\n${stdout}\n\`\`\`\n`;

                if (response.length > 2000) {
                    message.reply("Output bada hai, bhej raha hoon...");
                    message.channel.send(response.substring(0, 1900));
                } else {
                    message.reply(response || "Done!");
                }
            });
        }
    }
});

client.login(process.env.TOKEN);
