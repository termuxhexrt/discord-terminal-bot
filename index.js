const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('Renzu God-Mode OS 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- DISK PERSISTENCE ---
const STATE_FILE = './state.json';
let state = {
    currentDir: process.cwd(),
    activeId: 1,
    buffers: { 1: "", 2: "", 3: "", 4: "" }
};

if (fs.existsSync(STATE_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        state = { ...state, ...saved };
        if (fs.existsSync(state.currentDir)) process.chdir(state.currentDir);
    } catch (e) { console.log("State reset"); }
}

function saveState() {
    state.currentDir = process.cwd();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let terminals = {
    1: { process: null, message: null },
    2: { process: null, message: null },
    3: { process: null, message: null },
    4: { process: null, message: null }
};

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

function getTerminalButtons() {
    return [
        new ActionRowBuilder().addComponents(
            [1, 2, 3, 4].map(id => 
                new ButtonBuilder().setCustomId(`sw_${id}`).setLabel(`T${id}`).setStyle(state.activeId === id ? ButtonStyle.Primary : ButtonStyle.Secondary)
            )
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('kill_term').setLabel('🛑 Kill').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('clear_term').setLabel('🧹 Clear').setStyle(ButtonStyle.Success)
        )
    ];
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    if (msg === '?status') {
        return message.reply(`✅ **Active:** T${state.activeId} | 📂 **Dir:** \`${process.cwd()}\``);
    }

    if (msg.startsWith('!')) {
        let cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        // FIXED CD LOGIC
        if (cmd.startsWith('cd ')) {
            try {
                process.chdir(path.resolve(process.cwd(), cmd.slice(3).trim()));
                saveState();
                return message.reply(`📂 **Path:** \`${process.cwd()}\``);
            } catch (e) { return message.reply("❌ Folder not found"); }
        }

        const tid = state.activeId;
        if (terminals[tid].process) return message.reply(`⚠️ T${tid} Busy!`);

        // Force reset buffer for new command
        state.buffers[tid] = `> ${cmd}\n`;
        terminals[tid].message = await message.reply({
            content: `🖥️ **T${tid} Starting...**`,
            components: getTerminalButtons()
        });

        // Use standard spawn without stdbuf for basic commands to avoid "Executing..." hang
        const shellCmd = cmd.includes('git') || cmd.includes('bash') ? `stdbuf -oL -eL ${cmd}` : cmd;

        terminals[tid].process = spawn(shellCmd, {
            shell: true,
            cwd: process.cwd(),
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' }
        });

        const updateLoop = setInterval(async () => {
            let output = stripAnsi(state.buffers[tid]).slice(-1900);
            if (output) {
                await terminals[tid].message.edit(`🖥️ **T${tid} Live:**\n\`\`\`bash\n${output}\n\`\`\``).catch(() => {});
            }
        }, 1500);

        terminals[tid].process.stdout.on('data', (d) => { state.buffers[tid] += d.toString(); });
        terminals[tid].process.stderr.on('data', (d) => { state.buffers[tid] += d.toString(); });

        terminals[tid].process.on('close', (code) => {
            clearInterval(updateLoop);
            saveState();
            message.channel.send(`🏁 **T${tid} Finished** (Code: ${code})`);
            terminals[tid].process = null;
        });
        return;
    }

    // Direct input interaction
    if (terminals[state.activeId].process && !msg.startsWith('?')) {
        terminals[state.activeId].process.stdin.write(msg + '\n');
        return message.react('✅');
    }
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const action = i.customId;

    if (action.startsWith('sw_')) {
        state.activeId = parseInt(action.split('_')[1]);
        saveState();
        await i.update({ content: `🔄 Focused: **T${state.activeId}**`, components: getTerminalButtons() });
    } else if (action === 'kill_term' && terminals[state.activeId].process) {
        terminals[state.activeId].process.kill('SIGKILL');
        terminals[state.activeId].process = null;
        await i.update({ content: `🛑 T${state.activeId} Force Killed`, components: getTerminalButtons() });
    } else if (action === 'clear_term') {
        state.buffers[state.activeId] = "";
        saveState();
        await i.update({ content: `🧹 T${state.activeId} Cleared`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
