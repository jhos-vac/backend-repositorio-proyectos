export type TokenType = "access" | "refresh";

export interface JwtPayload {
	/** ID del usuario */
	sub: string;
	/** Tipo de token: evita usar un refresh como access y viceversa */
	typ: TokenType;
	/** Versión de tokens del usuario; si cambia, los tokens antiguos mueren */
	tv: number;
}
