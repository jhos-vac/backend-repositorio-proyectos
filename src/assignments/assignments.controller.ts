import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowPendingPassword, Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';
import { AssignmentsService } from './assignments.service';
import { SetAssignmentDto } from './dto/set-assignment.dto';

/** Docente encargado por carrera + nivel (1 a 4). */
@ApiTags('Assignments')
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  @Auth(ValidRoles.ADMIN)
  findAll() {
    return this.service.findAll();
  }

  @Get('mine')
  @Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
  mine(@GetUser() user: User) {
    return this.service.findMine(user.id);
  }

  /** Docente asignado a mi carrera y nivel (estudiante). */
  @Get('my-teacher')
  @Auth()
  @AllowPendingPassword()
  myTeacher(@GetUser() user: User) {
    return this.service.myTeacher(user as any);
  }

  @Put()
  @Auth(ValidRoles.ADMIN)
  set(@Body() dto: SetAssignmentDto) {
    return this.service.set(dto);
  }
}
