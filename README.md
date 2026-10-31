# RepoDigital – Backend

API del **Sistema Semillero (RepoDigital)**: el repositorio de proyectos del instituto. Los proyectos se registran, los revisa un docente y se pueden continuar en ciclos siguientes mediante "ramas" (continuaciones).

- **Stack:** NestJS 11, Prisma 7, PostgreSQL 16.
- **Base de la API:** `/api` (por ejemplo `GET /api/projects`).
- **Frontend:** [frontend-repositorio-proyectos](https://github.com/jhos-vac/frontend-repositorio-proyectos).
- **Despliegue (compose y scripts del servidor):** repositorio privado `semillero-deploy`.

## Roles

| Rol | Nombre en la BD | Puede |
|---|---|---|
| Administrador | `ADMIN` | Todo: usuarios, asignaciones, períodos y proyectos. |
| Docente | `TEACHER` | Revisar (aprobar o rechazar) los proyectos de su carrera y nivel. |
| Estudiante | `USER` | Registrar proyectos, editarlos mientras no estén aprobados y continuar proyectos aprobados. |

Todo endpoint exige un JWT de acceso salvo los marcados con `@Public()` (política de denegar por defecto). Si un usuario tiene una clave temporal (`needsPasswordChange`), solo puede usar los endpoints marcados con `@AllowPendingPassword()` hasta que la cambie.

## Desarrollo local

Lo más simple es levantar todo con Docker desde la carpeta raíz del proyecto (la que contiene este repo y el del frontend), con los scripts `iniciar.ps1` / `iniciar.sh` de `semillero-deploy`.

Para correr solo el backend con Node:

1. Requisitos: Node 22 y un PostgreSQL 16 accesible.
2. Crea un archivo `.env` con al menos `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` (ver la tabla de variables).
3. Instala dependencias y genera el cliente de Prisma:

   ```bash
   npm install
   ```

   ```bash
   npx prisma generate
   ```

4. Aplica las migraciones y carga los datos iniciales (el seed **borra** la base antes de insertar; úsalo solo en una base vacía o de pruebas):

   ```bash
   npx prisma migrate deploy
   ```

   ```bash
   npx ts-node prisma/seed.ts
   ```

5. Inicia la API en modo desarrollo (puerto 8000 por defecto):

   ```bash
   npm run start:dev
   ```

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL. |
| `JWT_SECRET` | Sí | Secreto de los tokens de acceso (mínimo 32 caracteres). |
| `JWT_REFRESH_SECRET` | Sí | Secreto de los tokens de renovación (mínimo 32 caracteres y distinto del anterior). |
| `PORT` | No | Puerto de la API (por defecto `8000`). |
| `NODE_ENV` | No | Con `production` se desactivan los orígenes CORS de desarrollo y se valida el dominio del correo por DNS (MX). |
| `FRONTEND_URL` | No | Origen del frontend; se permite en CORS y se usa en los enlaces de los correos. |
| `CORS_ORIGINS` | No | Orígenes extra permitidos, separados por coma (sin comodines). |
| `DOCS_DIR` | No | Carpeta privada de los PDF (por defecto `storage/documents`). |
| `MAX_PDF_MB` | No | Tamaño máximo por PDF en MB (por defecto `20`). |
| `CLAMAV_HOST`, `CLAMAV_PORT` | No | Antivirus ClamAV opcional para los PDF. Si está configurado y no responde, la subida se rechaza. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | No | Admin que crea el seed (si falta la clave, se genera una aleatoria). |
| `SEED_DEMO_PASSWORD` | No | Clave de las cuentas demo del seed (si falta, aleatoria). |
| `MAIL_CLIENT_ID`, `MAIL_CLIENT_SECRET`, `MAIL_REFRESH_TOKEN`, `MAIL_USER` | No | Gmail API para "recuperar contraseña". |
| `DEV_RESET` | No | **Solo desarrollo.** Con `true`, el script de arranque de Docker (`docker/backend-start.sh`) borra y vuelve a sembrar la base en cada inicio, y el seed muestra las credenciales de prueba. Nunca en producción. |
| `THROTTLE_DISABLED` | No | **Solo pruebas.** Desactiva el límite de peticiones. |

## Base de datos y migraciones

El esquema vive en `prisma/schema.prisma` y los cambios se aplican con **migraciones** (ya no con `db push`). Para cambiar el esquema:

1. Edita `prisma/schema.prisma`.
2. Genera la migración contra tu base local:

   ```bash
   npx prisma migrate dev --name describe_el_cambio
   ```

3. Haz commit de la carpeta nueva en `prisma/migrations/`. En el servidor se aplica sola al arrancar (`prisma migrate deploy`).

Un cambio que borra o renombra columnas puede perder datos: revísalo en el SQL generado antes de subirlo.

## Archivos

- **Fotos de perfil:** en `uploads/` (público, servido en `/uploads/...`). Solo JPG, PNG, WEBP o GIF de hasta 5 MB, validados por su contenido real.
- **PDF de los proyectos:** en `DOCS_DIR`, fuera de la carpeta pública; se descargan por la API según los permisos del proyecto.

## Pruebas

```bash
npm test
```

En `test-security/` hay pruebas de seguridad en Python que se corren contra una API levantada en `localhost:8000`:

- `matrix.py`: matriz endpoint × rol. Lee las rutas que Nest registra al arrancar y **falla si alguna ruta no tiene política declarada**; al agregar un endpoint, añádelo ahí.
- `jwt_and_logic.py`, `workflow.py`, `files.py`: tokens, flujo de revisión y subida de archivos.

## Flujo de trabajo (Gitflow)

- `main`: lo que está en producción. **Cada push a `main` se despliega solo** en el servidor (runner autoalojado).
- `develop`: integración.
- `feature/<nombre>`: se crea desde `develop` y vuelve a `develop` con un PR.
- Publicar = PR de `develop` a `main`.

La CI (`.github/workflows/ci-cd.yml`) compila en cada push a `develop`, `feature/**`, `release/**`, `hotfix/**` y en los PR. El lint y las pruebas aún no bloquean.
