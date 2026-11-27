import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, Matches, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { MAX_STUDENTS, MODALITIES, type Modality } from './create-project.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Máximo de proyectos por archivo de carga masiva. */
export const MAX_BULK_PROJECTS = 100;

/** Una fila de la plantilla (BE-11). Los estudiantes van por correo, no por id. */
export class BulkProjectRowDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'falta el nombre del proyecto' })
  @MaxLength(200)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'falta la descripción' })
  description: string;

  @IsUUID('all', { message: 'la carrera no es válida' })
  careerId: string;

  @Type(() => Number)
  @IsInt({ message: 'el nivel debe ser un número entero' })
  @Min(1, { message: 'el nivel mínimo es 1' })
  @Max(4, { message: 'el nivel máximo es 4' })
  level: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(MODALITIES, { message: `la modalidad debe ser ${MODALITIES.join(' o ')}` })
  modality: Modality;

  /** Opcional: el docente siempre registra en el período activo; el ADMIN puede indicar otro. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  academic_period?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'indica al menos un estudiante (correo o cédula)' })
  @ArrayMaxSize(MAX_STUDENTS, { message: `un proyecto admite hasta ${MAX_STUDENTS} estudiantes` })
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)) : value))
  // Correo institucional o cédula del estudiante (los del SGA no traen correo)
  @IsString({ each: true })
  @Matches(/^(\S+@\S+\.\S+|\d{10})$/, { each: true, message: 'cada estudiante debe ser un correo o una cédula de 10 dígitos' })
  studentEmails: string[];

  @IsOptional() @Transform(trim) @IsString() summary?: string;
  @IsOptional() @Transform(trim) @IsString() problems?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) objectives?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) deliverables?: string[];
}

export class CreateProjectsDto {
  @ApiProperty({ type: [BulkProjectRowDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El archivo no tiene proyectos.' })
  @ArrayMaxSize(MAX_BULK_PROJECTS, { message: `Máximo ${MAX_BULK_PROJECTS} proyectos por archivo.` })
  @ValidateNested({ each: true })
  @Type(() => BulkProjectRowDto)
  projects: BulkProjectRowDto[];
}
