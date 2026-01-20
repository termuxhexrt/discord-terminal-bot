const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
require('dotenv').config();

// --- SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Renzu Live Terminal Active 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- MULTI-TERMINAL SYSTEM ---
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

    // 1. HELP & STATUS
    if (msg === '?help') {
        return message.reply({ 
            embeds: [new EmbedBuilder().setTitle("🖥️ Renzu OS").setDescription("`! <cmd>` for Live Terminal. Just type numbers to interact.")], 
            components: getTerminalButtons() 
        });
    }

    if (msg === '?status') {
        let status = Object.keys(terminals).map(id => `T${id}: ${terminals[id].process ? '🔴' : '🟢'}`).join(' | ');
        return message.reply(`📊 **Status:** ${status}\nActive: **T${activeId}**`);
    }

    // 2. LIVE EXECUTION LOGIC
    if (msg.startsWith('!')) {
        const cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        if (terminals[activeId].process) return message.reply(`T${activeId} is Busy!`);

        terminals[activeId].buffer = `> ${cmd}\n`;
        terminals[activeId].message = await message.reply({
            content: `🖥️ **Live T${activeId}:**\n\`\`\`bash\nStarting...\n\`\`\``,
            components: getTerminalButtons()
        });

        // Pseudo-TTY mode simulation for better progress bars
        terminals[activeId].process = spawn(cmd, { 
            shell: true, 
            env: { ...process.env, TERM: 'xterm', FORCE_COLOR: 'true' } 
        });

        const updateTerminal = async () => {
            let current = terminals[activeId];
            if (!current.message) return;
            
            let display = stripAnsi(current.buffer).slice(-1900);
            if (display !== current.lastSent && display.length > 0) {
                current.lastSent = display;
                await current.message.edit({
                    content: `🖥️ **Live T${activeId}:**\n\`\`\`bash\n${display}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => {});
            }
        };

        // Stream from both stdout and stderr (important for git/progress)
        terminals[activeId].process.stdout.on('data', (d) => { terminals[activeId].buffer += d.toString(); });
        terminals[activeId].process.stderr.on('data', (d) => { terminals[activeId].buffer += d.toString(); });

        const streamInterval = setInterval(updateTerminal, 1500);

        terminals[activeId].process.on('close', (code) => {
            clearInterval(streamInterval);
            setTimeout(updateTerminal, 500);
            message.channel.send(`🏁 **T${activeId} Finished** (Code: ${code})`);
            terminals[activeId].process = null;
        });
        return;
    }

    // 3. INTERACTIVE INPUT (Bina prefix ke kaam karega)
    if (terminals[activeId].process && !msg.startsWith('?')) {
        terminals[activeId].process.stdin.write(msg + '\n');
        return message.react('✅');
    }
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.customId.startsWith('sw_')) {
        activeId = parseInt(i.customId.split('_')[1]);
        await i.update({ content: `🔄 Focus: **Terminal ${activeId}**`, components: getTerminalButtons() });
    } else if (i.customId === 'kill_term' && terminals[activeId].process) {
        terminals[activeId].process.kill();
        await i.reply({ content: `🛑 T${activeId} Killed`, ephemeral: true });
    } else if (i.customId === 'clear_term') {
        terminals[activeId].buffer = "";
        await i.update({ content: `🧹 T${activeId} Cleared`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
