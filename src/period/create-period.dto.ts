import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Un período académico se define solo con mes y año de inicio y de fin. */
export class CreatePeriodDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  startMonth: number;

  @Type(() => Number) @IsInt() @Min(2020) @Max(2100)
  startYear: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  endMonth: number;

  @Type(() => Number) @IsInt() @Min(2020) @Max(2100)
  endYear: number;
}
