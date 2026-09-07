// Shared PostgreSQL connection config. Never logs or returns secrets in errors.
import { resolvePgSsl } from './pgSsl.js';

const COMPONENT_KEYS = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];

function missingComponentKeys(env) {
  return COMPONENT_KEYS.filter((key) => !String(env[key] ?? '').trim());
}

export function resolvePgConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();

  if (databaseUrl) {
    const config = { connectionString: databaseUrl };
    const ssl = resolvePgSsl(databaseUrl, env.PGSSLMODE);
    if (ssl !== undefined) config.ssl = ssl;
    return { ok: true, config };
  }

  const missing = missingComponentKeys(env);
  if (missing.length === COMPONENT_KEYS.length) {
    return {
      ok: false,
      error:
        'PostgreSQL is not configured. Set DATABASE_URL or PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD.',
    };
  }
  if (missing.length) {
    return {
      ok: false,
      error: `PostgreSQL component configuration is incomplete. Missing: ${missing.join(', ')}.`,
    };
  }

  const port = Number(String(env.PGPORT).trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      error: 'PGPORT must be an integer from 1 to 65535.',
    };
  }

  const config = {
    host: String(env.PGHOST).trim(),
    port,
    database: String(env.PGDATABASE).trim(),
    user: String(env.PGUSER).trim(),
    password: String(env.PGPASSWORD),
  };

  const ssl = resolvePgSsl('', env.PGSSLMODE);
  if (ssl !== undefined) config.ssl = ssl;

  return { ok: true, config };
}
