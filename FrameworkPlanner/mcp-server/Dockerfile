FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev
ENV PORT=3100
EXPOSE 3100
CMD ["node", "dist/index.js"]