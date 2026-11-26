import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';
import { StudentsService } from './students.service';
import { CreateStudentDto, CreateStudentsDto, StudentQueryDto, UpdateStudentDto } from './dto/student.dto';

/** Estudiantes sin cuenta (BE-08): los gestionan el docente (sus carrera y nivel) y el ADMIN. */
@ApiTags('Students')
@Controller('students')
@Auth(ValidRoles.TEACHER, ValidRoles.ADMIN)
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  list(@Query() q: StudentQueryDto, @GetUser() user: User) {
    return this.service.list(q, user as any);
  }

  @Post()
  create(@Body() dto: CreateStudentDto, @GetUser() user: User) {
    return this.service.create(dto, user as any);
  }

  /** Carga masiva (archivo): todos o ninguno. */
  @Post('bulk')
  createMany(@Body() dto: CreateStudentsDto, @GetUser() user: User) {
    return this.service.createMany(dto.students, user as any);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.service.findOne(id, user as any);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto, @GetUser() user: User) {
    return this.service.update(id, dto, user as any);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.service.remove(id, user as any);
  }
}
