import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';
import { CreateRolesPermissionDto } from './dto/create-roles-permission.dto';
import { UpdateRolesPermissionDto } from './dto/update-roles-permission.dto';
import { ApiTags } from '@nestjs/swagger';
import { PaginationDto } from 'src/Libs/common';
import { Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';

@ApiTags('Roles-Permissions')
@Controller('roles-permissions')
@Auth(ValidRoles.ADMIN)
export class RolesPermissionsController {
  constructor(private readonly rolesPermissionsService: RolesPermissionsService) {}

  @Post()
  create(@Body() createRolesPermissionDto: CreateRolesPermissionDto) {
    return this.rolesPermissionsService.create(createRolesPermissionDto);
  }

  @Get()
  findAll(@Query() paginationDto?: PaginationDto) {
    return this.rolesPermissionsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesPermissionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRolesPermissionDto: UpdateRolesPermissionDto) {
    return this.rolesPermissionsService.update(id, updateRolesPermissionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesPermissionsService.remove(id);
  }
}
