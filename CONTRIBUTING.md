# Reglas de programación – Backend

Reglas para trabajar en equipo en el backend de RepoDigital (Semillero). Si una regla no encaja con tu caso, coméntalo en el PR antes de saltártela.

## 1. Flujo de trabajo (gitflow)

- **Nunca hagas commit ni push directo a `main` ni a `develop`.** Cada push a `main` se despliega solo en el servidor.
- Cada card del tablero de Notion tiene su rama `feature/<código>-<tarea>` ya creada desde `develop` (el nombre está en la propiedad **Rama** de la card). Trabaja solo en la rama de tu card.
- Antes de empezar, y cada vez que retomes:

  ```bash
  git fetch origin
  git switch feature/be-03-permiso-completado
  git merge origin/develop
  ```

- Una card = una rama = un PR hacia `develop`. Si la tarea es grande, divídela en PR más pequeños.
- Los conflictos se resuelven en tu rama (mergeando `develop` en ella), nunca en `develop`.
- **Release:** un PR de `develop` a `main`, que hace el responsable del despliegue. Si el cambio toca el esquema de la base o una API que usa el frontend, se publica primero el backend.
- **Urgencias en producción:** rama `hotfix/<tarea>` desde `main`, con PR a `main` y luego a `develop`.
- Después del merge, borra la rama (GitHub ofrece el botón en el PR).

## 2. Commits

- En español, en presente y con prefijo: `backend:`, `test:`, `docs:` o `ci:`.
  Ejemplo: `backend: permiso para marcar un proyecto como completado`
- Primera línea de 72 caracteres como máximo; en el cuerpo explica **por qué** se hizo el cambio.
- Un commit = un cambio coherente. No mezcles cambios de formato con cambios de lógica.
- **Nunca subas** `.env`, secretos, contraseñas, `node_modules/`, `dist/`, `uploads/` ni `storage/`.

## 3. Pull requests

- Base: `develop`. Título como el commit principal.
- Descripción con:
  - la card (código y enlace de Notion);
  - qué cambia y por qué;
  - cómo lo probaste (comandos y resultados);
  - si cambia el esquema, el nombre de la migración.
- **CI en verde obligatorio** y **al menos una revisión** de otra persona antes de mergear. No mergees tu propio PR sin revisión.
- Actualiza la card en Notion: **En progreso** al empezar, el enlace del PR al abrirlo, y **Hecho** cuando llegue a producción.

## 4. Estilo de código

- TypeScript. Nombres de variables, funciones y clases en **inglés**; mensajes al usuario y comentarios en **español**.
- Comentarios para explicar el **porqué**, no el qué. Nada de código comentado ni `console.log` de depuración.
- Formato con Prettier (`singleQuote`, `trailingComma: all`) y lint antes del PR:

  ```bash
  npm run lint
  ```

- Evita `any` nuevo; si no hay más remedio, explica el motivo en un comentario.

## 5. Estructura (NestJS)

- Un módulo por dominio: `src/<módulo>/` con `*.module.ts`, `*.controller.ts`, `*.service.ts` y `dto/`.
- **Controlador delgado:** recibe, valida y delega. La lógica y las consultas van en el servicio.
- Lo compartido va en `src/common/` (por ejemplo `password.ts`, `access.ts`, `sanitize.ts`). No dupliques reglas.

## 6. Validación y errores

- Todo `body` y `query` entra por un **DTO con class-validator**, con mensajes en español. El `ValidationPipe` global rechaza lo que no cumple.
- Las reglas que se repiten se definen una vez (por ejemplo `STRONG_PASSWORD` en `src/common/password.ts`).
- Los errores se lanzan con las excepciones de Nest (`BadRequestException`, `ForbiddenException`, `NotFoundException`…) y mensajes claros en español.

## 7. Seguridad

- **Todo endpoint exige sesión** salvo los marcados con `@Public()`. Los roles se restringen con `@Auth(ValidRoles.ADMIN)` y similares.
- Los permisos finos (quién ve o edita qué) se resuelven en el servicio, reutilizando lo existente (`visibleWhere`, `assertSelfOrAdmin`).
- **Nunca devuelvas** contraseñas ni tokens: en consultas de usuarios usa `USER_OMIT`.
- **Cada ruta nueva** se declara con su política en `test-security/matrix.py`. Esa prueba falla si una ruta no la tiene.
- Archivos subidos: valida el tipo por su contenido (magic bytes, ver `src/common/image-signature.ts`) y el tamaño.
- Los secretos solo van en variables de entorno, nunca en el código.

## 8. Base de datos (Prisma)

- Los cambios de esquema se hacen **solo con migraciones**:

  ```bash
  npx prisma migrate dev --name describe_el_cambio
  ```

  Haz commit de la carpeta nueva en `prisma/migrations/`. En el servidor se aplica sola al arrancar.
- **Nunca** uses `prisma db push` ni edites una migración que ya está en `develop`.
- Si un cambio afecta datos existentes, agrega el `UPDATE` en la misma migración.
- Revisa el SQL generado: borrar o renombrar columnas puede perder datos.
- Los listados se paginan con `PaginationDto` (máximo 1000 por página) y se filtran en el servidor.

## 9. Pruebas antes del PR

1. `npm run build` sin errores (lo revisa la CI).
2. `npm test` sin fallos nuevos.
3. Si agregaste o cambiaste rutas: política en `test-security/matrix.py`.
4. Si cambiaste el esquema: migración incluida y sin diferencias entre la base y el esquema:

   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
   ```

5. Probar los endpoints con los 3 roles (ADMIN, TEACHER, USER) y sin sesión.
6. Las pruebas propias de la card (sección **Pruebas que debe pasar** en Notion).
