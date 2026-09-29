import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";
import { stripSensitive } from "./sanitize";

/** Red de seguridad global: elimina hashes/tokens de cualquier respuesta. */
@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
	intercept(_ctx: ExecutionContext, next: CallHandler) {
		return next.handle().pipe(map((data) => stripSensitive(data)));
	}
}
