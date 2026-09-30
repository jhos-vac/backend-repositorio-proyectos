import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewProjectDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  /** Observación para el estudiante (obligatoria al rechazar) */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
