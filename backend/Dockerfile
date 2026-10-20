# --- Etapa 1: compilar TypeScript ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# --- Etapa 2: imagen de ejecución (solo dependencias de producción) ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY db ./db
EXPOSE 3000
# Aplica migraciones, carga datos ilustrativos solo si la base está vacía y arranca la API.
CMD ["sh", "-c", "node dist/db/cli.js --seed-if-empty && node dist/server.js"]
