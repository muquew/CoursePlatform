/**
 * 标准化 Bearer Token
 * 兼容 "Bearer <token>" 和直接传 "<token>" 的情况
 */
export const normalizeBearer = (raw: string | undefined | null): string => {
  if (!raw) return '';
  const s = raw.trim();
  if (!s) return '';
  return s.toLowerCase().startsWith('bearer ') ? s.slice(7).trim() : s;
};

/**
 * 从常见 header 结构里提取 bearer token（适配 Node/Express/Fastify 风格）
 */
export function getBearerFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined | null,
  headerName: string = 'authorization',
): string {
  if (!headers) return '';
  const key = Object.keys(headers).find((k) => k.toLowerCase() === headerName.toLowerCase());
  if (!key) return '';
  const v = headers[key];
  const raw = Array.isArray(v) ? v[0] : v;
  return normalizeBearer(raw ?? '');
}
