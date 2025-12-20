import { Elysia } from 'elysia';

import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';

/**
 * App context plugin.
 *
 * - Injects db + schema into Elysia context
 * - Keeps this plugin intentionally lightweight so it can be reused in tests
 */
export const appContext = new Elysia({ name: 'appContext' })
  .decorate('db', db)
  .decorate('schema', schema);
