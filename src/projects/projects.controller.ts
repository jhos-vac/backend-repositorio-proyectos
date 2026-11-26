import { Controller, Get, Post, Body, Patch, Put, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { SimilarQueryDto } from './dto/similar-query.dto';
import { SetStatusDto } from './dto/set-status.dto';
import { BranchProjectDto } from './dto/branch-project.dto';
import { CreateProjectsDto } from './dto/bulk-projects.dto';
import { ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /** BE-08: lo registra el docente (sus carrera y nivel) o el ADMIN, con sus estudiantes. */
  @Post()
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  create(@Body() dto: CreateProjectDto, @GetUser() user: User) {
    return this.projectsService.createWithUser(dto, user as any);
  }

  /** BE-11: carga masiva desde la plantilla (todo o nada). */
  @Post('bulk')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  createMany(@Body() dto: CreateProjectsDto, @GetUser() user: User) {
    return this.projectsService.createMany(dto.projects, user as any);
  }

  @Get()
  @Auth()
  findAll(@Query() q: ProjectQueryDto, @GetUser() user: User) {
    return this.projectsService.list(q, user as any);
  }

  /** RN-04: proyectos visibles parecidos al que se está registrando (aviso, no bloquea). */
  @Get('similar')
  @Auth()
  similar(@Query() q: SimilarQueryDto, @GetUser() user: User) {
    return this.projectsService.similar(q, user as any);
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

  /** Marcar como completado o reabrir (docente a cargo o admin). */
  @Patch(':id/status')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStatusDto, @GetUser() user: User) {
    return this.projectsService.setStatus(id, dto, user as any);
  }

  /** "Continuar proyecto": crea una rama nueva enlazada al original. */
  @Post(':id/branch')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  branch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BranchProjectDto, @GetUser() user: User) {
    return this.projectsService.branch(id, dto, user as any);
  }

  @Patch(':id')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @GetUser() user: User) {
    return this.projectsService.updateWithPermission(id, dto, user as any);
  }

  /** El docente que lo registró, el asignado a su carrera y nivel, o el ADMIN. */
  @Delete(':id')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.projectsService.removeWithPermission(id, user as any);
  }
}
