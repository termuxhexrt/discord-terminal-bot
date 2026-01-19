const { Client, GatewayIntentBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PUBLIC_DIR = '/app/storage/public_root';
let activeProcess = null, currentBrowser = null, currentPage = null;

const stripAnsi = (text) => text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

// High Precision Grid Logic (50px interval)
async function applyGrid(page) {
    await page.evaluate(() => {
        const grid = document.createElement('div');
        grid.id = 'renzu-grid';
        grid.style = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
        
        // Vertical Lines (X - Red) - Har 50px par
        for(let x=50; x<1280; x+=50) {
            const line = document.createElement('div');
            line.style = `position:absolute;left:${x}px;top:0;height:100%;width:1px;background:rgba(255,0,0,${x % 100 === 0 ? '0.4' : '0.15'});`;
            if(x % 100 === 0) {
                line.innerHTML = `<span style="color:red;font-size:9px;font-weight:bold;background:white;">${x}</span>`;
            }
            grid.appendChild(line);
        }
        
        // Horizontal Lines (Y - Blue) - Har 50px par
        for(let y=50; y<720; y+=50) {
            const line = document.createElement('div');
            line.style = `position:absolute;top:${y}px;left:0;width:100%;height:1px;background:rgba(0,0,255,${y % 100 === 0 ? '0.4' : '0.15'});`;
            if(y % 100 === 0) {
                line.innerHTML = `<span style="color:blue;font-size:9px;font-weight:bold;background:white;margin-left:10px;">${y}</span>`;
            }
            grid.appendChild(line);
        }
        
        // Highlight clickable elements for better aim
        const elements = document.querySelectorAll('button, input, a');
        elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const box = document.createElement('div');
            box.style = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;outline:1px dashed green;background:rgba(0,255,0,0.05);`;
            grid.appendChild(box);
        });

        document.body.appendChild(grid);
    });
}

async function captureAndSend(message, url = null, interaction = null) {
    try {
        if (!currentBrowser) {
            currentBrowser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
            currentPage = await currentBrowser.newPage();
            await currentPage.setViewport({ width: 1280, height: 720 });
        }
        if (url) await currentPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'networkidle2', timeout: 60000 });

        await applyGrid(currentPage);
        const path = `${PUBLIC_DIR}/grid_${Date.now()}.png`;
        await currentPage.screenshot({ path });
        await currentPage.evaluate(() => document.getElementById('renzu-grid')?.remove());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scroll_up').setLabel('⬆️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('scroll_down').setLabel('⬇️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('close_browser').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
        );

        const file = new AttachmentBuilder(path);
        const payload = { 
            content: `🎯 **High Precision Mode (50px Grid)**\n- Type \`x,y\` to click\n- Inputs/Buttons are highlighted in green.`, 
            files: [file], 
            components: [row] 
        };
        
        if (interaction) await interaction.editReply(payload);
        else await message.reply(payload);
        setTimeout(() => fs.existsSync(path) && fs.unlinkSync(path), 5000);
    } catch (err) { console.error("Capture Error:", err); }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();

    if (currentPage && !msg.startsWith('!') && !msg.startsWith('?')) {
        const coordMatch = msg.match(/^(\d+),(\d+)$/);
        if (coordMatch) {
            const x = parseInt(coordMatch[1]), y = parseInt(coordMatch[2]);
            await currentPage.mouse.click(x, y);
            await message.react('🎯');
            return captureAndSend(message);
        } else {
            await currentPage.keyboard.type(msg);
            await message.react('⌨️');
            return captureAndSend(message);
        }
    }

    if (msg.toLowerCase().startsWith('?screenshot')) await captureAndSend(message, msg.split(' ')[1]);

    if (msg.startsWith('!')) {
        const cmd = msg.slice(1);
        if (activeProcess) activeProcess.kill();
        const live = await message.reply("⚡ Executing...");
        activeProcess = spawn('/bin/bash', ['-c', cmd], { cwd: PUBLIC_DIR });
        let buffer = "";
        const intv = setInterval(() => { if(buffer) live.edit(`\`\`\`\n${stripAnsi(buffer).slice(-1900)}\n\`\`\``).catch(()=>{}); }, 2500);
        activeProcess.on('close', () => { clearInterval(intv); activeProcess = null; });
        activeProcess.stdout.on('data', d => buffer += d);
        activeProcess.stderr.on('data', d => buffer += d);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate();
    if (interaction.customId === 'scroll_down') await currentPage.evaluate(() => window.scrollBy(0, 400));
    if (interaction.customId === 'scroll_up') await currentPage.evaluate(() => window.scrollBy(0, -400));
    if (interaction.customId === 'close_browser') { if(currentBrowser) await currentBrowser.close(); currentBrowser = null; currentPage = null; return interaction.followUp("🛑 Session Terminated."); }
    if (currentPage) await captureAndSend(null, null, interaction);
});

client.login(process.env.TOKEN);
