FROM node:18

# Hacking tools + Browser dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip nmap sqlmap dnsrecon curl wget git php unzip \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
# Puppeteer ko install karein
RUN npm install puppeteer
COPY . .

RUN mkdir -p /app/storage/public_root && chmod -R 777 /app/storage
CMD ["npm", "start"]
