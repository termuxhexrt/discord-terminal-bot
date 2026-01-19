FROM node:18

# Install system dependencies + Google Chrome directly
RUN apt-get update && apt-get install -y \
    python3 nmap sqlmap dnsrecon curl wget git php unzip \
    google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer download skip karne ke liye env set karo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/storage/public_root && chmod -R 777 /app/storage
CMD ["npm", "start"]
