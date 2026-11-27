import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { isAdmin } from 'src/common/access';
import { institutionalEmailMessage, isInstitutionalEmail } from 'src/common/institutional-email';
import { CreateStudentDto, StudentQueryDto, UpdateStudentDto } from './dto/student.dto';

type AuthUser = { id: string; role?: { name?: string } };
type Cohort = { careerId: string; level: number };

const INCLUDE = {
  career: { select: { id: true, name: true } },
  _count: { select: { projects: true } },
} as const;

/**
 * Estudiantes sin cuenta (BE-08). El docente solo ve y gestiona los de las
 * carreras y niveles que tiene asignados; el ADMIN, todos.
 */
@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  private cohortsOf(teacherId: string): Promise<Cohort[]> {
    return this.prisma.teacherAssignment.findMany({ where: { teacherId }, select: { careerId: true, level: true } });
  }

  /** Filtro de los estudiantes que el usuario puede ver (vacío = todos). */
  private async scopeWhere(user: AuthUser): Promise<any> {
    if (isAdmin(user)) return {};
    const cohorts = await this.cohortsOf(user.id);
    if (cohorts.length === 0) return { id: { in: [] } }; // sin asignaciones no ve estudiantes
    return { OR: cohorts.map((c) => ({ careerId: c.careerId, level: c.level })) };
  }

  /** El docente solo puede usar sus carrera y nivel asignados. */
  private async assertCohort(user: AuthUser, careerId: string, level: number, cohorts?: Cohort[]) {
    if (isAdmin(user)) return;
    const mine = cohorts ?? (await this.cohortsOf(user.id));
    if (!mine.some((c) => c.careerId === careerId && c.level === level)) {
      throw new ForbiddenException('Solo puedes gestionar estudiantes de tus carreras y niveles asignados.');
    }
  }

  private assertEmail(email: string) {
    if (!isInstitutionalEmail(email)) throw new BadRequestException(institutionalEmailMessage());
  }

  async list(q: StudentQueryDto, user: AuthUser) {
    const { page = 1, limit = 10, search } = q;
    const filters: any[] = [await this.scopeWhere(user)];
    if (q.careerId) filters.push({ careerId: q.careerId });
    if (q.level) filters.push({ level: q.level });
    if (q.group) filters.push({ group: { equals: q.group, mode: 'insensitive' } });
    if (search) {
      filters.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { cedula: { contains: search } },
        ],
      });
    }
    const where = { AND: filters };
    const [total, data] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ level: 'asc' }, { group: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { data, meta: { total, pagination: { page, limit }, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
  }

  async findOne(id: string, user: AuthUser) {
    const student = await this.prisma.student.findFirst({ where: { AND: [{ id }, await this.scopeWhere(user)] }, include: INCLUDE });
    if (!student) throw new NotFoundException('Estudiante no encontrado');
    return student;
  }

  async create(dto: CreateStudentDto, user: AuthUser) {
    if (dto.email) this.assertEmail(dto.email);
    await this.assertCohort(user, dto.careerId, dto.level);
    await this.assertCareer(dto.careerId);
    await this.assertFree(dto);
    const academicPeriod = await this.periodFor(user, dto.academicPeriod);
    return this.prisma.student.create({ data: { ...dto, academicPeriod, createdById: user.id }, include: INCLUDE });
  }

  async update(id: string, dto: UpdateStudentDto, user: AuthUser) {
    const current = await this.findOne(id, user); // también comprueba que el docente lo pueda ver
    const careerId = dto.careerId ?? current.careerId;
    const level = dto.level ?? current.level;
    await this.assertCohort(user, careerId, level); // no puede moverlo fuera de sus asignaciones
    if (dto.careerId) await this.assertCareer(dto.careerId);
    if (dto.email && dto.email !== current.email) {
      this.assertEmail(dto.email);
      await this.assertFree({ email: dto.email });
    }
    if (dto.cedula && dto.cedula !== current.cedula) await this.assertFree({ cedula: dto.cedula });
    const data = { ...dto };
    if (!isAdmin(user)) delete data.academicPeriod; // el período solo lo cambia el ADMIN
    return this.prisma.student.update({ where: { id }, data, include: INCLUDE });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.student.delete({ where: { id } }); // sus vínculos con proyectos se borran en cascada
    return { deleted: true };
  }

  /**
   * Carga masiva: valida TODAS las filas (correo institucional, repetidos en el
   * archivo o ya registrados, carrera, carrera y nivel del docente) y, si alguna
   * falla, no crea ninguna. Si todas pasan, se insertan en una sola operación.
   */
  async createMany(all: CreateStudentDto[], user: AuthUser, skipExisting = false) {
    let rows = all;
    let skipped = 0;
    if (skipExisting) {
      const keys = all.flatMap((r) => [r.cedula, r.email]).filter((k): k is string => !!k);
      const found = await this.prisma.student.findMany({
        where: { OR: [{ cedula: { in: keys } }, { email: { in: keys } }] },
        select: { cedula: true, email: true },
      });
      const known = new Set(found.flatMap((s) => [s.cedula, s.email]).filter(Boolean));
      rows = all.filter((r) => !(r.cedula && known.has(r.cedula)) && !(r.email && known.has(r.email)));
      skipped = all.length - rows.length;
      if (!rows.length) return { created: 0, skipped };
    }
    const cohorts = isAdmin(user) ? [] : await this.cohortsOf(user.id);
    const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
    const cedulas = rows.map((r) => r.cedula).filter((c): c is string => !!c);
    const [taken, careers] = await Promise.all([
      this.prisma.student.findMany({ where: { OR: [{ email: { in: emails } }, { cedula: { in: cedulas } }] }, select: { email: true, cedula: true } }),
      this.prisma.career.findMany({ where: { id: { in: rows.map((r) => r.careerId) } }, select: { id: true } }),
    ]);
    const takenSet = new Set(taken.flatMap((s) => [s.email, s.cedula].filter(Boolean)));
    const careerIds = new Set(careers.map((c) => c.id));

    const errors: string[] = [];
    const seen = new Set<string>();
    for (const [i, row] of rows.entries()) {
      const label = `Fila ${i + 1} (${row.cedula || row.email})`;
      if (row.email && !isInstitutionalEmail(row.email)) errors.push(`${label}: ${institutionalEmailMessage()}`);
      for (const [key, what] of [[row.cedula, 'la cédula'], [row.email, 'el correo']] as const) {
        if (!key) continue;
        if (seen.has(key)) errors.push(`${label}: ${what} está repetido en el archivo.`);
        if (takenSet.has(key)) errors.push(`${label}: ya existe un estudiante con ${what} ${key}.`);
        seen.add(key);
      }
      if (!careerIds.has(row.careerId)) errors.push(`${label}: la carrera no existe.`);
      else if (!isAdmin(user) && !cohorts.some((c) => c.careerId === row.careerId && c.level === row.level)) {
        errors.push(`${label}: la carrera y el nivel no están entre tus asignaciones.`);
      }
    }
    if (errors.length) throw new BadRequestException(errors);

    const active = await this.periodFor(user, undefined);
    const { count } = await this.prisma.student.createMany({
      data: rows.map((r) => ({ ...r, academicPeriod: isAdmin(user) && r.academicPeriod ? r.academicPeriod : active, createdById: user.id })),
    });
    return { created: count, skipped };
  }

  private async assertCareer(careerId: string) {
    if (!(await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true } }))) {
      throw new BadRequestException('La carrera no existe.');
    }
  }

  private async assertFree({ email, cedula }: { email?: string; cedula?: string }) {
    if (email && (await this.prisma.student.findUnique({ where: { email }, select: { id: true } }))) {
      throw new BadRequestException('Ya existe un estudiante con ese correo.');
    }
    if (cedula && (await this.prisma.student.findUnique({ where: { cedula }, select: { id: true } }))) {
      throw new BadRequestException('Ya existe un estudiante con esa cédula.');
    }
  }

  /** Período del estudiante: el activo (el ADMIN puede indicar otro). */
  private async periodFor(user: AuthUser, requested?: string) {
    if (isAdmin(user) && requested) return requested;
    const active = await this.prisma.period.findFirst({ where: { active: true }, select: { name: true } });
    return active?.name ?? null;
  }
}
