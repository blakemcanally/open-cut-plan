export const COUNT_EPSILON = 1e-9;

/** 50 mm from each edge, and at most 150 mm between holes. */
export function pocketHolesPerEnd(panelDepthMm: number): number {
  return Math.max(2, Math.ceil((panelDepthMm - 100) / 150 - COUNT_EPSILON) + 1);
}
