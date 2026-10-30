import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PaginationDto } from 'src/Libs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowPendingPassword, Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Auth(ValidRoles.ADMIN)
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Auth()
  @AllowPendingPassword()
  @Get()
  findAll(@Query() paginationDto?: PaginationDto) {
    return this.rolesService.findAll(paginationDto);
  }

  @Auth()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Auth(ValidRoles.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Auth(ValidRoles.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
