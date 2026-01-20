const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('Renzu Ultra-Live OS 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let terminals = {
    1: { process: null, buffer: "", message: null, lastSent: "" },
    2: { process: null, buffer: "", message: null, lastSent: "" },
    3: { process: null, buffer: "", message: null, lastSent: "" },
    4: { process: null, buffer: "", message: null, lastSent: "" }
};
let activeId = 1;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

function getTerminalButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sw_1').setLabel('T1').setStyle(activeId === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sw_2').setLabel('T2').setStyle(activeId === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sw_3').setLabel('T3').setStyle(activeId === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sw_4').setLabel('T4').setStyle(activeId === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('kill_term').setLabel('🛑 Kill Active').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('clear_term').setLabel('🧹 Clear Screen').setStyle(ButtonStyle.Success)
        )
    ];
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    if (msg === '?help') {
        return message.reply({ 
            embeds: [new EmbedBuilder().setTitle("🖥️ Renzu OS - Ultra Live").setDescription("`! <cmd>` for Live Stream. Interaction is direct.")], 
            components: getTerminalButtons() 
        });
    }

    if (msg === '?status') {
        let status = Object.keys(terminals).map(id => `T${id}: ${terminals[id].process ? '🔴' : '🟢'}`).join(' | ');
        return message.reply(`📊 **System:** ${status}\nFocus: **Terminal ${activeId}**`);
    }

    if (msg.startsWith('!')) {
        let cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        // FORCE PROGRESS FIX: Agar git clone hai toh --progress add karo
        if (cmd.includes('git clone') && !cmd.includes('--progress')) {
            cmd = cmd.replace('git clone', 'git clone --progress');
        }

        if (terminals[activeId].process) return message.reply(`⚠️ T${activeId} is busy!`);

        terminals[activeId].buffer = `> ${cmd}\n`;
        terminals[activeId].message = await message.reply({
            content: `🖥️ **Ultra-Live T${activeId}:**\n\`\`\`bash\nConnecting to Stream...\n\`\`\``,
            components: getTerminalButtons()
        });

        // Use 'stdbuf' to disable buffering and make it truly real-time
        terminals[activeId].process = spawn(`stdbuf -oL -eL ${cmd}`, { 
            shell: true, 
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1', LANG: 'en_US.UTF-8' } 
        });

        const updateUI = async () => {
            let t = terminals[activeId];
            if (!t.message) return;
            
            let output = stripAnsi(t.buffer).slice(-1900);
            if (output !== t.lastSent && output.length > 0) {
                t.lastSent = output;
                await t.message.edit({
                    content: `🖥️ **Live Stream T${activeId}:**\n\`\`\`bash\n${output}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => {});
            }
        };

        const streamInterval = setInterval(updateUI, 1200); // 1.2s update for smoothness

        terminals[activeId].process.stdout.on('data', (d) => { terminals[activeId].buffer += d.toString(); });
        terminals[activeId].process.stderr.on('data', (d) => { terminals[activeId].buffer += d.toString(); });

        terminals[activeId].process.on('close', (code) => {
            clearInterval(streamInterval);
            setTimeout(updateUI, 500);
            message.channel.send(`🏁 **T${activeId} Execution Finished.**`);
            terminals[activeId].process = null;
        });
        return;
    }

    if (terminals[activeId].process && !msg.startsWith('?')) {
        terminals[activeId].process.stdin.write(msg + '\n');
        return message.react('✅');
    }
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.customId.startsWith('sw_')) {
        activeId = parseInt(i.customId.split('_')[1]);
        await i.update({ content: `🔄 Focus Switched: **Terminal ${activeId}**`, components: getTerminalButtons() });
    } else if (i.customId === 'kill_term' && terminals[activeId].process) {
        terminals[activeId].process.kill();
        terminals[activeId].process = null;
        await i.update({ content: `🛑 T${activeId} Killed`, components: getTerminalButtons() });
    } else if (i.customId === 'clear_term') {
        terminals[activeId].buffer = "";
        await i.update({ content: `🧹 T${activeId} Buffer Cleared`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
