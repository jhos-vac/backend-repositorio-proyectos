import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Public } from 'src/auth/decorators';
import { PrismaService } from 'src/prisma/prisma.service';

class PublicProjectsQuery {
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48)
  limit?: number;
}

/**
 * Página inicial pública (sin iniciar sesión): proyectos finalizados para que los
 * estudiantes los conozcan. Solo se expone el título y la descripción; nada de
 * estudiantes, docentes, documentos ni enlaces.
 */
@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async list(@Query() q: PublicProjectsQuery) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 12;
    const has = (text: string) => ({ status: { contains: text, mode: 'insensitive' as const } });
    const search = q.search?.trim();
    const where = {
      AND: [
        { OR: [has('complet'), has('finaliz')] },
        search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { description: { contains: search, mode: 'insensitive' as const } }] }
          : {},
      ],
    };
    const [total, data] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        select: { id: true, name: true, description: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }
}
