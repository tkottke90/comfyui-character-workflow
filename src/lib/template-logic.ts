import type { CharacterRecord } from '../schemas/character.schema';

export function findCharactersUsingTemplate(
  characters: CharacterRecord[],
  templateSlug: string,
): CharacterRecord[] {
  return characters.filter((character) => character.body_template === templateSlug);
}
