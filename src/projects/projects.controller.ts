import { Controller, Get, Post, Body, Patch, Put, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { ReviewProjectDto } from './dto/review-project.dto';
import { BranchProjectDto } from './dto/branch-project.dto';
import { MembersProjectDto } from './dto/members-project.dto';
import { ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /** Estudiante: nace "pendiente". Docente/admin: nace aprobado. */
  @Post()
  @Auth()
  create(@Body() dto: CreateProjectDto, @GetUser() user: User) {
    return this.projectsService.createWithUser(dto, user as any);
  }

  @Get()
  @Auth()
  findAll(@Query() q: ProjectQueryDto, @GetUser() user: User) {
    return this.projectsService.list(q, user as any);
  }

  /** Cola de revisión: proyectos de las carrera+nivel asignados al docente (admin: todos). */
  @Get('review')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  forReview(@Query() q: ProjectQueryDto, @GetUser() user: User) {
    return this.projectsService.findForReview(q, user as any);
  }

  /** Panel de inicio (docentes y admin): totales, en curso, recientes y tecnologías más usadas. */
  @Get('dashboard')
  @Auth()
  dashboard(@Query() q: ProjectQueryDto, @GetUser() user: User) {
    return this.projectsService.dashboard(q, user as any);
  }

  /** Resumen de los proyectos del propio usuario (todos los ciclos). */
  @Get('mine/summary')
  @Auth()
  mySummary(@GetUser() user: User) {
    return this.projectsService.mySummary(user as any);
  }

  /** Etiquetas usadas en proyectos de ciclos pasados (para filtrar). */
  @Get('past/tags')
  @Auth()
  pastTags(@GetUser() user: User) {
    return this.projectsService.pastTags(user as any);
  }

  @Get('skill/:skillId')
  @Auth()
  findBySkill(@Param('skillId', ParseUUIDPipe) skillId: string, @GetUser() user: User) {
    return this.projectsService.findBySkill(skillId, user as any);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.projectsService.findOne(id, user as any);
  }

  /** Cadena de continuidad (origen y todas sus ramas visibles). */
  @Get(':id/lineage')
  @Auth()
  lineage(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.projectsService.lineage(id, user as any);
  }

  /** Aprobar / rechazar (docente asignado o admin). */
  @Patch(':id/review')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewProjectDto, @GetUser() user: User) {
    return this.projectsService.review(id, dto, user as any);
  }

  /** "Continuar proyecto": crea una rama nueva enlazada al proyecto aprobado. */
  @Post(':id/branch')
  @Auth()
  branch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BranchProjectDto, @GetUser() user: User) {
    return this.projectsService.branch(id, dto, user as any);
  }

  /** Define los integrantes (estudiantes de la carrera del proyecto). */
  @Put(':id/members')
  @Auth()
  setMembers(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MembersProjectDto, @GetUser() user: User) {
    return this.projectsService.setMembers(id, dto, user as any);
  }

  @Patch(':id')
  @Auth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @GetUser() user: User) {
    return this.projectsService.updateWithPermission(id, dto, user as any);
  }

  /** Dueño (si no está aprobado) o ADMIN. */
  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.projectsService.removeWithPermission(id, user as any);
  }
}
