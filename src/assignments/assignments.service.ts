import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { USER_OMIT } from 'src/common/sanitize';
import { SetAssignmentDto } from './dto/set-assignment.dto';

const INCLUDE = {
  career: true,
  teacher: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas las asignaciones (panel admin). */
  findAll() {
    return this.prisma.teacherAssignment.findMany({
      include: INCLUDE,
      orderBy: [{ careerId: 'asc' }, { level: 'asc' }],
    });
  }

  /** Las carrera+nivel que atiende el docente. */
  findMine(teacherId: string) {
    return this.prisma.teacherAssignment.findMany({
      where: { teacherId },
      include: INCLUDE,
      orderBy: [{ careerId: 'asc' }, { level: 'asc' }],
    });
  }

  /** Asigna (o reasigna / quita) el docente de una carrera+nivel. */
  async set(dto: SetAssignmentDto) {
    const career = await this.prisma.career.findUnique({ where: { id: dto.careerId } });
    if (!career) throw new BadRequestException('La carrera indicada no existe.');

    const where = { careerId_level: { careerId: dto.careerId, level: dto.level } };
    if (!dto.teacherId) {
      await this.prisma.teacherAssignment.deleteMany({ where: { careerId: dto.careerId, level: dto.level } });
      return { careerId: dto.careerId, level: dto.level, teacher: null };
    }

    const teacher = await this.prisma.user.findUnique({ where: { id: dto.teacherId }, include: { role: true } });
    if (!teacher || teacher.role.name !== 'TEACHER') {
      throw new BadRequestException('El usuario indicado no es un docente.');
    }
    return this.prisma.teacherAssignment.upsert({
      where,
      create: { careerId: dto.careerId, level: dto.level, teacherId: dto.teacherId },
      update: { teacherId: dto.teacherId },
      include: INCLUDE,
    });
  }
}
