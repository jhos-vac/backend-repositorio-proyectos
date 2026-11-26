import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseService } from 'src/prisma/base.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { BranchProjectDto } from './dto/branch-project.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { USER_OMIT } from 'src/common/sanitize';
import { isAdmin } from 'src/common/access';
import { unlinkQuiet } from './files/storage';
import { DriveService } from './files/drive.service';
import { SimilarQueryDto } from './dto/similar-query.dto';
import { SetStatusDto } from './dto/set-status.dto';
import { keywords, similarityScore } from './similarity';

/** Parecido mínimo (0 a 1) para avisar de un proyecto similar. */
const SIMILAR_MIN_SCORE = 0.25;

type AuthUser = { id: string; careerId: string; level?: number | null; role?: { name?: string } };

const LIST_INCLUDE = {
  user: { omit: USER_OMIT },
  career: true,
  projectSkills: { include: { skill: true } },
  students: {
    include: { student: { select: { id: true, name: true, email: true, level: true, group: true } } },
    orderBy: { student: { name: 'asc' } },
  },
  parent: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  _count: { select: { branches: true } },
} as const;

@Injectable()
export class ProjectsService extends BaseService<any, CreateProjectDto, UpdateProjectDto> {
  constructor(private readonly prismaService: PrismaService, private readonly drive: DriveService) {
    super(prismaService, { name: 'project' });
  }

  // ---------------------------------------------------------------- visibilidad

  /** Pares carrera+nivel que el docente tiene asignados. */
  private async cohortsOf(teacherId: string) {
    return this.prismaService.teacherAssignment.findMany({
      where: { teacherId },
      select: { careerId: true, level: true },
    });
  }

  /**
   * BE-08: solo docentes y ADMIN tienen cuenta y no hay revisión, así que todo
   * usuario autenticado ve todos los proyectos. Se mantiene como punto único por
   * si cambia la regla.
   */
  private async visibleWhere(_user: AuthUser): Promise<any> {
    return {};
  }

  /** Proyectos "míos": los que registré o los de mis carrera y nivel asignados. */
  private async ownWhere(user: AuthUser): Promise<any> {
    const or: any[] = [{ createdBy: user.id }];
    for (const c of await this.cohortsOf(user.id)) or.push({ careerId: c.careerId, level: c.level });
    return { OR: or };
  }

  /** ¿El docente tiene asignada esta carrera y nivel? */
  private async isAssigned(user: AuthUser, careerId: string, level: number | null | undefined) {
    if (!level) return false;
    const a = await this.prismaService.teacherAssignment.findFirst({
      where: { teacherId: user.id, careerId, level },
      select: { id: true },
    });
    return !!a;
  }

  /** El docente solo registra proyectos en sus carrera y nivel asignados (ADMIN: en cualquiera). */
  private async assertCohort(user: AuthUser, careerId: string, level: number | null | undefined) {
    if (isAdmin(user)) return;
    if (!(await this.isAssigned(user, careerId, level))) {
      throw new ForbiddenException('Solo puedes registrar proyectos en tus carreras y niveles asignados.');
    }
  }

  /**
   * Estudiantes del proyecto: individual = exactamente 1, grupal = 2 o más; todos
   * registrados en la carrera (y nivel, si el proyecto lo tiene) del proyecto.
   */
  private async assertStudents(ids: string[], modality: string, careerId: string, level: number | null | undefined) {
    const unique = Array.from(new Set(ids));
    if (modality === 'individual' && unique.length !== 1) {
      throw new BadRequestException('Un proyecto individual debe tener exactamente un estudiante.');
    }
    if (modality === 'grupal' && unique.length < 2) {
      throw new BadRequestException('Un proyecto grupal debe tener al menos dos estudiantes.');
    }
    const found = await this.prismaService.student.count({
      where: { id: { in: unique }, careerId, ...(level ? { level } : {}) },
    });
    if (found !== unique.length) {
      throw new BadRequestException('Los estudiantes deben estar registrados en la misma carrera y nivel del proyecto.');
    }
    return unique;
  }

  private buildFilters(q: ProjectQueryDto, own: any) {
    const f: any = {};
    const and: any[] = [];
    if (q.reviewStatus) f.reviewStatus = q.reviewStatus;
    if (q.careerId) f.careerId = q.careerId;
    if (q.level) f.level = q.level;
    // "Mío" = lo registré o es de mis carrera y nivel asignados (cualquier ciclo)
    if (q.mine) and.push(own);
    if (q.period) f.academic_period = q.period;
    if (q.skillIds?.length) and.push(...q.skillIds.map((skillId) => ({ projectSkills: { some: { skillId } } })));
    if (q.continuity === 'continuations') f.parentId = { not: null };
    if (q.continuity === 'origins') f.branches = { some: {} };
    if (q.status) and.push(this.statusWhere(q.status));
    if (q.search) {
      const term = { contains: q.search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: term },
          { description: term },
          { career: { name: term } },
          { projectSkills: { some: { skill: { name: term } } } },
        ],
      });
    }
    if (and.length) f.AND = and;
    return f;
  }

  /**
   * Estado de avance como lo muestra el listado: sin fechas vale `status`;
   * con fechas, terminado = completado y en curso = en progreso; si aún no
   * empieza, vuelve a valer `status`.
   */
  private statusWhere(status: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const or: any[] = [
      { startDate: null, status },
      { endDate: null, status },
      { startDate: { gt: today }, endDate: { gte: today }, status },
    ];
    if (status === 'completado') or.push({ startDate: { not: null }, endDate: { lt: today } });
    if (status === 'en progreso') or.push({ startDate: { lte: today }, endDate: { gte: today } });
    return { OR: or };
  }

  private async page(where: any, q: ProjectQueryDto) {
    const { limit = 10, page = 1, order = 'desc' } = q || ({} as ProjectQueryDto);
    const [total, data] = await Promise.all([
      this.prismaService.project.count({ where }),
      this.prismaService.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: LIST_INCLUDE,
        orderBy: { createdAt: order },
      }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        pagination: { page, limit, order: order as 'asc' | 'desc' },
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  // ---------------------------------------------------------------- consultas

  async list(q: ProjectQueryDto, user: AuthUser) {
    const own = q.mine ? await this.ownWhere(user) : {};
    const where = { AND: [await this.visibleWhere(user), this.buildFilters(q, own), await this.pastFilter(q)] };
    return this.page(where, q);
  }

  /** Nombres de los períodos académicos ya terminados (fin anterior al mes actual). */
  private async pastPeriodNames(): Promise<string[]> {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const periods = await this.prismaService.period.findMany({
      where: {
        OR: [{ endYear: { lt: y } }, { endYear: y, endMonth: { lt: m } }],
      },
      select: { name: true },
    });
    return periods.map((p) => p.name);
  }

  /** Filtro "ciclos pasados": proyectos de períodos ya terminados. */
  private async pastFilter(q: Pick<ProjectQueryDto, 'pastPeriods'>): Promise<any> {
    if (!q.pastPeriods) return {};
    return { academic_period: { in: await this.pastPeriodNames() } };
  }

  /** Etiquetas (tecnologías) usadas en proyectos de ciclos pasados, con cuántos proyectos las usan. */
  async pastTags(user: AuthUser) {
    const projectWhere = { AND: [await this.visibleWhere(user), await this.pastFilter({ pastPeriods: true })] };
    const skills = await this.prismaService.skills.findMany({
      where: { projectSkills: { some: { project: projectWhere } } },
      select: { id: true, name: true, _count: { select: { projectSkills: { where: { project: projectWhere } } } } },
    });
    return skills
      .map((s) => ({ id: s.id, name: s.name, count: s._count.projectSkills }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /**
   * Resumen de los proyectos propios (registrados por el docente o de sus carrera y
   * nivel asignados), de todos los ciclos. pending/rejected quedan en 0 porque ya no
   * hay revisión; se mantienen para no romper el frontend.
   */
  async mySummary(user: AuthUser) {
    const own = await this.ownWhere(user);
    const done = {
      OR: [
        { status: { contains: 'complet', mode: 'insensitive' as const } },
        { status: { contains: 'finaliz', mode: 'insensitive' as const } },
      ],
    };
    const count = (extra: any = {}) => this.prismaService.project.count({ where: { AND: [own, extra] } });
    const [total, completed] = await Promise.all([count(), count(done)]);
    return { total, pending: 0, approved: total, rejected: 0, completed, inProgress: total - completed };
  }

  /**
   * RN-04: proyectos visibles parecidos al que se está registrando. Se buscan
   * candidatos que compartan alguna palabra clave y se ordenan por parecido;
   * solo se devuelven los que superan el umbral (máximo 5).
   */
  async similar(q: SimilarQueryDto, user: AuthUser) {
    const words = keywords(`${q.name} ${q.description ?? ''}`);
    if (!words.length) return [];
    // Candidatos que comparten alguna palabra, sin distinguir tildes (las palabras clave ya vienen sin ellas
    // y solo tienen letras y números, así que no hay comodines que escapar)
    const patterns = words.map((w) => `%${w}%`);
    const matches = await this.prismaService.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Project"
      WHERE translate(lower(name || ' ' || coalesce(description, '')), 'áéíóúüñ', 'aeiouun') LIKE ANY (${patterns})
      ORDER BY "createdAt" DESC
      LIMIT 500`;
    if (!matches.length) return [];
    const candidates = await this.prismaService.project.findMany({
      where: {
        AND: [
          await this.visibleWhere(user),
          q.excludeId ? { NOT: { id: q.excludeId } } : {},
          { id: { in: matches.map((m) => m.id) } },
        ],
      },
      select: {
        id: true, name: true, description: true, academic_period: true, reviewStatus: true,
        career: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return candidates
      .map((p) => ({ ...p, score: Math.round(similarityScore(q, p) * 100) / 100 }))
      .filter((p) => p.score >= SIMILAR_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  /**
   * Panel de inicio de docentes y admin, calculado en la base de datos (antes el
   * navegador descargaba hasta 1000 proyectos). Solo cuenta lo visible para el
   * usuario y, si se indica, del período. El estado se interpreta como en el
   * frontend (normalizeStatus): completado, por iniciar o, si no, en progreso.
   */
  async dashboard(q: ProjectQueryDto, user: AuthUser) {
    const base = { AND: [await this.visibleWhere(user), q.period ? { academic_period: q.period } : {}] };
    const has = (text: string) => ({ status: { contains: text, mode: 'insensitive' as const } });
    const done = { OR: [has('complet'), has('finaliz')] };
    const notStarted = { NOT: done, OR: [has('inici'), has('pend')] };
    const inProgress = { NOT: [done, notStarted] };
    const count = (extra: any = {}) => this.prismaService.project.count({ where: { AND: [base, extra] } });
    const latest = (extra: any, take: number) =>
      this.prismaService.project.findMany({ where: { AND: [base, extra] }, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' }, take });

    const [total, active, completed, featured, recent, grouped] = await Promise.all([
      count(),
      count(inProgress),
      count(done),
      latest(inProgress, 2),
      latest({}, 6),
      this.prismaService.projectSkills.groupBy({
        by: ['skillId'],
        where: { project: base },
        _count: { skillId: true },
        orderBy: { _count: { skillId: 'desc' } },
        take: 6,
      }),
    ]);
    const skills = await this.prismaService.skills.findMany({
      where: { id: { in: grouped.map((g) => g.skillId) } },
      select: { id: true, name: true },
    });
    const name = new Map(skills.map((s) => [s.id, s.name]));
    const topSkills = grouped.map((g) => ({ name: name.get(g.skillId) ?? '', n: g._count.skillId }));

    return { total, active, done: completed, featured, recent, topSkills };
  }

  async findOne(id: string, user?: AuthUser) {
    const project = await this.prismaService.project.findFirst({
      where: { AND: [{ id }, user ? await this.visibleWhere(user) : {}] },
      include: LIST_INCLUDE,
    });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    return project;
  }

  async findBySkill(skillId: string, user: AuthUser) {
    return this.prismaService.project.findMany({
      where: { AND: [{ projectSkills: { some: { skillId } } }, await this.visibleWhere(user)] },
      include: { user: { omit: USER_OMIT }, projectSkills: true, career: true },
    });
  }

  /** Cadena completa de continuidad a la que pertenece el proyecto (solo lo visible). */
  async lineage(id: string, user: AuthUser) {
    const project = await this.findOne(id, user);
    const rootId = project.rootId ?? project.id;
    const nodes = await this.prismaService.project.findMany({
      where: { AND: [{ OR: [{ id: rootId }, { rootId }] }, await this.visibleWhere(user)] },
      select: {
        id: true, name: true, parentId: true, rootId: true, branchNumber: true, reviewStatus: true,
        status: true, createdAt: true, level: true,
        user: { select: { id: true, name: true } },
        career: { select: { id: true, name: true } },
      },
      orderBy: [{ branchNumber: 'asc' }, { createdAt: 'asc' }],
    });
    return { rootId, currentId: id, nodes };
  }

  // ---------------------------------------------------------------- creación

  /** BE-08: lo registra el docente (sus carrera y nivel) o el ADMIN, con sus estudiantes; no pasa por revisión. */
  async createWithUser(createProjectDto: CreateProjectDto, user: AuthUser) {
    const { createdBy: _cb, status: _s, studentIds, modality, careerId, level, ...rest } = createProjectDto as any;
    await this.assertCohort(user, careerId, level);
    const ids = await this.assertStudents(studentIds, modality, careerId, level);
    await this.assertPeriod(createProjectDto.academic_period, true);

    return this.prismaService.project.create({
      data: {
        ...rest,
        careerId,
        level,
        modality,
        status: 'en progreso',
        reviewStatus: 'approved',
        createdBy: user.id,
        students: { create: ids.map((studentId) => ({ studentId })) },
      } as any,
      include: LIST_INCLUDE,
    });
  }

  /** El período académico debe existir (lo configura el ADMIN). */
  private async assertPeriod(name: string | undefined, required: boolean) {
    if (!name) {
      if (required) throw new BadRequestException('Selecciona el período académico.');
      return;
    }
    const found = await this.prismaService.period.findUnique({ where: { name }, select: { id: true } });
    if (!found) throw new BadRequestException('El período académico no existe. Pide al administrador que lo registre.');
  }

  // ---------------------------------------------------------------- edición / borrado

  /** Pueden editar, borrar y cambiar el estado: ADMIN, el docente que lo registró o el asignado a su carrera y nivel. */
  private async assertCanModify(project: { createdBy: string | null; careerId: string; level: number | null }, user: AuthUser, verb: string) {
    if (isAdmin(user) || project.createdBy === user.id) return;
    if (await this.isAssigned(user, project.careerId, project.level)) return;
    throw new ForbiddenException(`No tienes permiso para ${verb} este proyecto.`);
  }

  async updateWithPermission(id: string, dto: UpdateProjectDto, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({
      where: { id },
      include: { students: { select: { studentId: true } } },
    });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    await this.assertCanModify(project, user, 'editar');

    // El cliente nunca cambia el propietario; el estado de avance solo cambia con setStatus
    const { createdBy: _cb, status: _st, studentIds, modality, careerId, level, ...rest } = dto as any;
    const data: any = { ...rest };
    if (rest.academic_period !== undefined && rest.academic_period !== project.academic_period) {
      await this.assertPeriod(rest.academic_period, true);
    }

    const nextCareer = careerId ?? project.careerId;
    const nextLevel = level ?? project.level;
    const cohortChanged = nextCareer !== project.careerId || nextLevel !== project.level;
    if (cohortChanged) {
      await this.assertCohort(user, nextCareer, nextLevel);
      Object.assign(data, { careerId: nextCareer, level: nextLevel });
    }

    // Estudiantes y modalidad se validan juntos si cambia cualquiera de ellos o la carrera/nivel
    let ids: string[] | undefined;
    if (studentIds !== undefined || modality !== undefined || cohortChanged) {
      const nextModality = modality ?? project.modality;
      ids = await this.assertStudents(studentIds ?? project.students.map((s) => s.studentId), nextModality, nextCareer, nextLevel);
      data.modality = nextModality;
    }

    if (!ids) return this.prismaService.project.update({ where: { id }, data, include: LIST_INCLUDE });
    const [, , updated] = await this.prismaService.$transaction([
      this.prismaService.projectStudent.deleteMany({ where: { projectId: id } }),
      this.prismaService.projectStudent.createMany({ data: ids.map((studentId) => ({ projectId: id, studentId })) }),
      this.prismaService.project.update({ where: { id }, data, include: LIST_INCLUDE }),
    ]);
    return updated;
  }

  async removeWithPermission(id: string, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    await this.assertCanModify(project, user, 'eliminar');
    return this.remove(id);
  }

  async remove(id: string) {
    const docs = await this.prismaService.projectDocument.findMany({ where: { projectId: id }, select: { storedName: true, driveFileId: true } });
    await this.prismaService.projectSkills.deleteMany({ where: { projectId: id } });
    await this.prismaService.userProject.deleteMany({ where: { projectId: id } });
    const result = await super.remove(id); // documentos, enlaces y estudiantes del proyecto se borran en cascada
    await Promise.all(docs.map((d) => (d.driveFileId ? this.drive.remove(d.driveFileId) : d.storedName ? unlinkQuiet(d.storedName) : undefined)));
    return result;
  }

  /** Subir/borrar PDF y enlaces: quien puede editar el proyecto, mientras no esté finalizado (ADMIN siempre). */
  async assertCanManageFiles(project: { createdBy: string | null; careerId: string; level: number | null; status: string }, user: AuthUser) {
    if (isAdmin(user)) return;
    await this.assertCanModify(project, user, 'gestionar los archivos de');
    if (/complet|finaliz/i.test(project.status || '')) throw new ForbiddenException('El proyecto está finalizado: ya no se pueden modificar sus archivos ni enlaces.');
  }

  /**
   * Marcar un proyecto como completado o reabrirlo. Lo decide el docente: el asignado a la
   * carrera y nivel del proyecto o el que lo registró; ADMIN siempre.
   */
  async setStatus(id: string, dto: SetStatusDto, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);

    await this.assertCanModify(project, user, 'cambiar el estado de');

    return this.prismaService.project.update({ where: { id }, data: { status: dto.status }, include: LIST_INCLUDE });
  }

  // ---------------------------------------------------------------- continuidad (ramas)

  /**
   * "Continuar proyecto": crea un proyecto nuevo enlazado al original (como un fork).
   * Hereda descripción, objetivos y habilidades; el original queda intacto.
   */
  async branch(id: string, dto: BranchProjectDto, user: AuthUser) {
    const src = await this.prismaService.project.findFirst({
      where: { AND: [{ id }, await this.visibleWhere(user)] },
      include: { projectSkills: true },
    });
    if (!src) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);

    const dup = await this.prismaService.project.findFirst({
      where: { parentId: id, createdBy: user.id },
      select: { id: true },
    });
    if (dup) throw new ConflictException('Ya tienes una continuación activa de este proyecto.');

    // La continuación puede ser de otro nivel (p. ej. el siguiente); el docente debe tenerlo asignado
    const level = dto.level ?? src.level;
    await this.assertCohort(user, src.careerId, level);
    const modality = dto.modality ?? (dto.studentIds ? (new Set(dto.studentIds).size === 1 ? 'individual' : 'grupal') : src.modality);
    const ids = dto.studentIds ? await this.assertStudents(dto.studentIds, modality, src.careerId, level) : [];
    // La continuación pertenece a un período nuevo: el elegido o, por defecto, el más reciente configurado.
    await this.assertPeriod(dto.academic_period, false);
    const latest = dto.academic_period
      ? null
      : (await this.prismaService.period.findMany({ orderBy: [{ startYear: { sort: 'desc', nulls: 'last' } }, { startMonth: { sort: 'desc', nulls: 'last' } }], take: 1 }))[0];
    const academic_period = dto.academic_period ?? latest?.name ?? src.academic_period;
    const rootId = src.rootId ?? src.id;
    const inChain = await this.prismaService.project.count({ where: { OR: [{ id: rootId }, { rootId }] } });

    return this.prismaService.project.create({
      data: {
        name: dto.name?.trim() || `${src.name} (continuación)`,
        description: dto.description?.trim() || src.description,
        problems: src.problems,
        summary: src.summary,
        objectives: src.objectives,
        cycle: src.cycle,
        academic_period,
        status: 'en progreso',
        reviewStatus: 'approved',
        careerId: src.careerId,
        level,
        modality,
        parentId: src.id,
        rootId,
        branchNumber: inChain + 1,
        createdBy: user.id,
        students: { create: ids.map((studentId) => ({ studentId })) },
        projectSkills: { create: src.projectSkills.map((s) => ({ skillId: s.skillId })) },
      } as any,
      include: LIST_INCLUDE,
    });
  }
}
