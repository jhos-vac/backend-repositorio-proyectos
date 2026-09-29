import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { CareersModule } from './careers/careers.module';
import { RolesModule } from './roles/roles.module';
import { ProjectsModule } from './projects/projects.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesPermissionsModule } from './roles-permissions/roles-permissions.module';
import { SkillsModule } from './skills/skills.module';
import { UsersProjectsModule } from './users-projects/users-projects.module';
import { PeriodModule } from './period/period.module'; // <--- 1. NUEVA IMPORTACIÓN
import { PorjectsSkillsModule } from './porjects-skills/porjects-skills.module'; // <--- AGREGADO: Importación del módulo de skills
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { SanitizeInterceptor } from './common/sanitize.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false, dotfiles: 'deny' },
    }),

    ConfigModule.forRoot({ isGlobal: true }),
    // Límite global por IP; los endpoints sensibles definen uno más estricto.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      // SOLO para la suite de pruebas automáticas (nunca en producción).
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    AuthModule,
    UsersModule,
    PrismaModule,
    CareersModule,
    RolesModule,
    ProjectsModule,
    PermissionsModule,
    RolesPermissionsModule,
    SkillsModule,
    UsersProjectsModule,
    PeriodModule, 
    PorjectsSkillsModule, 
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Orden importa: 1) rate limit, 2) autenticación (default-deny), 3) roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: SanitizeInterceptor },
  ],
})
export class AppModule {}