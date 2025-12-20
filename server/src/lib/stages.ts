/**
 * Shared Stage constants to keep ROUTES.md payloads consistent with schema.ts.
 */

export const STAGE_KEYS = [
  'requirements',
  'high_level_design',
  'detailed_design',
  'software_testing',
  'acceptance',
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGE_ORDER: Record<StageKey, number> = {
  requirements: 1,
  high_level_design: 2,
  detailed_design: 3,
  software_testing: 4,
  acceptance: 5,
};

export const STAGE_STATUS = ['locked', 'open', 'passed'] as const;
export type StageStatus = (typeof STAGE_STATUS)[number];

export function isStageKey(x: unknown): x is StageKey {
  return typeof x === 'string' && (STAGE_KEYS as readonly string[]).includes(x);
}

export function nextStageKey(current: StageKey): StageKey | null {
  const idx = STAGE_KEYS.indexOf(current);
  return idx >= 0 && idx < STAGE_KEYS.length - 1 ? (STAGE_KEYS[idx + 1] ?? null) : null;
}

export function prevStageKey(current: StageKey): StageKey | null {
  const idx = STAGE_KEYS.indexOf(current);
  return idx > 0 ? (STAGE_KEYS[idx - 1] ?? null) : null;
}