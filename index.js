const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('Renzu Persistent OS 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- REAL STORAGE LOGIC ---
const STATE_FILE = './state.json';
let state = {
    currentDir: process.cwd(),
    activeId: 1,
    buffers: { 1: "", 2: "", 3: "", 4: "" }
};

// Load saved data immediately
if (fs.existsSync(STATE_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        state = { ...state, ...data };
        if (fs.existsSync(state.currentDir)) {
            process.chdir(state.currentDir);
        }
    } catch (e) { console.error("Load Error:", e); }
}

function saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
        currentDir: process.cwd(),
        activeId: state.activeId,
        buffers: state.buffers
    }, null, 2));
}

let terminals = {
    1: { process: null, message: null, lastSent: "" },
    2: { process: null, message: null, lastSent: "" },
    3: { process: null, message: null, lastSent: "" },
    4: { process: null, message: null, lastSent: "" }
};

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

function getTerminalButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sw_1').setLabel('T1').setStyle(state.activeId === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sw_2').setLabel('T2').setStyle(state.activeId === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sw_3').setLabel('T3').setStyle(state.activeId === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sw_4').setLabel('T4').setStyle(state.activeId === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary)
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

    if (msg === '?status') {
        return message.reply(`📊 **T${state.activeId} Focused** | 📁 **Dir:** \`${process.cwd()}\``);
    }

    if (msg.startsWith('!')) {
        let cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        
        // CD persistence logic
        if (cmd.startsWith('cd ')) {
            const target = cmd.slice(3).trim();
            try {
                process.chdir(path.resolve(process.cwd(), target));
                saveState();
                return message.reply(`📂 Switched to: \`${process.cwd()}\``);
            } catch (err) {
                return message.reply(`❌ Folder not found! Current: \`${process.cwd()}\``);
            }
        }

        if (terminals[state.activeId].process) return message.reply("Terminal busy!");

        state.buffers[state.activeId] = `> ${cmd}\n`;
        terminals[state.activeId].message = await message.reply({
            content: `🖥️ **Persistent T${state.activeId}:**\n\`\`\`bash\nExecuting...\n\`\`\``,
            components: getTerminalButtons()
        });

        terminals[state.activeId].process = spawn(`stdbuf -oL -eL ${cmd}`, { 
            shell: true, 
            cwd: process.cwd(), 
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' } 
        });

        const updateUI = async () => {
            let id = state.activeId;
            let output = stripAnsi(state.buffers[id]).slice(-1900);
            if (output && output !== terminals[id].lastSent) {
                terminals[id].lastSent = output;
                await terminals[id].message.edit(`🖥️ **Live T${id}:**\n\`\`\`bash\n${output}\n\`\`\``).catch(() => {});
            }
        };

        const interval = setInterval(updateUI, 1200);

        terminals[state.activeId].process.stdout.on('data', (d) => { state.buffers[state.activeId] += d.toString(); });
        terminals[state.activeId].process.stderr.on('data', (d) => { state.buffers[state.activeId] += d.toString(); });

        terminals[state.activeId].process.on('close', (code) => {
            clearInterval(interval);
            saveState();
            message.channel.send(`🏁 T${state.activeId} Finished (Code: ${code})`);
            terminals[state.activeId].process = null;
        });
        return;
    }

    if (terminals[state.activeId].process && !msg.startsWith('?')) {
        terminals[state.activeId].process.stdin.write(msg + '\n');
        return message.react('✅');
    }
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.customId.startsWith('sw_')) {
        state.activeId = parseInt(i.customId.split('_')[1]);
        saveState();
        await i.update({ content: `🔄 Focus: **T${state.activeId}**`, components: getTerminalButtons() });
    } else if (i.customId === 'kill_term' && terminals[state.activeId].process) {
        terminals[state.activeId].process.kill();
        terminals[state.activeId].process = null;
        await i.update({ content: `🛑 T${state.activeId} Killed`, components: getTerminalButtons() });
    } else if (i.customId === 'clear_term') {
        state.buffers[state.activeId] = "";
        saveState();
        await i.update({ content: `🧹 T${state.activeId} Cleared`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
