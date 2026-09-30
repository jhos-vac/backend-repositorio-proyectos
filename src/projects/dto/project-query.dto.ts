import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationDto } from 'src/Libs/common';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** Filtros del listado de proyectos (todos opcionales). */
export class ProjectQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  reviewStatus?: (typeof REVIEW_STATUSES)[number];

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
}
