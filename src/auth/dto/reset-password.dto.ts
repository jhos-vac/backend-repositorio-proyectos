import { IsString, IsStrongPassword, MaxLength } from "class-validator";
import { STRONG_PASSWORD, STRONG_PASSWORD_MESSAGE } from "src/common/password";

export class ResetPasswordDto {
	@IsString()
	@MaxLength(72)
	@IsStrongPassword(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
	password: string;
}
