import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
// IMPORTANTE: Asegúrate de que esta ruta coincida con donde creaste el validador

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  /** Solo lo usan docentes/admin; para estudiantes se toma de su perfil */
  @ApiProperty({ required: false, minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;
}