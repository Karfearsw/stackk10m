FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
ENV PORT=3100
EXPOSE 3100
CMD ["node", "dist/index.js"]