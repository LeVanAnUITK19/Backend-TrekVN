# ════════════════════════════════════════════════════════
#  Stage 1 — deps: cài production dependencies
# ════════════════════════════════════════════════════════
FROM node:20-alpine3.21 AS deps

WORKDIR /app

# Chỉ copy manifest trước để tận dụng Docker layer cache
COPY package*.json ./

# npm ci đảm bảo cài đúng version theo package-lock.json
RUN npm ci --omit=dev --ignore-scripts

# ════════════════════════════════════════════════════════
#  Stage 2 — runner: image production cuối cùng
# ════════════════════════════════════════════════════════
FROM node:20-alpine3.21 AS runner

# Cài dumb-init để xử lý signal đúng (SIGTERM → graceful shutdown)
# apk upgrade để patch các CVE trong OS packages (libssl, libcrypto, v.v.)
RUN apk add --no-cache dumb-init && apk upgrade --no-cache

WORKDIR /app

# Chạy bằng user không có quyền root
USER node

# Copy node_modules đã cài từ stage deps
COPY --chown=node:node --from=deps /app/node_modules ./node_modules

# Copy source code (không copy .env, node_modules nhờ .dockerignore)
COPY --chown=node:node . .

# Port service lắng nghe (khớp với ENV PORT trong .env)
EXPOSE 3001

# NODE_ENV mặc định production — có thể override khi chạy container
ENV NODE_ENV=production

# dumb-init làm PID 1 để forward signal đúng tới Node process
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "src/index.js"]
