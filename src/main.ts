import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { join } from "path";

/**
 * Orígenes permitidos: CORS_ORIGINS (lista separada por comas) + FRONTEND_URL.
 * Sin comodines: cualquier despliegue nuevo (Vercel, Render...) debe añadirse
 * explícitamente a CORS_ORIGINS.
 */
function allowedOrigins(): string[] {
    const list = [
        ...(process.env.CORS_ORIGINS ?? '').split(','),
        process.env.FRONTEND_URL ?? '',
    ]
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean);
    if (process.env.NODE_ENV !== 'production') {
        list.push('http://localhost:5173', 'http://localhost');
    }
    return [...new Set(list)];
}

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    const logger = new Logger('Bootstrap');

    app.disable('x-powered-by');
    // Las imágenes de /uploads las carga el frontend desde otro origen.
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

    app.useGlobalPipes(new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
    }));
    app.setGlobalPrefix("api");

    app.useStaticAssets(join(__dirname, '..', 'uploads'), {
        prefix: '/uploads/',
        index: false,
        dotfiles: 'deny',
    });

    const origins = allowedOrigins();
    app.enableCors({
        origin: (origin, callback) => {
            // Sin Origin = herramientas server-to-server / curl (no son navegadores)
            if (!origin || origins.includes(origin)) return callback(null, true);
            logger.warn(`CORS bloqueado para el origen: ${origin}`);
            callback(null, false);
        },
        // La API usa Bearer token, no cookies: no se necesitan credenciales.
        credentials: false,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type, Accept, Authorization',
    });

    const port = process.env.PORT ?? 8000;
    await app.listen(port, "0.0.0.0");

    logger.log(`Backend iniciado en puerto ${port}`);
    logger.log(`Orígenes CORS permitidos: ${origins.join(', ') || '(ninguno)'}`);
}
bootstrap();
