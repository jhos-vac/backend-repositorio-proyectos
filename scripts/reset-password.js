// Restablece la contraseña de un usuario existente SIN tocar el resto de datos.
// Uso (dentro del contenedor del backend o donde exista DATABASE_URL):
//   node scripts/reset-password.js correo@dominio.com 'NuevaClave#2026'
// Cierra sus sesiones activas y lo marca como verificado.
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) { console.error("Uso: node scripts/reset-password.js <correo> '<clave>'"); process.exit(1); }
  if (password.length < 8) { console.error('La clave debe tener al menos 8 caracteres.'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = bcrypt.hashSync(password, 12);
  const r = await pool.query(
    'UPDATE "User" SET password=$1, "tokenVersion"="tokenVersion"+1, "needsPasswordChange"=false, "isVerified"=true, "resetToken"=NULL WHERE lower(email)=lower($2) RETURNING email',
    [hash, email],
  );
  console.log(r.rowCount ? `Contraseña actualizada para ${r.rows[0].email}` : `No existe un usuario con el correo ${email}`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
