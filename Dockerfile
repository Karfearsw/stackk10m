# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Install FrameworkPlanner dependencies (node_modules is dockerignored)
RUN npm --prefix FrameworkPlanner ci

# Build client and server (produces dist/ and dist-server/)
RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies for FrameworkPlanner
COPY FrameworkPlanner/package*.json FrameworkPlanner/
RUN npm --prefix FrameworkPlanner ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/FrameworkPlanner/dist ./dist
COPY --from=builder /app/FrameworkPlanner/dist-server ./dist-server

# Expose port (default 5000)
EXPOSE 5000

# Start command
CMD ["node", "dist-server/index.js"]
