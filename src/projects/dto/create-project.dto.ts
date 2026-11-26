import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  Max,
  Min,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PROGRESS_STATUSES } from './project-query.dto';

export const MODALITIES = ['individual', 'grupal'] as const;
export type Modality = (typeof MODALITIES)[number];
/** Máximo de estudiantes en un proyecto grupal. */
export const MAX_STUDENTS = 8;

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty() 
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty() 
  description: string;

  /** Solo 'en progreso' o 'completado'. Al crear se ignora: todo proyecto nace en progreso. */
  @ApiProperty({ required: false, enum: PROGRESS_STATUSES, default: 'en progreso' })
  @IsOptional()
  @IsIn(PROGRESS_STATUSES, { message: `El estado debe ser uno de: ${PROGRESS_STATUSES.join(', ')}` })
  status?: (typeof PROGRESS_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  problems?: string;
  
  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  summary?: string;

  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString({ each: true })
  objectives?: string[];

  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  cycle?: string;
  
  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  academic_period?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliverables?: string[];



  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  careerId: string;

  /** Nivel de la carrera; el docente solo registra en sus carrera y nivel asignados. */
  @ApiProperty({ minimum: 1, maximum: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level: number;

  /** BE-08: individual = 1 estudiante; grupal = 2 o más. */
  @ApiProperty({ enum: MODALITIES })
  @IsIn(MODALITIES, { message: `La modalidad debe ser: ${MODALITIES.join(' o ')}` })
  modality: Modality;

  /** Estudiantes (registros de /api/students) de la misma carrera y nivel del proyecto. */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un estudiante.' })
  @ArrayMaxSize(MAX_STUDENTS, { message: `Un proyecto admite hasta ${MAX_STUDENTS} estudiantes.` })
  @IsUUID('all', { each: true })
  studentIds: string[];
}
