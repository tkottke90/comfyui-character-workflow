import { randomInt } from 'node:crypto';

export const MAX_SEED = 4_294_967_295; // 2**32 - 1, conventional ComfyUI uint32 seed ceiling

/**
 * Generates a random seed in the full ComfyUI seed range [0, 2**32-1]. Uses
 * crypto.randomInt (rejection-sampled, unbiased) rather than Math.random() so
 * randomized seeds aren't predictable across sessions. randomInt's span
 * (max - min) must stay under 2**48 and max is exclusive — this range (2**32)
 * is comfortably inside that limit, so MAX_SEED + 1 as the upper bound covers
 * the whole space in one call.
 */
export function generateRandomSeed(): number {
  return randomInt(0, MAX_SEED + 1);
}
