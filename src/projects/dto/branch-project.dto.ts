import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MAX_STUDENTS, MODALITIES, type Modality } from './create-project.dto';

export class BranchProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  academic_period?: string;

  /** Nivel de la continuación (por defecto, el del original). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;

  /** Estudiantes de la continuación; si se omite, hereda la modalidad y queda sin estudiantes. */
  @IsOptional()
  @IsIn(MODALITIES)
  modality?: Modality;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STUDENTS)
  @IsUUID('all', { each: true })
  studentIds?: string[];
}
