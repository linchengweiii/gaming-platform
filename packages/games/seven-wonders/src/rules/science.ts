import { SEVEN_WONDERS_SCIENCE_SET_BONUS_VP } from "../config/game-config.ts";
import type { ScienceMap } from "../types.ts";

export function computeOptimalScienceScorePure(
  baseCounts: ScienceMap,
  wildcards: number
): { readonly points: number; readonly finalCounts: ScienceMap } {
  let bestPoints = -1;
  let bestCounts: ScienceMap = { ...baseCounts };

  for (let wc = 0; wc <= wildcards; wc++) {
    for (let wg = 0; wg <= wildcards - wc; wg++) {
      const wt = wildcards - wc - wg;
      const c = baseCounts.compass + wc;
      const g = baseCounts.gear + wg;
      const t = baseCounts.tablet + wt;
      const sets = Math.min(c, g, t);
      const pts = c * c + g * g + t * t + sets * SEVEN_WONDERS_SCIENCE_SET_BONUS_VP;
      if (pts > bestPoints) {
        bestPoints = pts;
        bestCounts = { compass: c, gear: g, tablet: t };
      }
    }
  }

  return { points: Math.max(0, bestPoints), finalCounts: bestCounts };
}
