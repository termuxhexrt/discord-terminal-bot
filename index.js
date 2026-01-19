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

    if (message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- GOOGLE DRIVE UPLOAD COMMAND ---
        if (command === 'upload') {
            const fileName = args[0];
            if (!fileName) return message.reply("Bhai, file name toh batao! (Example: !upload test.txt)");

            const filePath = `/app/storage/public_root/${fileName}`;

            if (!fs.existsSync(filePath)) {
                return message.reply("Bhai, ye file `public_root` mein nahi mili. Pehle file create karo.");
            }

            try {
                const res = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        parents: ['12WNvwLFXzihn4f6ePz9kRNhQXb1tkVZp'] // Tera Folder ID
                    },
                    media: {
                        body: fs.createReadStream(filePath)
                    }
                });
                message.reply(`✅ Drive par upload ho gayi! File ID: \`${res.data.id}\``);
            } catch (err) {
                message.reply(`❌ Drive Error: ${err.message}`);
            }
        } 
        
        // --- NORMAL TERMINAL COMMANDS ---
        else {
            const fullCmd = message.content.slice(1);
            exec(fullCmd, { 
                shell: '/bin/bash', 
                cwd: '/app/storage/public_root' 
            }, (error, stdout, stderr) => {
                let response = "";
                if (error) response += `**Error:**\n\`\`\`\n${error.message}\n\`\`\`\n`;
                if (stderr) response += `**Stderr:**\n\`\`\`\n${stderr}\n\`\`\`\n`;
                if (stdout) response += `**Output:**\n\`\`\`\n${stdout}\n\`\`\`\n`;

                if (response.length > 2000) {
                    message.reply("Output kaafi bada hai, substring bhej raha hoon...");
                    message.channel.send(response.substring(0, 1900));
                } else {
                    message.reply(response || "Command successfully chali, par output kuch nahi aaya.");
                }
            });
        }
    }
});

client.login(process.env.TOKEN);
