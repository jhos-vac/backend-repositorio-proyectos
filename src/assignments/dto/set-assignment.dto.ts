import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class SetAssignmentDto {
  @IsUUID() careerId: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(4)
  level: number;

  /** UUID del docente; null/omitido = quitar la asignación */
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  teacherId?: string | null;
}
