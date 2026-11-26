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

# BE-07: la API no corre como root, sino como el usuario "node" (uid 1000) de la imagen.
# Solo necesita escribir en uploads/ y storage/ (en produccion son ./data/uploads y ./data/storage,
# que el despliegue deja con dueno 1000).
RUN mkdir -p uploads storage/documents && chown -R node:node uploads storage
USER node

EXPOSE 8000

CMD ["npm", "run", "start:prod"]