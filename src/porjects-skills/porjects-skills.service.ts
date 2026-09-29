import { Injectable, BadRequestException, InternalServerErrorException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { isAdmin } from 'src/common/access';
import { BaseService } from '../prisma/base.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePorjectsSkillDto } from './dto/create-porjects-skill.dto';
import { UpdatePorjectsSkillDto } from './dto/update-porjects-skill.dto';

@Injectable()
export class PorjectsSkillsService extends BaseService<any, CreatePorjectsSkillDto, UpdatePorjectsSkillDto> {
  
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, { name: 'projectSkills' }); 
  }

  async create(createPorjectsSkillDto: CreatePorjectsSkillDto) {
    try {
      return await super.create(createPorjectsSkillDto);
    } catch (error) {
      if (error.code === 'P2002') {
        // ESTA ES LA CLAVE: Lanzar BadRequestException en lugar de dejar que explote
        throw new BadRequestException('Esta habilidad ya está asignada a este proyecto.');
      }
      
      console.error(error);
      throw new InternalServerErrorException('Error al asignar la habilidad');
    }
  }

  private async assertCanEditProject(projectId: string, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { createdBy: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    if (!isAdmin(user) && project.createdBy !== user.id) {
      throw new ForbiddenException('No tienes permiso para modificar este proyecto.');
    }
  }

  async createForUser(dto: CreatePorjectsSkillDto, user: any) {
    await this.assertCanEditProject(dto.projectId, user);
    return this.create(dto);
  }

  async removeForUser(id: string, user: any) {
    const rel = await this.prisma.projectSkills.findUnique({ where: { id }, select: { projectId: true } });
    if (!rel) throw new NotFoundException('Relación no encontrada');
    await this.assertCanEditProject(rel.projectId, user);
    return this.remove(id);
  }
}
