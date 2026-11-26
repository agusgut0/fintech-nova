# Builder
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# npm ci instala exactamente lo que fija package-lock.json (build reproducible)
RUN npm ci

COPY . .

RUN npm run build

# Runtime
FROM nginx:1.25-alpine

# Actualiza libexpat y libxml2: Trivy detecto 3 vulnerabilidades CRITICAL con parche disponible
RUN apk add --no-cache --upgrade libexpat libxml2

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /var/log/nginx /etc/nginx/conf.d

EXPOSE 8443

USER nginx

CMD ["nginx","-g","daemon off;"]

