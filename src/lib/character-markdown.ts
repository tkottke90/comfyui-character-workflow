import { CHECKLIST_DEFINITIONS, CHECKLIST_PHASES } from '../checklist/definitions';
import type { CharacterRecord } from '../schemas/character.schema';

export function renderCharacterMarkdown(character: CharacterRecord): string {
  const lines: string[] = [];

  lines.push(`# Character: ${character.name}`, '');
  lines.push('## Checklist', '');
  for (const phase of CHECKLIST_PHASES) {
    for (const item of CHECKLIST_DEFINITIONS[phase]) {
      const checked = character.checklist[`${phase}.${item.id}`] ? 'x' : ' ';
      lines.push(`- [${checked}] ${item.label}`);
    }
  }
  lines.push('');

  lines.push('## Distinguishing Features', '');
  if (character.distinguishingFeatures.length === 0) {
    lines.push('*None recorded.*');
  } else {
    for (const feature of character.distinguishingFeatures) {
      lines.push(`- ${feature.text} *(${feature.size})*`);
    }
  }
  lines.push('');

  lines.push(
    '## Identity Block',
    '',
    '```',
    character.identityBlock || '<not yet compiled>',
    '```',
    '',
  );
  lines.push('**Negative guards**', '', '```', character.negativePrompt, '```', '');

  lines.push('## Images', '', '| Asset | Path | Notes |', '|---|---|---|');
  for (const image of character.images) {
    lines.push(`| ${image.label} | ${image.path} | ${image.notes} |`);
  }
  lines.push('');

  lines.push('## Log', '');
  if (character.log.length === 0) {
    lines.push('*No changes logged yet.*');
  } else {
    for (const entry of character.log) {
      lines.push(`### ${entry.timestamp} — ${entry.title}`, '');
      lines.push(`- **Observed:** ${entry.observed}`);
      lines.push(`- **Change:** ${entry.change}`);
      lines.push(`- **Result:** ${entry.result}`, '');
    }
  }

  return lines.join('\n');
}
