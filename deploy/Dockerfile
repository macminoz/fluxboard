# For a container (cloud or elsewhere). config/ and cache/ must be mounted as volumes, secrets
# passed as environment variables.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY plugin ./plugin
COPY catalogo ./catalogo
COPY generi ./generi
ENV FLUXBOARD_CONFIG=/data/config FLUXBOARD_CACHE=/data/cache
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
