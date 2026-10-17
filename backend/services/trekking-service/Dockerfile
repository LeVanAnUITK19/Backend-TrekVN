FROM node:22-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm prune --omit=dev

COPY . .

EXPOSE 3003

USER node

CMD ["node", "src/index.js"]
