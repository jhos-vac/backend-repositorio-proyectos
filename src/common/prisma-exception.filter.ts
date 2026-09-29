import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Prisma } from "src/prisma/generated/client";

/** Traduce errores de Prisma a códigos HTTP correctos, sin filtrar detalles internos. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
	catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
		const res = host.switchToHttp().getResponse();
		const map: Record<string, [number, string]> = {
			P2025: [HttpStatus.NOT_FOUND, "Registro no encontrado"],
			P2002: [HttpStatus.CONFLICT, "Ya existe un registro con esos datos"],
			P2003: [HttpStatus.CONFLICT, "Operación inválida: hay datos relacionados"],
			P2023: [HttpStatus.BAD_REQUEST, "Identificador inválido"],
		};
		const [status, message] = map[e.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, "Error interno del servidor"];
		res.status(status).json({ statusCode: status, message });
	}
}
