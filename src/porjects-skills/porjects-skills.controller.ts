import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe } from '@nestjs/common';
import { PorjectsSkillsService } from './porjects-skills.service';
import { CreatePorjectsSkillDto } from './dto/create-porjects-skill.dto';
import { UpdatePorjectsSkillDto } from './dto/update-porjects-skill.dto';
import { ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';

@ApiTags('porjects-skills')
@Controller('porjects-skills')
export class PorjectsSkillsController {
  constructor(private readonly porjectsSkillsService: PorjectsSkillsService) {}

  /** Asignar habilidad a un proyecto: dueño del proyecto o ADMIN. */
  @Post()
  @Auth()
  create(@Body() dto: CreatePorjectsSkillDto, @GetUser() user: User) {
    return this.porjectsSkillsService.createForUser(dto, user);
  }

  @Get()
  @Auth()
  findAll() {
    return this.porjectsSkillsService.findAll();
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.porjectsSkillsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePorjectsSkillDto) {
    return this.porjectsSkillsService.update(id, dto);
  }

  /** Quitar habilidad de un proyecto: dueño del proyecto o ADMIN. */
  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.porjectsSkillsService.removeForUser(id, user);
  }
}
