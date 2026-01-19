FROM node:18

# Install system dependencies + Chromium browser
RUN apt-get update && apt-get install -y \
    python3 nmap sqlmap dnsrecon curl wget git php unzip \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer ko Chromium use karne ke liye force karo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/storage/public_root && chmod -R 777 /app/storage
CMD ["npm", "start"]
