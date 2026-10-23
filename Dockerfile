FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package manifests first for layer caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install root dependencies
RUN npm install --omit=dev

# Install client dependencies
RUN cd client && npm install

# Copy all source files (including client/index.html, src, server, etc.)
COPY . .

# Build client
RUN cd client && npm run build

# Expose server port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
