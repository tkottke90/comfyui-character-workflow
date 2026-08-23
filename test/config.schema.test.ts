import { expect } from 'chai';
import { CharacterAttributesConfigSchema, ConfigSchema } from '../src/schemas/config.schema';

describe('ConfigSchema', () => {
  it('defaults character-attributes to an empty object', () => {
    const config = ConfigSchema.parse({});
    expect(config['character-attributes']).to.deep.equal({});
  });

  it('accepts a map of field keys to suggestion lists', () => {
    const config = ConfigSchema.parse({
      'character-attributes': { sex: ['Male', 'Female'], ethnicity: ['Elf'] },
    });
    expect(config['character-attributes']).to.deep.equal({
      sex: ['Male', 'Female'],
      ethnicity: ['Elf'],
    });
  });
});

describe('CharacterAttributesConfigSchema', () => {
  it('rejects non-array values', () => {
    const result = CharacterAttributesConfigSchema.safeParse({ sex: 'Male' });
    expect(result.success).to.equal(false);
  });
});
