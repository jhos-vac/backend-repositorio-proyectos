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
import { ReviewProjectDto } from './dto/review-project.dto';
import { BranchProjectDto } from './dto/branch-project.dto';
import { MembersProjectDto } from './dto/members-project.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { USER_OMIT } from 'src/common/sanitize';
import { isAdmin, isStudent, isTeacher } from 'src/common/access';
import { unlinkQuiet } from './files/storage';

type AuthUser = { id: string; careerId: string; level?: number | null; role?: { name?: string } };

const LIST_INCLUDE = {
  user: { omit: USER_OMIT },
  career: true,
  projectSkills: { include: { skill: true } },
  userProjects: { include: { user: { select: { id: true, name: true, level: true } } } },
  parent: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  _count: { select: { branches: true } },
} as const;

@Injectable()
export class ProjectsService extends BaseService<any, CreateProjectDto, UpdateProjectDto> {
  constructor(private readonly prismaService: PrismaService) {
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
   * Quién ve qué:
   *  - ADMIN: todo.
   *  - DOCENTE: aprobados + lo propio + todo lo de sus carrera/nivel asignados.
   *  - ESTUDIANTE: aprobados + lo propio (en cualquier estado).
   */
  private async visibleWhere(user: AuthUser): Promise<any> {
    if (isAdmin(user)) return {};
    const or: any[] = [{ reviewStatus: 'approved' }, { createdBy: user.id }, { userProjects: { some: { userId: user.id } } }];
    if (isTeacher(user)) {
      for (const c of await this.cohortsOf(user.id)) or.push({ careerId: c.careerId, level: c.level });
    }
    return { OR: or };
  }

  /** Proyectos que el usuario puede revisar (su cohorte). ADMIN: todos. */
  private async reviewableWhere(user: AuthUser): Promise<any> {
    if (isAdmin(user)) return {};
    const cohorts = await this.cohortsOf(user.id);
    if (cohorts.length === 0) return { id: { in: [] } }; // sin asignaciones no revisa nada
    return { OR: cohorts.map((c) => ({ careerId: c.careerId, level: c.level })), NOT: { createdBy: user.id } };
  }

  private buildFilters(q: ProjectQueryDto, user: AuthUser) {
    const f: any = {};
    if (q.reviewStatus) f.reviewStatus = q.reviewStatus;
    if (q.careerId) f.careerId = q.careerId;
    if (q.level) f.level = q.level;
    // "Mío" = lo creó o es integrante (cualquier ciclo)
    if (q.mine) f.OR = [{ createdBy: user.id }, { userProjects: { some: { userId: user.id } } }];
    if (q.period) f.academic_period = q.period;
    if (q.skillIds?.length) f.AND = q.skillIds.map((skillId) => ({ projectSkills: { some: { skillId } } }));
    if (q.continuity === 'continuations') f.parentId = { not: null };
    if (q.continuity === 'origins') f.branches = { some: {} };
    if (q.search) f.name = { contains: q.search, mode: 'insensitive' };
    return f;
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
    const where = { AND: [await this.visibleWhere(user), this.buildFilters(q, user), await this.pastFilter(q)] };
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

  /** Filtro "ciclos pasados": proyectos aprobados de períodos ya terminados. */
  private async pastFilter(q: Pick<ProjectQueryDto, 'pastPeriods'>): Promise<any> {
    if (!q.pastPeriods) return {};
    return { reviewStatus: 'approved', academic_period: { in: await this.pastPeriodNames() } };
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

  /** Resumen de los proyectos propios del usuario (creados por él o donde es integrante), de todos los ciclos. */
  async mySummary(user: AuthUser) {
    const own = { OR: [{ createdBy: user.id }, { userProjects: { some: { userId: user.id } } }] };
    const done = {
      OR: [
        { status: { contains: 'complet', mode: 'insensitive' as const } },
        { status: { contains: 'finaliz', mode: 'insensitive' as const } },
      ],
    };
    const count = (extra: any = {}) => this.prismaService.project.count({ where: { AND: [own, extra] } });
    const [total, pending, approved, rejected, completed] = await Promise.all([
      count(),
      count({ reviewStatus: 'pending' }),
      count({ reviewStatus: 'approved' }),
      count({ reviewStatus: 'rejected' }),
      count({ reviewStatus: 'approved', ...done }),
    ]);
    return { total, pending, approved, rejected, completed, inProgress: approved - completed };
  }

  /** Cola de revisión (docente/admin). Por defecto solo los pendientes. */
  async findForReview(q: ProjectQueryDto, user: AuthUser) {
    const filters = this.buildFilters({ ...q, reviewStatus: q.reviewStatus ?? 'pending' } as ProjectQueryDto, user);
    return this.page({ AND: [await this.reviewableWhere(user), filters] }, q);
  }

  async findOne(id: string, user?: AuthUser) {
    const project = await this.prismaService.project.findFirst({
      where: { AND: [{ id }, user ? await this.visibleWhere(user) : {}] },
      include: {
        ...LIST_INCLUDE,
        userProjects: { include: { user: { select: { id: true, name: true, level: true } } } },
      },
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

  /** Alumno: carrera y nivel salen de su perfil y el proyecto nace "pendiente". Docente/admin: nace aprobado. */
  private async authoring(dto: { careerId?: string; level?: number }, user: AuthUser) {
    if (isStudent(user)) {
      if (!user.level) {
        throw new BadRequestException('Tu perfil no tiene nivel asignado. Pide al administrador que lo configure.');
      }
      return { careerId: user.careerId, level: user.level, reviewStatus: 'pending' };
    }
    return { careerId: dto.careerId, level: dto.level ?? null, reviewStatus: 'approved' };
  }

  async createWithUser(createProjectDto: CreateProjectDto, user: AuthUser) {
    const { createdBy: _cb, level: _lv, careerId: _c, status: _s, ...rest } = createProjectDto as any;
    const auth = await this.authoring(createProjectDto, user);
    await this.assertPeriod(createProjectDto.academic_period, true);

    return this.prismaService.project.create({
      data: {
        ...rest,
        status: 'in-progress',
        ...auth,
        createdBy: user.id,
        userProjects: { create: { userId: user.id } },
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

  /** Reemplaza los integrantes: solo quien puede editar; deben ser estudiantes de la carrera del proyecto. */
  async setMembers(id: string, dto: MembersProjectDto, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    this.assertCanModify(project, user, 'editar');

    const ids = Array.from(new Set([...(project.createdBy ? [project.createdBy] : []), ...dto.userIds]));
    const extra = ids.filter((x) => x !== project.createdBy);
    if (extra.length) {
      const valid = await this.prismaService.user.count({
        where: { id: { in: extra }, careerId: project.careerId, role: { name: 'USER' } },
      });
      if (valid !== extra.length) {
        throw new BadRequestException('Los integrantes deben ser estudiantes de la misma carrera del proyecto.');
      }
    }
    await this.prismaService.$transaction([
      this.prismaService.userProject.deleteMany({ where: { projectId: id } }),
      this.prismaService.userProject.createMany({ data: ids.map((userId) => ({ userId, projectId: id })) }),
    ]);
    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------- edición / borrado

  /** Reglas: ADMIN todo; dueño docente todo lo suyo; dueño estudiante solo si NO está aprobado. */
  private assertCanModify(project: { createdBy: string | null; reviewStatus: string }, user: AuthUser, verb: string) {
    if (isAdmin(user)) return;
    if (project.createdBy !== user.id) {
      throw new ForbiddenException(`No tienes permiso para ${verb} este proyecto.`);
    }
    if (isStudent(user) && project.reviewStatus === 'approved') {
      throw new ForbiddenException(`Un proyecto aprobado no puede ${verb === 'editar' ? 'modificarse' : 'eliminarse'} por el estudiante.`);
    }
  }

  async updateWithPermission(id: string, dto: UpdateProjectDto, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    this.assertCanModify(project, user, 'editar');

    // El cliente nunca cambia propietario ni flujo de revisión
    const { createdBy: _cb, level, careerId, ...rest } = dto as any;
    const data: any = { ...rest };
    if (rest.academic_period !== undefined && rest.academic_period !== project.academic_period) {
      await this.assertPeriod(rest.academic_period, true);
    }

    if (isStudent(user)) {
      // carrera y nivel de un estudiante no se editan; corregir un rechazo lo reenvía a revisión
      if (project.reviewStatus === 'rejected') {
        Object.assign(data, { reviewStatus: 'pending', reviewedAt: null });
      }
    } else {
      if (careerId) data.careerId = careerId;
      if (level !== undefined) data.level = level;
    }

    return this.prismaService.project.update({ where: { id }, data, include: LIST_INCLUDE });
  }

  async removeWithPermission(id: string, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    this.assertCanModify(project, user, 'eliminar');
    return this.remove(id);
  }

  async remove(id: string) {
    const docs = await this.prismaService.projectDocument.findMany({ where: { projectId: id }, select: { storedName: true } });
    await this.prismaService.projectSkills.deleteMany({ where: { projectId: id } });
    await this.prismaService.userProject.deleteMany({ where: { projectId: id } });
    const result = await super.remove(id); // los registros de documentos/enlaces se borran en cascada
    await Promise.all(docs.map((d) => unlinkQuiet(d.storedName)));
    return result;
  }

  /**
   * Quién puede subir/borrar PDF y enlaces: ADMIN siempre; el creador o un integrante solo mientras
   * el proyecto esté aprobado y no finalizado (no en revisión, no rechazado, no finalizado).
   */
  assertCanManageFiles(
    project: { createdBy: string | null; reviewStatus: string; status: string; userProjects?: { userId: string }[] },
    user: AuthUser,
  ) {
    if (isAdmin(user)) return;
    const member = project.createdBy === user.id || (project.userProjects || []).some((m) => m.userId === user.id);
    if (!member) throw new ForbiddenException('Solo el equipo del proyecto puede gestionar sus archivos y enlaces.');
    if (project.reviewStatus === 'rejected') throw new ForbiddenException('El proyecto fue rechazado: no se pueden adjuntar archivos ni enlaces.');
    if (project.reviewStatus !== 'approved') throw new ForbiddenException('El proyecto aún está en revisión: podrás adjuntar archivos cuando sea aprobado.');
    if (/complet|finaliz/i.test(project.status || '')) throw new ForbiddenException('El proyecto está finalizado: ya no se pueden modificar sus archivos ni enlaces.');
  }

  // ---------------------------------------------------------------- revisión

  async review(id: string, dto: ReviewProjectDto, user: AuthUser) {
    const project = await this.prismaService.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);

    if (!isAdmin(user)) {
      if (project.createdBy === user.id) throw new ForbiddenException('No puedes revisar tu propio proyecto.');
      const assigned = project.level
        ? await this.prismaService.teacherAssignment.findFirst({
            where: { teacherId: user.id, careerId: project.careerId, level: project.level },
          })
        : null;
      if (!assigned) throw new ForbiddenException('Este proyecto no pertenece a tus carrera y nivel asignados.');
    }
    if (dto.decision === 'rejected' && !dto.note?.trim()) {
      throw new BadRequestException('Indica el motivo del rechazo para que el estudiante pueda corregirlo.');
    }

    return this.prismaService.project.update({
      where: { id },
      data: {
        reviewStatus: dto.decision,
        reviewNote: dto.note?.trim() || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      include: LIST_INCLUDE,
    });
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
    if (src.reviewStatus !== 'approved') {
      throw new BadRequestException('Solo se pueden continuar proyectos aprobados.');
    }

    const dup = await this.prismaService.project.findFirst({
      where: { parentId: id, createdBy: user.id, reviewStatus: { not: 'rejected' } },
      select: { id: true },
    });
    if (dup) throw new ConflictException('Ya tienes una continuación activa de este proyecto.');

    const auth = await this.authoring({ careerId: src.careerId, level: src.level ?? undefined }, user);
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
        status: 'in-progress',
        ...auth,
        parentId: src.id,
        rootId,
        branchNumber: inChain + 1,
        createdBy: user.id,
        userProjects: { create: { userId: user.id } },
        projectSkills: { create: src.projectSkills.map((s) => ({ skillId: s.skillId })) },
      } as any,
      include: LIST_INCLUDE,
    });
  }
}
