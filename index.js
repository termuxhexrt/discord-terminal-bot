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

// --- ROBUST PERSISTENCE ---
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
    } catch (e) { console.log("State Reset"); }
}

function saveState() {
    state.currentDir = process.cwd();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let terminals = {
    1: { process: null, message: null, lastSent: "" },
    2: { process: null, message: null, lastSent: "" },
    3: { process: null, message: null, lastSent: "" },
    4: { process: null, message: null, lastSent: "" }
};

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

function getTerminalButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        [1, 2, 3, 4].map(id => 
            new ButtonBuilder()
                .setCustomId(`sw_${id}`)
                .setLabel(`T${id}`)
                .setStyle(state.activeId === id ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
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

    // Help & Status
    if (msg === '?help') return message.reply({ content: "🖥️ **Renzu OS Commands:** `! <cmd>`, `?status`, `?help`", components: getTerminalButtons() });
    if (msg === '?status') return message.reply(`📊 **T${state.activeId}** | 📂 \`${process.cwd()}\` | Shell: \`${process.env.SHELL || 'bash'}\``);

    if (msg.startsWith('!')) {
        let cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        // CD PERSISTENCE
        if (cmd.startsWith('cd ')) {
            try {
                const newPath = path.resolve(process.cwd(), cmd.slice(3).trim());
                process.chdir(newPath);
                saveState();
                return message.reply(`📂 **Directory:** \`${process.cwd()}\``);
            } catch (e) { return message.reply("❌ Folder not found!"); }
        }

        const tid = state.activeId;
        if (terminals[tid].process) return message.reply(`⚠️ T${tid} is already running a process!`);

        // Start Execution
        state.buffers[tid] = `> ${cmd}\n`;
        terminals[tid].message = await message.reply({
            content: `🖥️ **T${tid} Live Stream:**\n\`\`\`bash\nInitializing...\n\`\`\``,
            components: getTerminalButtons()
        });

        // Use stdbuf for EVERYTHING to ensure no "Executing..." hang
        terminals[tid].process = spawn(`stdbuf -oL -eL ${cmd}`, {
            shell: true,
            cwd: process.cwd(),
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' }
        });

        const updateUI = async () => {
            const output = stripAnsi(state.buffers[tid]).slice(-1950);
            if (output && output !== terminals[tid].lastSent) {
                terminals[tid].lastSent = output;
                await terminals[tid].message.edit({
                    content: `🖥️ **T${tid} Live Stream:**\n\`\`\`bash\n${output}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => {});
            }
        };

        const timer = setInterval(updateUI, 1000);

        terminals[tid].process.stdout.on('data', (data) => { state.buffers[tid] += data.toString(); });
        terminals[tid].process.stderr.on('data', (data) => { state.buffers[tid] += data.toString(); });

        terminals[tid].process.on('close', (code) => {
            clearInterval(timer);
            saveState();
            setTimeout(updateUI, 500); // Final update
            message.channel.send(`🏁 **T${tid} Execution Finished** (Code: ${code})`);
            terminals[tid].process = null;
        });
        return;
    }

    // Direct Interaction
    if (terminals[state.activeId].process && !msg.startsWith('?')) {
        terminals[state.activeId].process.stdin.write(msg + '\n');
        return message.react('✅');
    }
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const bid = i.customId;

    if (bid.startsWith('sw_')) {
        state.activeId = parseInt(bid.split('_')[1]);
        saveState();
        await i.update({ content: `🔄 Focus Switched: **T${state.activeId}**`, components: getTerminalButtons() });
    } else if (bid === 'kill_term' && terminals[state.activeId].process) {
        terminals[state.activeId].process.kill('SIGKILL');
        terminals[state.activeId].process = null;
        await i.update({ content: `🛑 T${state.activeId} Force Killed`, components: getTerminalButtons() });
    } else if (bid === 'clear_term') {
        state.buffers[state.activeId] = "";
        saveState();
        await i.update({ content: `🧹 T${state.activeId} Buffer Cleared`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
