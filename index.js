const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs'); // File System added for permanent storage
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('Renzu Persistent OS 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- PERMANENT STORAGE LOGIC ---
const STATE_FILE = path.join(__dirname, 'state.json');

let state = {
    currentDir: process.cwd(),
    activeId: 1,
    buffers: { 1: "", 2: "", 3: "", 4: "" }
};

// Load saved data on startup
if (fs.existsSync(STATE_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(STATE_FILE));
        state = { ...state, ...data };
        process.chdir(state.currentDir);
    } catch (e) { console.log("State load error, using defaults."); }
}

function saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
        currentDir: state.currentDir,
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

    if (msg === '?help') {
        return message.reply({ 
            embeds: [new EmbedBuilder().setTitle("🖥️ Renzu OS - Persistent").setDescription("`! <cmd>` for Live Stream. Settings are saved permanently.")], 
            components: getTerminalButtons() 
        });
    }

    if (msg === '?status') {
        let status = Object.keys(terminals).map(id => `T${id}: ${terminals[id].process ? '🔴' : '🟢'}`).join(' | ');
        return message.reply(`📊 **System:** ${status}\nFocus: **Terminal ${state.activeId}**\n📁 **Saved Dir:** \`${state.currentDir}\``);
    }

    if (msg.startsWith('!')) {
        let cmd = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        if (!cmd) return;

        // --- PERSISTENT CD FIX ---
        if (cmd.startsWith('cd ')) {
            const target = cmd.slice(3).trim();
            try {
                const newPath = path.resolve(state.currentDir, target);
                process.chdir(newPath);
                state.currentDir = process.cwd();
                saveState(); // Folder yaad rakhega
                return message.reply(`📂 **Directory Saved:** \`${state.currentDir}\``);
            } catch (err) {
                return message.reply(`❌ **Error:** Folder not found.`);
            }
        }

        if (cmd.includes('git clone') && !cmd.includes('--progress')) {
            cmd = cmd.replace('git clone', 'git clone --progress');
        }

        if (terminals[state.activeId].process) return message.reply(`⚠️ T${state.activeId} busy!`);

        state.buffers[state.activeId] = `> ${cmd}\n`;
        terminals[state.activeId].message = await message.reply({
            content: `🖥️ **Persistent T${state.activeId}:**\n\`\`\`bash\nStreaming Live...\n\`\`\``,
            components: getTerminalButtons()
        });

        terminals[state.activeId].process = spawn(`stdbuf -oL -eL ${cmd}`, { 
            shell: true,
            cwd: state.currentDir,
            env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1', LANG: 'en_US.UTF-8' } 
        });

        const updateUI = async () => {
            let active = state.activeId;
            let t = terminals[active];
            if (!t.message) return;
            
            let output = stripAnsi(state.buffers[active]).slice(-1900);
            if (output !== t.lastSent && output.length > 0) {
                t.lastSent = output;
                await t.message.edit({
                    content: `🖥️ **Live Stream T${active}:**\n\`\`\`bash\n${output}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => {});
            }
        };

        const streamInterval = setInterval(updateUI, 1200);

        terminals[state.activeId].process.stdout.on('data', (d) => { state.buffers[state.activeId] += d.toString(); });
        terminals[state.activeId].process.stderr.on('data', (d) => { state.buffers[state.activeId] += d.toString(); });

        terminals[state.activeId].process.on('close', (code) => {
            clearInterval(streamInterval);
            saveState(); // Save buffer on finish
            setTimeout(updateUI, 500);
            message.channel.send(`🏁 **T${state.activeId} Done.** (Dir: \`${path.basename(state.currentDir)}\`)`);
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
    const bid = i.customId;

    if (bid.startsWith('sw_')) {
        state.activeId = parseInt(bid.split('_')[1]);
        saveState();
        await i.update({ content: `🔄 Focus: **Terminal ${state.activeId}**`, components: getTerminalButtons() });
    } else if (bid === 'kill_term' && terminals[state.activeId].process) {
        terminals[state.activeId].process.kill();
        terminals[state.activeId].process = null;
        await i.update({ content: `🛑 T${state.activeId} Killed`, components: getTerminalButtons() });
    } else if (bid === 'clear_term') {
        state.buffers[state.activeId] = "";
        saveState();
        await i.update({ content: `🧹 T${state.activeId} Screen Cleared`, components: getTerminalButtons() });
    }
});

client.login(process.env.TOKEN);
