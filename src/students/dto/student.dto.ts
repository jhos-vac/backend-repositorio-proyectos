import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PaginationDto } from 'src/Libs/common';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Estudiante sin cuenta (BE-08): lo registra el docente o el ADMIN. */
export class CreateStudentDto {
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(254)
  email: string;

  @IsUUID('all', { message: 'La carrera no es válida' })
  careerId: string;

  @Type(() => Number)
  @IsInt({ message: 'El nivel debe ser un número entero' })
  @Min(1, { message: 'El nivel mínimo es 1' })
  @Max(4, { message: 'El nivel máximo es 4' })
  level: number;

  /** Grupo, paralelo o sección (texto libre, por ejemplo "A"). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  group?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  academicPeriod?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

/** Carga masiva: se crean todos o ninguno. */
export class CreateStudentsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El archivo no tiene estudiantes.' })
  @ArrayMaxSize(500, { message: 'Máximo 500 estudiantes por archivo.' })
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  students: CreateStudentDto[];
}

export class StudentQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  careerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  group?: string;
}
