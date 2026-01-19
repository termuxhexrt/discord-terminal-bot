const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer');
const os = require('os');
const https = require('https'); 
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null, currentBrowser = null, currentPage = null;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

function getPublicIP() {
    return new Promise((resolve) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', () => resolve('Unknown'));
    });
}

// --- UPGRADED SMART TAGS (Supports Recommendations) ---
async function applySmartTags(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.renzu-tag').forEach(el => el.remove());
        // Added 'li' and 'role=option' to capture Google/Search recommendations
        const selectors = 'button, input, a, [role="button"], textarea, select, li, [role="option"]';
        const elements = Array.from(document.querySelectorAll(selectors)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2 && window.getComputedStyle(el).visibility !== 'hidden';
        });

        window.renzuElements = []; 
        elements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const id = index + 1;
            
            const tag = document.createElement('div');
            tag.className = 'renzu-tag';
            tag.style = `position: absolute; left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px;
                background: #FFD700; color: black; font-weight: bold; border: 1px solid black;
                padding: 0px 2px; z-index: 2147483647; font-size: 10px; border-radius: 2px;
                pointer-events: none; white-space: nowrap; box-shadow: 1px 1px 3px rgba(0,0,0,0.3);`;
            tag.innerText = id; 
            document.body.appendChild(tag);
            window.renzuElements.push({ id, x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
        });
    });
}

async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
            currentBrowser = await puppeteer.launch({ 
                executablePath: '/usr/bin/chromium',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
            });
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
        
        await currentPage.evaluate(() => document.querySelectorAll('.renzu-tag').forEach(el => el.remove()));

        // --- ADDED NAVIGATION BUTTONS ---
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scroll_up').setLabel('⬆️ Up').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('scroll_down').setLabel('⬇️ Down').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('go_back_btn').setLabel('⬅️ Back').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('clear_input').setLabel('✂️ Cut').setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('backspace_key').setLabel('⌫ BS').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );

        const payload = { 
            content: "🏷️ **Renzu Smart Interface**", 
            files: [new AttachmentBuilder(path)], 
            components: [row1, row2] 
        };
        
        if (interaction) await interaction.editReply(payload);
        else if (message) await message.reply(payload);
        
        if (fs.existsSync(path)) setTimeout(() => fs.unlinkSync(path), 5000);
    } catch (err) { 
        console.error("Capture Error:", err);
        if (message) message.reply(`❌ Error: ${err.message}`);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    if (msg.toLowerCase() === '?status') {
        const ip = await getPublicIP();
        const uptime = Math.floor(process.uptime());
        const memUsage = process.memoryUsage();
        const usedMem = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const totalAllocated = (memUsage.rss / 1024 / 1024).toFixed(2);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Renzu OS Detailed Status')
            .setColor(0x00AE86)
            .addFields(
                { name: '🌐 Server IP', value: `\`${ip}\``, inline: true },
                { name: '🌐 Browser', value: currentBrowser ? '🟢 Active' : '🔴 Closed', inline: true },
                { name: '🐚 Terminal', value: activeProcess ? '🟡 Busy' : '🟢 Idle', inline: true },
                { name: '💾 Bot RAM', value: `${usedMem}MB / ${totalAllocated}MB`, inline: true },
                { name: '⏱️ Uptime', value: `${uptime}s`, inline: true },
                { name: '📍 URL', value: currentPage ? (await currentPage.url()) : 'None', inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (currentPage && !msg.startsWith('!') && !msg.startsWith('?')) {
        if (/^\d+$/.test(msg)) {
            const coords = await currentPage.evaluate((id) => {
                const found = window.renzuElements.find(e => e.id === id);
                return found ? { x: found.x, y: found.y } : null;
            }, parseInt(msg));

            if (coords) {
                await currentPage.mouse.click(coords.x, coords.y);
                return setTimeout(() => captureAndSend(message), 1200);
            }
        }
        await currentPage.keyboard.type(msg);
        await currentPage.keyboard.press('Enter'); // Auto-enter for convenience
        return setTimeout(() => captureAndSend(message), 1000);
    }

    if (msg.toLowerCase().startsWith('?screenshot')) {
        const url = msg.split(' ')[1];
        if(!url) return message.reply("URL toh de!");
        await captureAndSend(message, url);
    }

    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);
        if (activeProcess) activeProcess.kill();
        const live = await message.reply("⚡ Executing...");
        activeProcess = spawn('/bin/bash', ['-c', cmd], { cwd: PUBLIC_DIR });
        let buffer = "";
        const intv = setInterval(() => { 
            if(buffer) live.edit(`\`\`\`\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(()=>{}); 
        }, 2500);
        activeProcess.on('close', () => { clearInterval(intv); activeProcess = null; });
        activeProcess.stdout.on('data', d => buffer += d);
        activeProcess.stderr.on('data', d => buffer += d);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!currentPage) return interaction.reply({ content: "❌ No active session.", ephemeral: true });

    await interaction.deferUpdate();
    
    if (interaction.customId === 'scroll_down') await currentPage.evaluate(() => window.scrollBy(0, 500));
    if (interaction.customId === 'scroll_up') await currentPage.evaluate(() => window.scrollBy(0, -500));
    if (interaction.customId === 'go_back_btn') await currentPage.goBack();
    if (interaction.customId === 'backspace_key') await currentPage.keyboard.press('Backspace');
    if (interaction.customId === 'clear_input') {
        await currentPage.keyboard.down('Control');
        await currentPage.keyboard.press('a');
        await currentPage.keyboard.up('Control');
        await currentPage.keyboard.press('Backspace');
    }
    if (interaction.customId === 'close_browser') {
        await currentBrowser.close();
        currentBrowser = null; currentPage = null;
        return interaction.followUp("🛑 Browser Stopped.");
    }
    
    await captureAndSend(null, null, interaction);
});

client.login(process.env.TOKEN);
