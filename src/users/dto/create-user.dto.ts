import { ApiProperty } from "@nestjs/swagger";
import { Type } from 'class-transformer';
import { IsInt, Max, Min, IsEmail, IsOptional, IsString, IsStrongPassword, IsUUID, MaxLength } from "class-validator";
import { STRONG_PASSWORD, STRONG_PASSWORD_MESSAGE } from "src/common/password";

/**
 * Data Transfer Object para la creación de usuarios y docentes.
 * Define las reglas de validación para los datos recibidos desde el frontend.
 */
export class CreateUserDto {
    @ApiProperty({ description: 'Correo electrónico del usuario' })
    @IsEmail({}, { message: 'El correo electrónico no es válido' })
    email: string;

    @ApiProperty({ description: 'Contraseña segura del usuario' })
    @MaxLength(72) // límite real de bcrypt
    @IsStrongPassword(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
    password: string;

    @ApiProperty({ description: 'Nombre completo del usuario' })
    @IsString({ message: 'El nombre debe ser una cadena de texto' })
    @MaxLength(120)
    name: string;

    @ApiProperty({ description: 'UUID del rol asignado (Opcional para registro público)' })
    @IsUUID('all', { message: 'El roleId debe ser un UUID válido' })
    @IsOptional() // <--- AGREGADO: Esto permite que el registro público funcione sin enviar roleId
    roleId?: string;

    @ApiProperty({ description: 'UUID de la carrera asignada' })
    @IsUUID('all', { message: 'El careerId debe ser un UUID válido' })
    careerId: string;

    @ApiProperty({ description: 'Nivel del estudiante (1 a 4)', required: false, minimum: 1, maximum: 4 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El nivel debe ser un número entero' })
    @Min(1, { message: 'El nivel mínimo es 1' })
    @Max(4, { message: 'El nivel máximo es 4' })
    level?: number;
}
