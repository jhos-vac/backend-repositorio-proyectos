import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreatePeriodDto } from './create-period.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Nombre canónico: "Septiembre-2026 – Enero-2027". */
export const periodName = (sm: number, sy: number, em: number, ey: number) =>
  `${MONTHS[sm - 1]}-${sy} – ${MONTHS[em - 1]}-${ey}`;

@Injectable()
export class PeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePeriodDto) {
    if (dto.endYear * 12 + dto.endMonth < dto.startYear * 12 + dto.startMonth) {
      throw new BadRequestException('El fin del período no puede ser anterior a su inicio.');
    }
    const name = periodName(dto.startMonth, dto.startYear, dto.endMonth, dto.endYear);
    if (await this.prisma.period.findUnique({ where: { name } })) {
      throw new ConflictException(`El período ${name} ya existe.`);
    }
    return this.prisma.period.create({ data: { name, ...dto } });
  }

  /** Más recientes primero (por año y mes de inicio; los antiguos sin fechas al final). */
  async findAll() {
    return this.prisma.period.findMany({
      orderBy: [{ startYear: { sort: 'desc', nulls: 'last' } }, { startMonth: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
  }

  /** Período en curso (null si el ADMIN aún no activa ninguno). */
  findActive() {
    return this.prisma.period.findFirst({ where: { active: true } });
  }

  /** Solo el ADMIN: marca este período como el único en curso. */
  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.period.updateMany({ where: { active: true, NOT: { id } }, data: { active: false } });
      return tx.period.update({ where: { id }, data: { active: true } });
    });
  }

  async findOne(id: string) {
    const period = await this.prisma.period.findUnique({ where: { id } });
    if (!period) throw new NotFoundException(`Period with ID ${id} not found`);
    return period;
  }

  async remove(id: string) {
    const period = await this.findOne(id);
    if (period.active) throw new ConflictException('No se puede eliminar el período activo: activa otro primero.');
    const used = await this.prisma.project.count({ where: { academic_period: period.name } });
    if (used > 0) {
      throw new ConflictException(`No se puede eliminar: ${used} proyecto(s) pertenecen a este período.`);
    }
    return this.prisma.period.delete({ where: { id } });
  }
}
