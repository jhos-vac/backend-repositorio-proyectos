/**
 * Regla única de contraseña segura para @IsStrongPassword. Además del largo
 * mínimo, class-validator exige por defecto una mayúscula, una minúscula, un
 * número y un símbolo: el mensaje lo dice completo (igual que los formularios).
 */
export const STRONG_PASSWORD = { minLength: 6 } as const;

export const STRONG_PASSWORD_MESSAGE =
	'La contraseña debe tener al menos 6 caracteres e incluir una mayúscula, una minúscula, un número y un símbolo.';

/**
 * Contraseña inicial de toda cuenta creada por el ADMIN (alta, carga masiva o
 * restablecimiento). Es conocida, así que la cuenta queda con needsPasswordChange
 * y el usuario debe cambiarla en su primer ingreso antes de usar el sistema.
 */
export const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'ITS_Semillero';
