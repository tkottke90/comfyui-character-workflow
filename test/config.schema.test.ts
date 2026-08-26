import { expect } from 'chai';
import {
  CharacterAttributesConfigSchema,
  ConfigSchema,
  PromptAdapterPresetsConfigSchema,
} from '../src/schemas/config.schema';
import { DEFAULT_PROMPT_ADAPTER_PRESETS } from '../src/lib/prompt-adapter-defaults';

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

describe('ConfigSchema — prompt-adapter-presets', () => {
  it('defaults to the full set of built-in presets', () => {
    const config = ConfigSchema.parse({});
    expect(config['prompt-adapter-presets']).to.deep.equal(DEFAULT_PROMPT_ADAPTER_PRESETS);
    expect(Object.keys(config['prompt-adapter-presets'])).to.have.members([
      'sd15',
      'sdxl',
      'illustrious',
      'pony',
      'flux',
      'qwen',
      'wan',
      'custom',
    ]);
  });
});

describe('PromptAdapterPresetsConfigSchema', () => {
  it('accepts a user-defined custom preset key', () => {
    const result = PromptAdapterPresetsConfigSchema.safeParse({
      'my-illustrious-variant': {
        label: 'My Illustrious Variant',
        leadTags: '1girl',
        qualityTagsPositive: 'masterpiece',
        negativeMode: 'template',
        qualityTagsNegative: 'worst quality',
      },
    });
    expect(result.success).to.equal(true);
  });

  it('rejects an entry missing a label', () => {
    const result = PromptAdapterPresetsConfigSchema.safeParse({
      broken: { leadTags: '1girl' },
    });
    expect(result.success).to.equal(false);
  });

  it('rejects an unrecognized negativeMode value', () => {
    const result = PromptAdapterPresetsConfigSchema.safeParse({
      broken: { label: 'Broken', negativeMode: 'nonsense' },
    });
    expect(result.success).to.equal(false);
  });
});
