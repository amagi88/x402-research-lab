FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
CMD ["npm", "run", "dev"]
