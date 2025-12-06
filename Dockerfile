# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build client and server
# This produces dist/public (client) and dist/index.js (server)
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose port (default 5000)
EXPOSE 5000

# Start command
CMD ["node", "dist/index.js"]
