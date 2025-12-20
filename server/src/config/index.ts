// src/config/index.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppConfig = {
  service: {
    name: string;
    version: string;
    description: string;
  };
  server: {
    port: number;
    cors: { originRegex: string };
  };
  security: {
    jwt: { secret: string; exp: string };
    csrf: { enabled: boolean };
  };
  rateLimit: {
    windowMs: number;
    limit: number;
  };
  database: {
    url: string;
    logger: boolean;
  };
  storage: {
    root: string;
  };
  admin: {
    bootstrap: boolean;
  };
};

const DEFAULTS: AppConfig = {
  service: {
    name: 'Course Management Platform',
    version: '1.0.0',
    description: 'Software Engineering Case Practice Course Management Platform',
  },
  server: {
    port: 3000,
    cors: { originRegex: 'localhost:\\d+$' },
  },
  security: {
    jwt: { secret: '', exp: '7d' },
    csrf: { enabled: true },
  },
  rateLimit: {
    windowMs: 60_000,
    limit: 120,
  },
  database: {
    url: 'sqlite.db',
    logger: true,
  },
  storage: {
    root: 'storage',
  },
  admin: {
    bootstrap: true,
  },
};

function readJsonIfExists(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deepMerge<T extends Record<string, any>>(base: T, patch: any): T {
  if (!patch || typeof patch !== 'object') return base;
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof (base as any)[k] === 'object') {
      out[k] = deepMerge((base as any)[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function asBool(v: string | undefined): boolean | undefined {
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return undefined;
}

function asNumber(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // .../src/config -> project root
  return path.resolve(here, '../..');
}

function loadFromFiles(): Partial<AppConfig> {
  const root = projectRoot();
  const cfgDir = path.join(root, 'config');

  const base = readJsonIfExists(path.join(cfgDir, 'app.default.json')) ?? null;
  const env = (process.env.NODE_ENV ?? 'development').trim();
  const envCfg = readJsonIfExists(path.join(cfgDir, `app.${env}.json`)) ?? null;

  let merged: any = {};
  if (base) merged = deepMerge(merged, base);
  if (envCfg) merged = deepMerge(merged, envCfg);
  return merged as Partial<AppConfig>;
}

function applyEnvOverrides(cfg: AppConfig): AppConfig {
  const port = asNumber(process.env.PORT);
  if (port != null) cfg.server.port = port;

  const cors = process.env.CORS_ORIGIN_REGEX;
  if (cors) cfg.server.cors.originRegex = cors;

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) cfg.security.jwt.secret = jwtSecret;

  const jwtExp = process.env.JWT_EXP;
  if (jwtExp) cfg.security.jwt.exp = jwtExp;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) cfg.database.url = dbUrl;

  const dbLogger = asBool(process.env.DB_LOGGER);
  if (dbLogger != null) cfg.database.logger = dbLogger;

  const win = asNumber(process.env.RATE_LIMIT_WINDOW_MS);
  if (win != null) cfg.rateLimit.windowMs = win;

  const lim = asNumber(process.env.RATE_LIMIT_LIMIT);
  if (lim != null) cfg.rateLimit.limit = lim;

  const storageRoot = process.env.STORAGE_ROOT;
  if (storageRoot) cfg.storage.root = storageRoot;

  const adminBootstrap = asBool(process.env.ADMIN_BOOTSTRAP);
  if (adminBootstrap != null) cfg.admin.bootstrap = adminBootstrap;

  return cfg;
}

function normalize(cfg: AppConfig): AppConfig {
  // Ensure required nested objects exist even if config files are partial
  return deepMerge(structuredClone(DEFAULTS), cfg);
}

let cached: AppConfig | null = null;
let cachedSig = '';

/**
 * Get effective runtime config.
 *
 * This function is safe to call multiple times; it will refresh if key env vars change.
 */
export function getConfig(): AppConfig {
  const sig = [
    process.env.NODE_ENV ?? '',
    process.env.PORT ?? '',
    process.env.JWT_SECRET ?? '',
    process.env.JWT_EXP ?? '',
    process.env.DATABASE_URL ?? '',
    process.env.DB_LOGGER ?? '',
    process.env.RATE_LIMIT_WINDOW_MS ?? '',
    process.env.RATE_LIMIT_LIMIT ?? '',
    process.env.CORS_ORIGIN_REGEX ?? '',
    process.env.STORAGE_ROOT ?? '',
    process.env.ADMIN_BOOTSTRAP ?? '',
  ].join('|');

  if (cached && cachedSig === sig) return cached;

  const fileCfg = loadFromFiles();
  const merged = normalize(deepMerge(structuredClone(DEFAULTS), fileCfg));
  cachedSig = sig;
  cached = applyEnvOverrides(merged);
  return cached;
}
