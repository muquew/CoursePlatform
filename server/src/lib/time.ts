export const nowIso = () => new Date().toISOString();

export const nowMs = () => Date.now();

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}