import { Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsStrongPassword, IsUUID, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { STRONG_PASSWORD, STRONG_PASSWORD_MESSAGE } from 'src/common/password';

/** Edición completa de un usuario por el ADMIN (incluye rol, carrera, nivel y reinicio de clave). */
export class AdminUpdateUserDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;

  @IsOptional() @IsUUID('all')
  roleId?: string;

  @IsOptional() @IsUUID('all')
  careerId?: string;

  /** 1-4, o null para quitar el nivel (docentes/admin) */
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @Type(() => Number) @IsInt() @Min(1) @Max(4)
  level?: number | null;

  /** Si se envía, reinicia la contraseña y cierra las sesiones del usuario */
  @IsOptional() @IsString() @MaxLength(72)
  @IsStrongPassword(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
  password?: string;

  @IsOptional() @IsBoolean()
  needsPasswordChange?: boolean;
}
