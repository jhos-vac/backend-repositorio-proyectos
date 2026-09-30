// Migración única e idempotente: los enlaces http(s) guardados dentro de "deliverables"
// pasan a la tabla ProjectLink (repositorio si es GitHub/GitLab/Bitbucket, si no "otro").
// Se ejecuta en cada arranque del contenedor; no duplica ni borra nada.
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`SELECT id, deliverables, "createdBy" FROM "Project" WHERE cardinality(deliverables) > 0`);
    let n = 0;
    for (const p of rows) {
      for (const item of p.deliverables) {
        if (!/^https:\/\//i.test(item)) continue;
        let host = '';
        try { host = new URL(item).hostname.replace(/^www\./, '').toLowerCase(); } catch { continue; }
        const type = ['github.com', 'gitlab.com', 'bitbucket.org'].includes(host) ? 'repositorio' : 'otro';
        const r = await pool.query(
          `INSERT INTO "ProjectLink" (id, "projectId", type, url, "isFinal", "createdById") VALUES ($1,$2,$3,$4,false,$5) ON CONFLICT ("projectId", url) DO NOTHING`,
          [randomUUID(), p.id, type, item.slice(0, 300), p.createdBy],
        );
        n += r.rowCount;
      }
    }
    console.log(`[migracion] enlaces migrados a ProjectLink: ${n}`);
  } catch (e) {
    console.log('[migracion] omitida:', e.message);
  } finally { await pool.end(); }
})();
