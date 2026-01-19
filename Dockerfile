FROM node:18

# System dependencies for Puppeteer and Hacking Tools
RUN apt-get update && apt-get install -y \
    python3 nmap sqlmap dnsrecon curl wget git php unzip \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libpangocairo-1.0-0 libxfixes3 libx11-6 libx11-xcb1 libxcb1 libxcursor1 \
    libxi6 libxtst6 libfontconfig1 libxss1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install

# Puppeteer ke sath bundled Chromium download karne ke liye
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN npm install puppeteer

COPY . .

RUN mkdir -p /app/storage/public_root && chmod -R 777 /app/storage
CMD ["npm", "start"]
