FROM node:22-alpine

WORKDIR /app

# Copiamos dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalamos y generamos Prisma
RUN npm install
# prisma.config.ts exige DATABASE_URL incluso para generate; se usa un valor de relleno en la compilacion
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Copiamos el resto del código
COPY . .

# [CRÍTICO] Borramos cachés antiguos para forzar una compilación limpia
RUN rm -f tsconfig.tsbuildinfo tsconfig.build.tsbuildinfo

# Compilamos (ahora usará el nuevo tsconfig.build.json)
RUN npm run build

EXPOSE 8000

CMD ["npm", "run", "start:prod"]