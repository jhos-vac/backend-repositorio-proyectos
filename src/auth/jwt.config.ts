import { ConfigService } from "@nestjs/config";

export const ACCESS_TTL = "30m";
export const REFRESH_TTL = "7d";

/** Lee un secreto y aborta el arranque si falta o es débil. */
export function requireSecret(config: ConfigService, name: string): string {
	const value = config.get<string>(name);
	if (!value || value.length < 32) {
		throw new Error(
			`${name} debe estar definido y tener al menos 32 caracteres (genera uno con: openssl rand -hex 32).`,
		);
	}
	return value;
}

export function loadJwtSecrets(config: ConfigService) {
	const access = requireSecret(config, "JWT_SECRET");
	const refresh = requireSecret(config, "JWT_REFRESH_SECRET");
	if (access === refresh) {
		throw new Error("JWT_SECRET y JWT_REFRESH_SECRET deben ser distintos.");
	}
	return { access, refresh };
}
