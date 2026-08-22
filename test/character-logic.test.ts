import { expect } from 'chai';
import { AttributesSchema, CharacterSchema } from '../src/schemas/character.schema';
import { emptyChecklist, CHECKLIST_DEFINITIONS } from '../src/checklist/definitions';
import {
  compileIdentityBlock,
  defaultAuditRows,
  deriveChecklist,
  deriveStatus,
  findImagePath,
  getNextAction,
  overviewChecklistRows,
  parsePhaseChecklist,
  slugify,
  DEFAULT_NEGATIVE_PROMPT,
} from '../src/lib/character-logic';

describe('slugify', () => {
  it('lowercases and dashes a name', () => {
    expect(slugify('Rin Takahashi')).to.equal('rin-takahashi');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(slugify("  Ailsa   MacLeod's ")).to.equal('ailsa-macleod-s');
  });
});

describe('compileIdentityBlock', () => {
  const attributes = AttributesSchema.parse({
    sex: 'Female',
    apparent_age: 'Mid 20s',
    ethnicity: 'Japanese',
    skin_tone: 'Fair, neutral undertone',
    face_shape: 'Oval, soft jawline',
    eyes: 'Dark brown, almond',
    eyebrows: 'Black, straight',
    hair: 'Long straight jet black hair',
    nose: 'Small, straight',
    lips: 'Medium, natural tone',
    build: 'Slender build',
    height_impression: 'Average',
    base_clothing: 'Fitted black t-shirt',
  });

  it('omits the name when useNameAsToken is false', () => {
    const block = compileIdentityBlock('Rin Takahashi', false, attributes);
    expect(block).to.not.include('rin takahashi');
    expect(block).to.match(/^photo of a japanese woman,/);
  });

  it('includes "named <name>" when useNameAsToken is true', () => {
    const block = compileIdentityBlock('Rin Takahashi', true, attributes);
    expect(block).to.include('named rin takahashi');
  });

  it('derives "man"/"woman" from sex and skips blank fields', () => {
    const sparse = AttributesSchema.parse({ sex: 'Male', ethnicity: 'Ghanaian' });
    const block = compileIdentityBlock('Kwame Asante', false, sparse);
    expect(block).to.equal('photo of a ghanaian man');
  });

  it('falls back to "person" when sex is unset', () => {
    const noSex = AttributesSchema.parse({ ethnicity: 'French' });
    const block = compileIdentityBlock('X', false, noSex);
    expect(block).to.include('french person');
  });
});

describe('DEFAULT_NEGATIVE_PROMPT', () => {
  it('is a non-empty comma separated guard list', () => {
    expect(DEFAULT_NEGATIVE_PROMPT).to.include('cartoon');
    expect(DEFAULT_NEGATIVE_PROMPT).to.include('watermark');
  });
});

describe('overviewChecklistRows', () => {
  it('returns one row per phase in canonical order', () => {
    const rows = overviewChecklistRows(emptyChecklist());
    expect(rows.map((r) => r.phase)).to.deep.equal([
      'specification',
      'preflight',
      'casting',
      'refinement',
      'anchorKit',
      'downstreamValidation',
      'dataset',
    ]);
    expect(rows.every((r) => r.complete === false)).to.equal(true);
  });
});

describe('getNextAction', () => {
  it('points at the spec builder for a brand new character', () => {
    const action = getNextAction('kwame-asante', emptyChecklist());
    expect(action?.phase).to.equal('specification');
    expect(action?.path).to.equal('/characters/kwame-asante/spec');
  });

  it('advances to the next incomplete phase once specification is done', () => {
    const checklist = emptyChecklist();
    for (const item of CHECKLIST_DEFINITIONS.specification) {
      checklist[`specification.${item.id}`] = true;
    }

    const action = getNextAction('kwame-asante', checklist);
    expect(action?.phase).to.equal('preflight');
  });

  it('returns null once every phase is complete', () => {
    const checklist = emptyChecklist();
    for (const key of Object.keys(checklist)) {
      checklist[key] = true;
    }

    expect(getNextAction('rin-takahashi', checklist)).to.equal(null);
  });
});

describe('deriveStatus', () => {
  it('starts as draft', () => {
    expect(deriveStatus(emptyChecklist())).to.equal('draft');
  });

  it('becomes casting once preflight is complete', () => {
    const checklist = emptyChecklist();
    for (const item of CHECKLIST_DEFINITIONS.preflight) {
      checklist[`preflight.${item.id}`] = true;
    }
    expect(deriveStatus(checklist)).to.equal('casting');
  });

  it('becomes locked once casting is complete', () => {
    const checklist = emptyChecklist();
    for (const phase of ['preflight', 'casting'] as const) {
      for (const item of CHECKLIST_DEFINITIONS[phase]) {
        checklist[`${phase}.${item.id}`] = true;
      }
    }
    expect(deriveStatus(checklist)).to.equal('locked');
  });

  it('becomes kit-complete once anchor kit and downstream validation are both done', () => {
    const checklist = emptyChecklist();
    for (const phase of ['preflight', 'casting', 'anchorKit', 'downstreamValidation'] as const) {
      for (const item of CHECKLIST_DEFINITIONS[phase]) {
        checklist[`${phase}.${item.id}`] = true;
      }
    }
    expect(deriveStatus(checklist)).to.equal('kit-complete');
  });

  it('becomes lora-trained once dataset is complete', () => {
    const checklist = emptyChecklist();
    for (const key of Object.keys(checklist)) {
      checklist[key] = true;
    }
    expect(deriveStatus(checklist)).to.equal('lora-trained');
  });
});

describe('deriveChecklist', () => {
  it('marks specification items complete only once attributes and identity block are filled', () => {
    const empty = CharacterSchema.parse({ name: 'X', created: 'd', updated: 'd' });
    expect(deriveChecklist(empty)['specification.attrs_filled']).to.equal(false);
    expect(deriveChecklist(empty)['specification.identity_compiled']).to.equal(false);

    const filled = CharacterSchema.parse({
      name: 'X',
      created: 'd',
      updated: 'd',
      identityBlock: 'photo of a person',
      attributes: {
        sex: 'Female',
        apparent_age: '20s',
        ethnicity: 'French',
        skin_tone: 'fair',
        face_shape: 'oval',
        eyes: 'brown',
        eyebrows: 'thin',
        hair: 'black',
        nose: 'small',
        lips: 'thin',
        build: 'slender',
        height_impression: 'average',
        base_clothing: 't-shirt',
      },
    });
    expect(deriveChecklist(filled)['specification.attrs_filled']).to.equal(true);
    expect(deriveChecklist(filled)['specification.identity_compiled']).to.equal(true);
  });

  it('derives casting.seed_locked and casting.prompt_frozen from lock state', () => {
    const locked = CharacterSchema.parse({
      name: 'X',
      created: 'd',
      updated: 'd',
      locked_seed: 12345,
      identityBlockFrozen: true,
    });
    expect(deriveChecklist(locked)['casting.seed_locked']).to.equal(true);
    expect(deriveChecklist(locked)['casting.prompt_frozen']).to.equal(true);
  });

  it('derives anchor kit view/crop items from view status and face crop confirmation', () => {
    const kitComplete = CharacterSchema.parse({
      name: 'X',
      created: 'd',
      updated: 'd',
      faceCrop: { path: 'crop.png', confirmed: true },
      views: [
        { key: 'three_quarter', label: 'Three-quarter', status: 'done' },
        { key: 'profile', label: 'Profile', status: 'pending' },
        { key: 'front_portrait', label: 'Front portrait', status: 'done' },
        { key: 'three_quarter_portrait', label: '3/4 portrait', status: 'done' },
      ],
      images: [{ label: 'Hero full-body', path: 'hero.png', notes: '' }],
    });
    const checklist = deriveChecklist(kitComplete);
    expect(checklist['anchorKit.face_crop']).to.equal(true);
    expect(checklist['anchorKit.three_quarter']).to.equal(true);
    expect(checklist['anchorKit.profile']).to.equal(false);
    expect(checklist['anchorKit.portraits']).to.equal(true);
    expect(checklist['anchorKit.hero_image']).to.equal(true);
  });

  it('derives dataset.images_generated once the image count reaches the target minimum', () => {
    const short = CharacterSchema.parse({
      name: 'X',
      created: 'd',
      updated: 'd',
      dataset: { imagesCount: 5, targetMin: 20, targetMax: 40 },
    });
    const enough = CharacterSchema.parse({
      name: 'X',
      created: 'd',
      updated: 'd',
      dataset: { imagesCount: 22, targetMin: 20, targetMax: 40 },
    });
    expect(deriveChecklist(short)['dataset.images_generated']).to.equal(false);
    expect(deriveChecklist(enough)['dataset.images_generated']).to.equal(true);
  });
});

describe('parsePhaseChecklist', () => {
  it('marks only the items present (checked) in the posted form body as true', () => {
    const checklist = parsePhaseChecklist('preflight', {
      no_feature_lines: 'on',
      bg_clean: 'on',
    });

    expect(checklist['preflight.no_feature_lines']).to.equal(true);
    expect(checklist['preflight.bg_clean']).to.equal(true);
    expect(checklist['preflight.full_body_uncropped']).to.equal(false);
  });

  it('treats a missing body (nothing checked) as all-false', () => {
    const checklist = parsePhaseChecklist('dataset', undefined);
    expect(Object.values(checklist).every((v) => v === false)).to.equal(true);
  });
});

describe('defaultAuditRows', () => {
  it('builds one row per audited attribute, seeded from the spec', () => {
    const attributes = AttributesSchema.parse({ skin_tone: 'Fair', hair: 'Black' });
    const rows = defaultAuditRows(attributes);

    const skinRow = rows.find((r) => r.attribute === 'Skin tone');
    expect(skinRow?.specValue).to.equal('Fair');
    expect(skinRow?.ok).to.equal(true);
    expect(skinRow?.imageValue).to.equal('');
  });
});

describe('findImagePath', () => {
  it('returns the path for a matching label', () => {
    const images = [{ label: 'Hero full-body', path: 'hero.png', notes: '' }];
    expect(findImagePath(images, 'Hero full-body')).to.equal('hero.png');
  });

  it('returns an empty string when no image has that label', () => {
    expect(findImagePath([], 'Hero full-body')).to.equal('');
  });
});
