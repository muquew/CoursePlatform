import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from './schema.ts';
import { getConfig } from '../config/index.ts';

const cfg = getConfig();
const sqlitePath = process.env.DATABASE_URL || cfg.database.url || 'sqlite.db';
const client = new Database(sqlitePath);

export const db = drizzle(client, { schema, logger: cfg.database.logger });

// 导出客户端，以便在整个应用中使用
export type DBClient = typeof db;

const hasTable = (name: string) => {
  try {
    const row = client
      .query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(name) as { name: string } | undefined;
    return !!row;
  } catch {
    return false;
  }
};

for (const ddl of schema.sqliteTriggers) {
  try {
    const match = ddl.match(/ON\s+(\w+)/i);
    const tableName = match ? match[1] : null;
    if (tableName && !hasTable(tableName)) continue;
    client.run(ddl);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (!msg.includes('no such table')) {
      console.error('SQLite trigger install failed:', e);
    }
  }
}
