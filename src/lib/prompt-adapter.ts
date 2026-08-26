import type { PromptAdapter } from '../schemas/prompt-adapter.schema';

/**
 * Wraps a positive/negative prompt string with a character's Prompt Adapter
 * segments (lead tags, quality tags) — or drops it entirely when the adapter
 * suppresses negatives (e.g. a CFG-free model family). An all-default adapter
 * is a no-op: the input value passes through unchanged.
 */
export function applyPromptAdapter(
  value: string,
  adapter: PromptAdapter,
  kind: 'positive' | 'negative',
): string {
  if (kind === 'negative' && adapter.negativeMode === 'suppressed') return '';

  const segments =
    kind === 'positive'
      ? [adapter.leadTags, adapter.qualityTagsPositive, value]
      : [adapter.qualityTagsNegative, value];

  return segments.filter((s) => s.trim().length > 0).join(', ');
}
