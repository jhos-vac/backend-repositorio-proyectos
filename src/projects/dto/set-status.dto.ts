import { IsIn } from 'class-validator';
import { PROGRESS_STATUSES } from './project-query.dto';

/** Marcar un proyecto como completado o reabrirlo (docente o ADMIN). */
export class SetStatusDto {
  @IsIn(PROGRESS_STATUSES, { message: `El estado debe ser uno de: ${PROGRESS_STATUSES.join(', ')}` })
  status: (typeof PROGRESS_STATUSES)[number];
}
