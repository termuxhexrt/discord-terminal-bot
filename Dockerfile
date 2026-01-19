FROM node:18

# System tools install karna (Real Terminal feels)
RUN apt-get update && apt-get install -y \
    nmap \
    curl \
    git \
    net-tools \
    iputils-ping \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["npm", "start"]
