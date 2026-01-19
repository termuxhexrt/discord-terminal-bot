const { Client, GatewayIntentBits } = require('discord.js');
const { exec } = require('child_process'); 
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`Bot is online! Default directory: /app/storage/public_root`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!')) {
        const cmd = message.content.slice(1);

        // FIX: 'cwd' set karne se bot hamesha public folder mein rahega
        // Isse system files safe rahengi aur data hamesha save hoga
        exec(cmd, { 
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
});

client.login(process.env.TOKEN);
