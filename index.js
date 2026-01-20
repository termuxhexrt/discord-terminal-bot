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

// --- STORAGE ---
const PUBLIC_DIR = path.join(process.cwd(), 'storage_public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// --- MULTI-TERMINAL SYSTEM ---
let terminals = {
    1: { process: null, buffer: "", message: null },
    2: { process: null, buffer: "", message: null },
    3: { process: null, buffer: "", message: null },
    4: { process: null, buffer: "", message: null }
};
let activeId = 1; // Default T1

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
            .setTitle("⌨️ Renzu Multi-Terminal OS")
            .setColor("#00FF00")
            .setDescription(`Abhi **Terminal ${activeId}** focus mein hai.`)
            .addFields(
                { name: '🚀 Run', value: '`! <command>`' },
                { name: '⌨️ Interact', value: 'Bas number ya text likho (no prefix needed)' },
                { name: '🔄 Switch', value: 'Buttons use karo' }
            );
        return message.reply({ embeds: [help], components: getTerminalButtons() });
    }

    if (msg === '?status') {
        let statusStr = "";
        for (let id in terminals) {
            statusStr += `**T${id}:** ${terminals[id].process ? '🔴 Active' : '🟢 Idle'}\n`;
        }
        return message.reply(`📊 **System Health:**\n${statusStr}`);
    }

    // 2. STOP/KILL COMMAND
    if (msg === '?stop') {
        if (terminals[activeId].process) {
            terminals[activeId].process.kill();
            terminals[activeId].process = null;
            return message.reply(`🛑 **T${activeId}** process terminated.`);
        }
        return message.reply("Nothing running here.");
    }

    // 3. EXECUTE NEW COMMAND
    if (msg.startsWith('!')) {
        const cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        if (terminals[activeId].process) {
            return message.reply(`⚠️ **T${activeId}** busy hai. Switch to another terminal.`);
        }

        terminals[activeId].buffer = `> ${cmd}\n`;
        terminals[activeId].message = await message.reply({
            content: `🖥️ **Terminal ${activeId}** initializing...`,
            components: getTerminalButtons()
        });

        terminals[activeId].process = spawn(cmd, { shell: true, env: { ...process.env, TERM: 'xterm-256color' } });

        const updateUI = () => {
            if (terminals[activeId].message) {
                const output = stripAnsi(terminals[activeId].buffer).slice(-1900);
                terminals[activeId].message.edit({
                    content: `🖥️ **T${activeId} Output:**\n\`\`\`bash\n${output || "Awaiting output..."}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => {});
            }
        };

        const interval = setInterval(updateUI, 2000);

        terminals[activeId].process.stdout.on('data', (d) => { terminals[activeId].buffer += d.toString(); });
        terminals[activeId].process.stderr.on('data', (d) => { terminals[activeId].buffer += d.toString(); });

        terminals[activeId].process.on('close', (code) => {
            clearInterval(interval);
            updateUI();
            message.channel.send(`🏁 **T${activeId} Finished** (Code: ${code})`);
            terminals[activeId].process = null;
        });
        return;
    }

    // 4. INTERACTIVE INPUT (Direct Send)
    if (terminals[activeId].process && !msg.startsWith('?')) {
        terminals[activeId].process.stdin.write(msg + '\n');
        return message.react('📩');
    }
});

// --- BUTTONS HANDLER ---
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const id = i.customId;

    if (id.startsWith('sw_')) {
        activeId = parseInt(id.split('_')[1]);
        await i.update({ 
            content: `🔄 Switched to **Terminal ${activeId}**`, 
            components: getTerminalButtons() 
        });
    }

    if (id === 'kill_term' && terminals[activeId].process) {
        terminals[activeId].process.kill();
        terminals[activeId].process = null;
        await i.update({ content: `🛑 **T${activeId} Killed.**`, components: getTerminalButtons() });
    }

    if (id === 'clear_term') {
        terminals[activeId].buffer = "";
        await i.update({ content: `🧹 **T${activeId} Screen Cleared.**`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
