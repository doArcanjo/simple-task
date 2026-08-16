FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3200 DATA_FILE=/data/app.db
VOLUME /data
EXPOSE 3200
# JWT_SECRET must be supplied at runtime:
#   docker run -p 3200:3200 -v tasks-data:/data -e JWT_SECRET=change-me simple-task-manager
CMD ["node", "server/server.js"]
