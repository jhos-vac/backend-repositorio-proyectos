import { IsNotEmpty, IsString, IsStrongPassword, MaxLength } from "class-validator";

export class ChangePasswordDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(72)
	oldPassword: string;

	@IsString()
	@MaxLength(72)
	@IsStrongPassword(
		{ minLength: 6 },
		{ message: "La contraseña no es lo suficientemente fuerte (mínimo 6 caracteres, letras y números)" },
	)
	newPassword: string;
}
