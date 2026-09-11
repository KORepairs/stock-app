// Pure SSL option helper. Never logs or returns the connection string.

export function resolvePgSsl(connectionString, pgSslMode) {
  let sslMode = String(pgSslMode || '').trim().toLowerCase();

  if (!sslMode) {
    try {
      const parsed = new URL(String(connectionString || ''));
      sslMode = String(parsed.searchParams.get('sslmode') || '').trim().toLowerCase();
    } catch {
      // Invalid or missing URL: leave sslMode unset.
    }
  }

  if (sslMode === 'disable') return false;
  if (sslMode === 'verify-full' || sslMode === 'verify-ca') {
    return { rejectUnauthorized: true };
  }
  if (
    sslMode === 'require' ||
    sslMode === 'prefer' ||
    sslMode === 'allow' ||
    sslMode === 'no-verify'
  ) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}
