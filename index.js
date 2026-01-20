const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
const path = require('path');
require('dotenv').config();

// --- SERVER SETUP ---
const app = express();
app.get('/', (req, res) => res.send('Renzu Multi-OS is LIVE 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
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

// --- UI BUTTONS ---
function getTerminalButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sw_1').setLabel('T1').setStyle(activeId === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sw_2').setLabel('T2').setStyle(activeId === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sw_3').setLabel('T3').setStyle(activeId === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sw_4').setLabel('T4').setStyle(activeId === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kill_term').setLabel('🛑 Kill Active').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('clear_term').setLabel('🧹 Clear Screen').setStyle(ButtonStyle.Success)
    );
    return [row1, row2];
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    // 1. HELP & STATUS
    if (msg === '?help') {
        const help = new EmbedBuilder()
            .setTitle("⌨️ Renzu OS - Live Terminal")
            .setColor("#00FF00")
            .setDescription(`Focus: **Terminal ${activeId}**`)
            .addFields(
                { name: '🚀 Execute', value: '`! <cmd>` (Live update fixed)' },
                { name: '⌨️ Interact', value: 'Just type numbers/text' },
                { name: '🔄 Switch', value: 'Use T1-T4 buttons' }
            );
        return message.reply({ embeds: [help], components: getTerminalButtons() });
    }

    if (msg === '?status') {
        let statusStr = "";
        for (let id in terminals) {
            statusStr += `**T${id}:** ${terminals[id].process ? '🔴 Busy' : '🟢 Idle'}\n`;
        }
        return message.reply(`📊 **System Status:**\n${statusStr}`);
    }

    // 2. EXECUTION LOGIC (Live Fixed)
    if (msg.startsWith('!')) {
        const cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        if (terminals[activeId].process) {
            return message.reply(`⚠️ T${activeId} is busy. Use another terminal or kill it.`);
        }

        terminals[activeId].buffer = `> ${cmd}\n`;
        terminals[activeId].lastSent = "";
        terminals[activeId].message = await message.reply({
            content: `🖥️ **Terminal ${activeId} Starting...**\n\`\`\`bash\nInitializing Live Stream...\n\`\`\``,
            components: getTerminalButtons()
        });

        // FORCE PTYS/INTERACTIVE MODE
        terminals[activeId].process = spawn(cmd, { 
            shell: true, 
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' } 
        });

        const updateUI = () => {
            const currentTerminal = terminals[activeId];
            if (!currentTerminal.message) return;

            const cleanOutput = stripAnsi(currentTerminal.buffer).slice(-1900);
            
            // Only update if output changed to avoid Discord rate limits
            if (cleanOutput !== currentTerminal.lastSent && cleanOutput.trim() !== "") {
                currentTerminal.lastSent = cleanOutput;
                currentTerminal.message.edit({
                    content: `🖥️ **Live T${activeId}:**\n\`\`\`bash\n${cleanOutput}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => {});
            }
        };

        // Faster refresh for "Live" feel
        const interval = setInterval(updateUI, 1500);

        terminals[activeId].process.stdout.on('data', (d) => { terminals[activeId].buffer += d.toString(); });
        terminals[activeId].process.stderr.on('data', (d) => { terminals[activeId].buffer += d.toString(); });

        terminals[activeId].process.on('close', (code) => {
            clearInterval(interval);
            setTimeout(updateUI, 500); // Final update
            message.channel.send(`🏁 **T${activeId} Exited** (Code: ${code})`);
            terminals[activeId].process = null;
        });
        return;
    }

    // 3. INTERACTIVE INPUT
    if (terminals[activeId].process && !msg.startsWith('?')) {
        terminals[activeId].process.stdin.write(msg + '\n');
        return message.react('📩');
    }
});

// --- BUTTON INTERACTION ---
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const id = i.customId;

    if (id.startsWith('sw_')) {
        activeId = parseInt(id.split('_')[1]);
        await i.update({ 
            content: `🔄 Switched to **Terminal ${activeId}**\n${terminals[activeId].process ? '🔵 Active' : '🟢 Idle'}`, 
            components: getTerminalButtons() 
        });
    }

    if (id === 'kill_term' && terminals[activeId].process) {
        terminals[activeId].process.kill();
        terminals[activeId].process = null;
        await i.update({ content: `🛑 **T${activeId} Process Killed.**`, components: getTerminalButtons() });
    }

    if (id === 'clear_term') {
        terminals[activeId].buffer = "";
        terminals[activeId].lastSent = "";
        await i.update({ content: `🧹 **T${activeId} Cleared.**`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
