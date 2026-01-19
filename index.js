const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null, currentBrowser = null, currentPage = null;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// --- THE ULTIMATE FIX: NUMBER + TEXT LABELS ---
async function applySmartTags(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
        
        const selectors = 'button, input, a, [role="button"], textarea, select';
        const elements = Array.from(document.querySelectorAll(selectors)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2 && window.getComputedStyle(el).visibility !== 'hidden';
        });

        window.renzuElements = []; 

        elements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const id = index + 1;
            
            // Get label text (inner text or placeholder or aria-label)
            let labelText = el.innerText || el.placeholder || el.getAttribute('aria-label') || el.value || "";
            labelText = labelText.trim().substring(0, 15); // Shorten long text
            
            const tag = document.createElement('div');
            tag.className = 'renzu-tag';
            tag.style = `
                position: absolute; left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px;
                background: #FFD700; color: black; font-weight: bold; border: 2px solid black;
                padding: 1px 4px; z-index: 2147483647; font-size: 11px; border-radius: 3px;
                pointer-events: none; white-space: nowrap; box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
            `;
            // Show Number + Text (e.g., "5: Login")
            tag.innerText = `${id}${labelText ? ': ' + labelText : ''}`;
            document.body.appendChild(tag);
            
            window.renzuElements.push({ id, x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
        });
    });
}

async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
            currentBrowser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
            currentPage = await currentBrowser.newPage();
            await currentPage.setViewport({ width: 1280, height: 720 });
        }
        if (url) {
            const targetUrl = url.startsWith('http') ? url : `https://${url}`;
            await currentPage.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        }

        await applySmartTags(currentPage);
        const path = `${PUBLIC_DIR}/smart_${Date.now()}.png`;
        await currentPage.screenshot({ path });
        
        // Screenshot ke baad tags hata do taaki page clean rahe
        await currentPage.evaluate(() => document.querySelectorAll('.renzu-tag').forEach(el => el.remove()));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scroll_up').setLabel('⬆️ Up').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('scroll_down').setLabel('⬇️ Down').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );

        const payload = { 
            content: "🏷️ **Labeled Control:**\n- Type the **Number** to click.\n- Type text to fill an input field.", 
            files: [new AttachmentBuilder(path)], 
            components: [row] 
        };
        
        if (interaction) await interaction.editReply(payload);
        else await message.reply(payload);
        setTimeout(() => fs.existsSync(path) && fs.unlinkSync(path), 5000);
    } catch (err) { console.error("Error:", err); }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    if (currentPage && !msg.startsWith('!') && !msg.startsWith('?')) {
        if (/^\d+$/.test(msg)) {
            const targetId = parseInt(msg);
            const coords = await currentPage.evaluate((id) => {
                const found = window.renzuElements.find(e => e.id === id);
                return found ? { x: found.x, y: found.y } : null;
            }, targetId);

            if (coords) {
                await currentPage.mouse.click(coords.x, coords.y);
                await message.react('🎯');
                // Click ke baad page update hota hai, isliye naya screenshot bhejo
                return setTimeout(() => captureAndSend(message), 1000);
            }
        }
        // Agar number nahi hai, toh typing assume karo
        await currentPage.keyboard.type(msg);
        await message.react('⌨️');
        return setTimeout(() => captureAndSend(message), 500);
    }

    if (msg.toLowerCase().startsWith('?screenshot')) {
        await message.react('🌐');
        await captureAndSend(message, msg.split(' ')[1]);
    }

    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);
        if (activeProcess) activeProcess.kill();
        const live = await message.reply("⚡ Executing...");
        activeProcess = spawn('/bin/bash', ['-c', cmd], { cwd: PUBLIC_DIR });
        let buffer = "";
        const intv = setInterval(() => { if(buffer) live.edit(`\`\`\`\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(()=>{}); }, 2500);
        activeProcess.on('close', () => { clearInterval(intv); activeProcess = null; });
        activeProcess.stdout.on('data', d => buffer += d);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate();
    if (interaction.customId === 'scroll_down') await currentPage.evaluate(() => window.scrollBy(0, 450));
    if (interaction.customId === 'scroll_up') await currentPage.evaluate(() => window.scrollBy(0, -450));
    if (interaction.customId === 'close_browser') { if(currentBrowser) await currentBrowser.close(); currentBrowser = null; currentPage = null; return; }
    if (currentPage) await captureAndSend(null, null, interaction);
});

client.login(process.env.TOKEN);
