# --------- Base ---------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --------- Dependencies ---------
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --------- Builder ---------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
ENV DATABASE_URL="postgresql://johndoe:fakedbstring@localhost:5432/mydb"
COPY . .
RUN npm run build

# --------- Runner ---------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000

# Start production server
CMD ["npm", "start"]
