import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Datos del proyecto que se está registrando, para buscar parecidos (RN-04). */
export class SimilarQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Al editar, el propio proyecto no cuenta como parecido. */
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
