FROM node:18

# Hacking tools installation (Kali style tools)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nmap \
    sqlmap \
    nikto \
    dnsrecon \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# App directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy bot files
COPY . .

# Setup Storage Path
RUN mkdir -p /app/storage/public_root && chmod -R 777 /app/storage

CMD ["npm", "start"]
