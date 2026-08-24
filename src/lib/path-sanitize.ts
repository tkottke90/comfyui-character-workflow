import { BadRequestError } from '../errors/http.errors';

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Validates a single filesystem path segment (a character slug, phase-binding key,
 * seed, or timestamp) before it's joined into a path. Throws rather than stripping —
 * a rejected value should fail predictably here, not surface as a raw OS error from
 * fs, and never silently land somewhere other than where the caller intended.
 */
export function sanitizeSegment(value: string): string {
  if (!SAFE_SEGMENT_PATTERN.test(value) || value === '.' || value === '..') {
    throw new BadRequestError(`"${value}" is not a valid path segment`);
  }
  return value;
}
