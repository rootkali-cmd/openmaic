import type { PoolConfig } from 'pg';

/**
 * Heroku (and most hosted PostgreSQL providers) require TLS but do not include
 * `sslmode` in the DATABASE_URL they attach, and `pg` does not negotiate TLS
 * unless the URL (or an ssl option) says to. `no-verify` keeps the connection
 * encrypted without chain verification: since pg 8.11 `require` is treated as
 * `verify-full`, which fails against Heroku's rotating CA chain. Local
 * development databases (`localhost`, `127.0.0.1`) keep plaintext as before.
 */
export function withSslForRemoteHosts<T extends { connectionString?: string }>(config: T): T {
  const connectionString = config.connectionString?.trim();
  if (!connectionString || /(?:[?&]|^)sslmode=/.test(connectionString)) return config;
  const match = /^postgres(?:ql)?:\/\/([^/@]*)@([^/:?#]+)/.exec(connectionString);
  const host = match?.[2];
  if (!host || /^(localhost|127\.0\.0\.1|::1)$/.test(host)) return config;
  return {
    ...config,
    connectionString:
      connectionString.includes('?')
        ? `${connectionString}&sslmode=no-verify`
        : `${connectionString}?sslmode=no-verify`,
  };
}

/** Convenience for pools built only from a connection string. */
export function poolConfigFor(connectionString: string, extra?: PoolConfig): PoolConfig {
  return withSslForRemoteHosts({ ...extra, connectionString: connectionString.trim() });
}
