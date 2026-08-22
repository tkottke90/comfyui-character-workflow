import { expect } from 'chai';
import { findCharactersUsingTemplate } from '../src/lib/template-logic';
import { CharacterSchema, CharacterRecord } from '../src/schemas/character.schema';

function makeCharacter(slug: string, body_template: string): CharacterRecord {
  return {
    slug,
    ...CharacterSchema.parse({
      name: slug,
      created: '2026-08-21',
      updated: '2026-08-21',
      body_template,
    }),
  };
}

describe('findCharactersUsingTemplate', () => {
  it('finds every character referencing the template by name', () => {
    const characters = [
      makeCharacter('kwame-asante', 'inverted-triangle'),
      makeCharacter('marguerite-dubois', 'inverted-triangle'),
      makeCharacter('rin-takahashi', 'hourglass'),
    ];

    const usage = findCharactersUsingTemplate(characters, 'inverted-triangle');
    expect(usage.map((c) => c.slug)).to.deep.equal(['kwame-asante', 'marguerite-dubois']);
  });

  it('returns an empty array when nothing references the template', () => {
    const characters = [makeCharacter('rin-takahashi', 'hourglass')];
    expect(findCharactersUsingTemplate(characters, 'apple')).to.deep.equal([]);
  });
});
