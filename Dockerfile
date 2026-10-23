FROM node:20-alpine

WORKDIR /app

# Install dependencies for building
RUN apk add --no-cache python3 make g++

# Copy package manifests first for caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install root dependencies
RUN npm install --omit=dev

# Install client dependencies & build client
RUN cd client && npm install && npm run build

# Copy remaining source code
COPY . .

# Expose server port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
