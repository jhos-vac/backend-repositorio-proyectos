import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, Matches } from 'class-validator';

export const DOC_KINDS = ['informe', 'presentacion', 'otro'] as const;
export const LINK_TYPES = ['repositorio', 'demo', 'video', 'otro'] as const;

export class UploadDocumentDto {
  @IsOptional()
  @IsIn(DOC_KINDS)
  kind?: (typeof DOC_KINDS)[number];
}

export class CreateLinkDto {
  @IsIn(LINK_TYPES)
  type: (typeof LINK_TYPES)[number];

  @IsString()
  @MaxLength(300)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true }, { message: 'El enlace debe ser una URL https válida.' })
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  /** Tag (v1.0.0) o commit de la versión final */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._\/-]{1,80}$/, { message: 'La versión solo admite letras, números, . _ - y /.' })
  ref?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isFinal?: boolean;
}
