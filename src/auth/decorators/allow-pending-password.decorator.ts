import { SetMetadata } from "@nestjs/common";

export const ALLOW_PENDING_PASSWORD_KEY = "allowPendingPassword";

/**
 * Permite el endpoint aunque el usuario tenga pendiente el cambio de clave
 * (needsPasswordChange). Sin este decorador, esos usuarios reciben 403
 * hasta que cambien su contraseña.
 */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
