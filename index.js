const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
require('dotenv').config();

const app = express();
// --- DYNAMIC WEB HOSTING ---
app.use((req, res, next) => {
    const webPath = path.join(process.cwd(), state.currentWebDir);
    if (fs.existsSync(webPath)) {
        express.static(webPath)(req, res, next);
    } else {
        next();
    }
});

app.get('/screen.png', (req, res) => {
    if (lastScreenshot) {
        res.set('Content-Type', 'image/png');
        return res.send(lastScreenshot);
    }
    res.status(404).send('No screenshot');
});

app.get('/', (req, res) => {
    const webPath = path.join(process.cwd(), state.currentWebDir);
    const indexPath = path.join(webPath, 'index.html');

    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    res.send(`
        <html>
            <head>
                <title>RENZU OS - Console</title>
                <style>
                    body { background: #080808; color: #0f0; font-family: 'Courier New', monospace; padding: 20px; }
                    .container { max-width: 1000px; margin: auto; border: 1px solid #1a1a1a; background: #000; padding: 20px; border-radius: 8px; box-shadow: 0 0 20px rgba(0,255,0,0.1); }
                    h1 { color: #fff; border-bottom: 2px solid #0f0; padding-bottom: 10px; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
                    .status { color: #888; margin-bottom: 20px; font-size: 14px; }
                    .view-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
                    .section { border: 1px solid #333; padding: 10px; border-radius: 4px; }
                    .section-header { color: #555; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; }
                    .screen { width: 100%; border: 1px solid #222; border-radius: 4px; background: #111; }
                    pre { background: #000; color: #0f0; padding: 15px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; min-height: 100px; }
                    .pulse { display: inline-block; width: 8px; height: 8px; background: #0f0; border-radius: 50%; margin-right: 5px; animation: pulse 1s infinite; }
                    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
                </style>
                <meta http-equiv="refresh" content="5">
            </head>
            <body>
                <div class="container">
                    <h1><span class="pulse"></span> RENZU OS v1.0 - GOD MODE</h1>
                    <div class="status">HOST: ${process.env.PORT || 3000} | ACTIVE_TERM: T${state.activeId} | WEB_ROOT: /${state.currentWebDir}</div>
                    
                    <div class="view-grid">
                        <div class="section">
                            <div class="section-header">📡 Live Browser Feed</div>
                            <img src="/screen.png" onerror="this.src='https://via.placeholder.com/800x450?text=Browser+Idle+-+Run+?go+URL'" class="screen">
                        </div>
                        
                        <div class="section">
                            <div class="section-header">📟 Terminal T${state.activeId} Output</div>
                            <pre>${stripAnsi(state.buffers[state.activeId]).slice(-1000) || 'Waiting for commands...'}</pre>
                        </div>
                    </div>
                    <div style="margin-top:20px; font-size:10px; color:#333; text-align:center;">Property of Renzu Development Team. Unauthorized access is restricted.</div>
                </div>
            </body>
        </html>
    `);
});
app.listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const OWNER_ID = '1104652354655113268'; // Hardcoded as requested
const DANGEROUS_COMMANDS = ['rm', 'mv', 'chmod', 'sudo', 'touch', 'mkdir', 'rmdir', 'kill', 'shutdown', 'reboot', 'cat', 'vi', 'nano'];

// --- ROBUST PERSISTENCE ---
const STATE_FILE = './state.json';
let state = {
    currentDir: process.cwd(),
    activeId: 1,
    currentWebDir: 'auth', // Default folder to host
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

// --- BROWSER STATE ---
let browser = null;
let page = null;
let lastScreenshot = null;
let isStreaming = false;

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
    const isOwner = message.author.id === OWNER_ID;

    // Command Parser
    if (msg.startsWith('!') || msg.startsWith('?')) {
        let cmdLine = msg.startsWith('! ') ? msg.slice(2) : msg.slice(1);
        let baseCmd = cmdLine.split(' ')[0].toLowerCase();

        if (!isOwner && DANGEROUS_COMMANDS.includes(baseCmd)) {
            return message.reply(`❌ **Restricted:** Command \`${baseCmd}\` is only for the bot owner!`);
        }
    }

    // --- BROWSER COMMANDS ---
    if (msg.startsWith('?')) {
        const parts = msg.slice(1).split(' ');
        const cmd = parts[0];
        const arg = parts.slice(1).join(' ');

        if (cmd === 'help') return message.reply("🌐 **Browser Commands:** `?go <url>`, `?click <tag>`, `?type <text>`, `?back`, `?reload`, `?screen` (latest screenshot)");
        if (cmd === 'status') return message.reply(`📊 **T${state.activeId}** | 📂 \`${process.cwd()}\` | 🌍 Web Root: \`${state.currentWebDir}\``);

        if (!browser) {
            browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
        }

        if (cmd === 'go' || cmd === 'screenshot' || cmd === 's') {
            const url = arg.startsWith('http') ? arg : `https://${arg}`;
            await message.react('🌐');
            await page.goto(url, { waitUntil: 'networkidle2' }).catch(() => { });
            return sendScreenshot(message);
        }

        if (cmd === 'click' || cmd === 'c') {
            await page.evaluate((tag) => {
                const el = document.querySelector(`[data-renzu-tag="${tag}"]`);
                if (el) el.click();
            }, arg);
            await new Promise(r => setTimeout(r, 1000));
            return sendScreenshot(message);
        }

        if (cmd === 'type' || cmd === 't') {
            await page.keyboard.type(arg);
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));
            return sendScreenshot(message);
        }

        if (cmd === 'screen') return sendScreenshot(message);
        return;
    }

    if (msg.startsWith('!web ')) {
        const folder = msg.slice(5).trim();
        const fullPath = path.join(process.cwd(), folder);
        if (fs.existsSync(fullPath)) {
            state.currentWebDir = folder;
            saveState();
            return message.reply(`✅ **Web Root Changed:** Website is now hosting files from \`/${folder}\``);
        } else {
            return message.reply(`❌ **Error:** Folder \`${folder}\` not found in project directory!`);
        }
    }

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
            let output = stripAnsi(state.buffers[tid]);

            // AUTO-SCROLL: Keep only the tail end (last 1900 chars) to see new output
            if (output.length > 1900) {
                output = "...[truncated]...\n" + output.slice(-1800);
            }

            if (output && output !== terminals[tid].lastSent) {
                terminals[tid].lastSent = output;
                await terminals[tid].message.edit({
                    content: `🖥️ **T${tid} Live Stream:**\n\`\`\`bash\n${output}\n\`\`\``,
                    components: getTerminalButtons()
                }).catch(() => { });
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
    // Anyone can switch terminals, but only owner can Kill/Clear
    if (i.user.id !== OWNER_ID && (i.customId === 'kill_term' || i.customId === 'clear_term')) {
        return i.reply({ content: "❌ Only the owner can use this action!", ephemeral: true });
    }
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

async function sendScreenshot(message) {
    if (!page) return;

    // Inject Yellow Tags
    await page.evaluate(() => {
        document.querySelectorAll('.renzu-tag').forEach(e => e.remove());
        const focusable = document.querySelectorAll('button, a, input, select, textarea');
        focusable.forEach((el, i) => {
            el.setAttribute('data-renzu-tag', i + 1);
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const tag = document.createElement('div');
                tag.className = 'renzu-tag';
                tag.innerText = i + 1;
                tag.style.cssText = `position:absolute;top:${rect.top + window.scrollY}px;left:${rect.left + window.scrollX}px;background:yellow;color:black;font-weight:bold;padding:2px;z-index:99999;font-size:12px;border:1px solid black;pointer-events:none;`;
                document.body.appendChild(tag);
            }
        });
    });

    const buffer = await page.screenshot();
    lastScreenshot = buffer;
    const attachment = new AttachmentBuilder(buffer, { name: 'screen.png' });
    await message.reply({ content: `📸 **Live View:**`, files: [attachment] });
}

client.login(process.env.TOKEN);
