import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { UsersProjectsService } from './users-projects.service';
import { CreateUsersProjectDto } from './dto/create-users-project.dto';
import { UpdateUsersProjectDto } from './dto/update-users-project.dto';
import { PaginationDto } from 'src/Libs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';
import { assertSelfOrAdmin } from 'src/common/access';

@ApiTags('Users-Projects')
@Controller('users-projects')
export class UsersProjectsController {
  constructor(private readonly usersProjectsService: UsersProjectsService) {}

  // Gestión de membresías: solo ADMIN (el creador se une solo al crear el proyecto).
  @Post()
  @Auth(ValidRoles.ADMIN)
  create(@Body() dto: CreateUsersProjectDto) {
    return this.usersProjectsService.create(dto);
  }

  @Get()
  @Auth(ValidRoles.ADMIN)
  findAll(@Query() paginationDto?: PaginationDto) {
    return this.usersProjectsService.findAll(paginationDto);
  }

  /** Proyectos de un usuario: los propios o ADMIN. */
  @Get('user/:userId')
  @Auth()
  findByUserId(@Param('userId', ParseUUIDPipe) userId: string, @GetUser() user: User) {
    assertSelfOrAdmin(user, userId);
    return this.usersProjectsService.findByUserId(userId);
  }

  @Get(':id')
  @Auth(ValidRoles.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersProjectsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUsersProjectDto) {
    return this.usersProjectsService.update(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersProjectsService.remove(id);
  }
}
