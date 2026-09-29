/** Campos que NUNCA deben salir en una respuesta HTTP. */
export const SENSITIVE_KEYS = new Set([
	"password",
	"resetToken",
	"resetTokenExpiry",
	"activationToken",
	"tokenVersion",
]);

/** Para usar en `omit` de Prisma (consultas de User). */
export const USER_OMIT = {
	password: true,
	resetToken: true,
	resetTokenExpiry: true,
	activationToken: true,
	tokenVersion: true,
} as const;

export function stripSensitive(value: any): any {
	if (Array.isArray(value)) return value.map(stripSensitive);
	if (value && typeof value === "object" && !(value instanceof Date)) {
		const out: Record<string, any> = {};
		for (const [k, v] of Object.entries(value)) {
			if (!SENSITIVE_KEYS.has(k)) out[k] = stripSensitive(v);
		}
		return out;
	}
	return value;
}
