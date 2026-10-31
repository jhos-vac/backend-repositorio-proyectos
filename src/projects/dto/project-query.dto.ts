import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from 'src/Libs/common';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
/** Únicos estados de avance que se guardan en Project.status. */
export const PROGRESS_STATUSES = ['en progreso', 'completado'] as const;

/** Filtros del listado de proyectos (todos opcionales). */
export class ProjectQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  reviewStatus?: (typeof REVIEW_STATUSES)[number];

  /** Estado de avance; si el proyecto tiene fechas, se calcula con ellas (igual que en el listado). */
  @IsOptional()
  @IsIn(PROGRESS_STATUSES)
  status?: (typeof PROGRESS_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  careerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;

  /** continuations = proyectos que continúan a otro; origins = proyectos que ya tienen continuaciones */
  @IsOptional()
  @IsIn(['continuations', 'origins'])
  continuity?: 'continuations' | 'origins';

  /** Solo los creados por el usuario que consulta */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  /** Solo los de ciclos (períodos académicos) ya terminados; solo aprobados (se pueden continuar). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  pastPeriods?: boolean;

  /** Etiquetas (tecnologías): ids separados por coma. El proyecto debe tener todas. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  @IsArray()
  @IsUUID('all', { each: true })
  skillIds?: string[];

  /** Período académico exacto (ej. "Septiembre-2026"). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  period?: string;
}
