import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marca un endpoint como público (sin token). Todo endpoint que NO lleve
 * este decorador exige un JWT de acceso válido (default-deny).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
