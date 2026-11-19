/**
 * Dominios de correo institucional (RN-01): las cuentas de docentes solo se crean
 * con estos dominios. Se configuran con INSTITUTIONAL_EMAIL_DOMAIN (separados por coma).
 */
export function institutionalDomains(): string[] {
	return (process.env.INSTITUTIONAL_EMAIL_DOMAIN || 'sudamericano.edu.ec')
		.split(',')
		.map((d) => d.trim().toLowerCase().replace(/^@/, ''))
		.filter(Boolean);
}

export function isInstitutionalEmail(email: string): boolean {
	const domain = (email.split('@')[1] ?? '').trim().toLowerCase();
	return institutionalDomains().includes(domain);
}

export function institutionalEmailMessage(): string {
	return `El correo debe ser institucional (${institutionalDomains().map((d) => '@' + d).join(', ')}).`;
}
