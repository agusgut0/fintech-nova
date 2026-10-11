FROM node:22-alpine3.21 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM alpine:3.21
RUN apk add --no-cache nodejs \
    && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app src ./src
USER app
EXPOSE 8080
CMD ["node", "src/server.js"]
