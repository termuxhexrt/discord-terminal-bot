FROM node:18

# Hacking tools installation (Nikto ko abhi ke liye hataya hai build fix karne ke liye)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nmap \
    sqlmap \
    dnsrecon \
    curl \
    wget \
    git \
    php \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Storage path setup
RUN mkdir -p /app/storage/public_root && chmod -R 777 /app/storage

CMD ["npm", "start"]
