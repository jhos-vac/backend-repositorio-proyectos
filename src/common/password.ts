/**
 * Regla única de contraseña segura para @IsStrongPassword. Además del largo
 * mínimo, class-validator exige por defecto una mayúscula, una minúscula, un
 * número y un símbolo: el mensaje lo dice completo (igual que los formularios).
 */
export const STRONG_PASSWORD = { minLength: 6 } as const;

export const STRONG_PASSWORD_MESSAGE =
	'La contraseña debe tener al menos 6 caracteres e incluir una mayúscula, una minúscula, un número y un símbolo.';
