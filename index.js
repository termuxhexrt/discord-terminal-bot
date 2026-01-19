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
    console.log(`Bot is online! Sab log commands use kar sakte hain.`);
});

client.on('messageCreate', async (message) => {
    // Bot khud ke messages ko ignore karega taaki loop na bane
    if (message.author.bot) return;

    // Jo bhi message "!" se start hoga, wo execute hoga
    if (message.content.startsWith('!')) {
        const cmd = message.content.slice(1); // Ex: "!ls" -> "ls"

        // Direct Real Terminal Execution
        exec(cmd, { shell: '/bin/bash' }, (error, stdout, stderr) => {
            let response = "";
            
            if (error) response += `**Error:**\n\`\`\`\n${error.message}\n\`\`\`\n`;
            if (stderr) response += `**Stderr:**\n\`\`\`\n${stderr}\n\`\`\`\n`;
            if (stdout) response += `**Output:**\n\`\`\`\n${stdout}\n\`\`\`\n`;

            if (response.length > 2000) {
                message.reply("Output kaafi bada hai, pura nahi bhej sakta.");
                message.channel.send(response.substring(0, 1900));
            } else {
                message.reply(response || "Command successfully chali, par output kuch nahi aaya.");
            }
        });
    }
});

client.login(process.env.TOKEN);
