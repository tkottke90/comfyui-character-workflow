import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterSchema } from '../src/schemas/character.schema';
import { NodeMapping, WorkflowVersion } from '../src/schemas/workflow-mapping.schema';
import { createCharacterImagesService } from '../src/services/character-images.service';
import { createTemplatesService } from '../src/services/templates.service';
import { resolveMapping, UnresolvableMappingError } from '../src/lib/mapping-resolver';

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeVersion(nodes: NodeMapping[], boundPhaseSlotId: string | null): WorkflowVersion {
  return {
    version: 1,
    filename: 'workflow.json',
    importedAt: new Date().toISOString(),
    boundPhaseSlotId,
    nodes,
    resultOutput: null,
    active: false,
  };
}

function node(overrides: Partial<NodeMapping>): NodeMapping {
  return {
    nodeId: '1',
    nodeTitle: 'Node',
    inputName: 'value',
    classType: 'SomeNode',
    sourceType: 'unset',
    sourceValue: '',
    status: 'unmapped',
    ...overrides,
  };
}

describe('resolveMapping', () => {
  let dir: string;
  let templatesDir: string;
  let templatesService: ReturnType<typeof createTemplatesService>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-resolver-'));
    fs.mkdirSync(path.join(dir, 'rin-takahashi'), { recursive: true });
    templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-resolver-templates-'));
    templatesService = createTemplatesService(templatesDir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(templatesDir, { recursive: true, force: true });
  });

  const character = CharacterSchema.parse({
    name: 'Rin Takahashi',
    created: '2026-08-24',
    updated: '2026-08-24',
    checkpoint: 'RealVisXL_V5.0',
  });
  const characterRecord = { slug: 'rin-takahashi', ...character };

  it('resolves a static mapping to its literal value', () => {
    const characterImages = createCharacterImagesService(dir);
    const version = makeVersion(
      [node({ nodeId: '1', inputName: 'denoise', sourceType: 'static', sourceValue: '0.35' })],
      null,
    );

    const resolved = resolveMapping(version, characterRecord, characterImages, templatesService);
    expect(resolved).to.deep.equal([
      {
        nodeId: '1',
        inputName: 'denoise',
        classType: 'SomeNode',
        sourceValue: '0.35',
        resolved: { kind: 'literal', value: '0.35' },
      },
    ]);
  });

  it('resolves a character.* domain field from the character record', () => {
    const characterImages = createCharacterImagesService(dir);
    const version = makeVersion(
      [
        node({
          nodeId: '2',
          inputName: 'ckpt_name',
          sourceType: 'domain',
          sourceValue: 'character.checkpoint',
        }),
      ],
      null,
    );

    const resolved = resolveMapping(version, characterRecord, characterImages, templatesService);
    expect(resolved[0].resolved).to.deep.equal({ kind: 'literal', value: 'RealVisXL_V5.0' });
  });

  it('skips unset mappings entirely', () => {
    const characterImages = createCharacterImagesService(dir);
    const version = makeVersion([node({ sourceType: 'unset' })], null);
    expect(
      resolveMapping(version, characterRecord, characterImages, templatesService),
    ).to.deep.equal([]);
  });

  it('throws for a computed mapping — unreachable via the editor, but the schema still allows it', () => {
    const characterImages = createCharacterImagesService(dir);
    const version = makeVersion([node({ sourceType: 'computed', sourceValue: 'whatever' })], null);
    expect(() =>
      resolveMapping(version, characterRecord, characterImages, templatesService),
    ).to.throw(UnresolvableMappingError, /computed/);
  });

  it('throws for an empty domain field', () => {
    const characterImages = createCharacterImagesService(dir);
    const version = makeVersion(
      [node({ sourceType: 'domain', sourceValue: 'character.trigger_token' })],
      null,
    );
    expect(() =>
      resolveMapping(version, characterRecord, characterImages, templatesService),
    ).to.throw(/empty/);
  });

  describe('stage_input.casting_seed', () => {
    it('throws when no per-candidate seed is supplied in the resolution context', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.casting_seed' })],
        null,
      );
      expect(() =>
        resolveMapping(version, characterRecord, characterImages, templatesService),
      ).to.throw(/no per-candidate seed/);
    });

    it('resolves to the supplied seed as a literal', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.casting_seed' })],
        null,
      );
      const resolved = resolveMapping(version, characterRecord, characterImages, templatesService, {
        castingSeed: 4207,
      });
      expect(resolved[0].resolved).to.deep.equal({ kind: 'literal', value: '4207' });
    });
  });

  describe('stage_input.custom_positive_prompt / stage_input.custom_negative_prompt', () => {
    it('resolves to an empty-string literal when not supplied in the resolution context', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.custom_positive_prompt' })],
        null,
      );
      const resolved = resolveMapping(version, characterRecord, characterImages, templatesService);
      expect(resolved[0].resolved).to.deep.equal({ kind: 'literal', value: '' });
    });

    it('resolves to the supplied text as a literal', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.custom_positive_prompt' })],
        null,
      );
      const resolved = resolveMapping(version, characterRecord, characterImages, templatesService, {
        customPositivePrompt: 'a glowing rune on the wall',
      });
      expect(resolved[0].resolved).to.deep.equal({
        kind: 'literal',
        value: 'a glowing rune on the wall',
      });
    });

    it('resolves positive and negative overrides independently in the same mapping', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [
          node({
            nodeId: '1',
            inputName: 'text',
            sourceType: 'domain',
            sourceValue: 'stage_input.custom_positive_prompt',
          }),
          node({
            nodeId: '2',
            inputName: 'text',
            sourceType: 'domain',
            sourceValue: 'stage_input.custom_negative_prompt',
          }),
        ],
        null,
      );
      const resolved = resolveMapping(version, characterRecord, characterImages, templatesService, {
        customPositivePrompt: 'add a candle',
        customNegativePrompt: 'no extra hands',
      });
      expect(resolved[0].resolved).to.deep.equal({ kind: 'literal', value: 'add a candle' });
      expect(resolved[1].resolved).to.deep.equal({ kind: 'literal', value: 'no extra hands' });
    });
  });

  it('throws for an unsupported stage_input field other than current_image/current_mask', () => {
    const characterImages = createCharacterImagesService(dir);
    const version = makeVersion(
      [node({ sourceType: 'domain', sourceValue: 'stage_input.horizontal_angle' })],
      null,
    );
    expect(() =>
      resolveMapping(version, characterRecord, characterImages, templatesService),
    ).to.throw(/not yet supported/);
  });

  describe('stage_input.current_image / current_mask', () => {
    it('throws when the version has no bound phase', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.current_image' })],
        null,
      );
      expect(() =>
        resolveMapping(version, characterRecord, characterImages, templatesService),
      ).to.throw(/not bound/);
    });

    it('throws when no image has been uploaded yet for that phase binding', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.current_image' })],
        '003-Cleanup',
      );
      expect(() =>
        resolveMapping(version, characterRecord, characterImages, templatesService),
      ).to.throw(/No image has been uploaded/);
    });

    it("resolves to the latest stored working file for the slot's single phase binding", () => {
      const characterImages = createCharacterImagesService(dir);
      characterImages.storeWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );
      const secondImage = characterImages.storeWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );

      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'stage_input.current_image' })],
        '003-Cleanup',
      );

      const resolved = resolveMapping(
        version,
        characterRecord,
        characterImages,
        templatesService,
      )[0].resolved;
      expect(resolved.kind).to.equal('image');
      if (resolved.kind === 'image') {
        expect(resolved.relativePath).to.equal(secondImage.relativePath);
      }
    });

    it('resolves image and mask independently for the same phase binding', () => {
      const characterImages = createCharacterImagesService(dir);
      const image = characterImages.storeWorkingFile(
        'rin-takahashi',
        'targeted_fix',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );
      const mask = characterImages.storeWorkingFile(
        'rin-takahashi',
        'targeted_fix',
        'mask',
        ONE_PIXEL_PNG_DATA_URL,
      );

      const version = makeVersion(
        [
          node({ nodeId: '1', sourceType: 'domain', sourceValue: 'stage_input.current_image' }),
          node({ nodeId: '2', sourceType: 'domain', sourceValue: 'stage_input.current_mask' }),
        ],
        '007-Inpaint',
      );

      const resolved = resolveMapping(version, characterRecord, characterImages, templatesService);
      const imageResult = resolved.find((r) => r.nodeId === '1')?.resolved;
      const maskResult = resolved.find((r) => r.nodeId === '2')?.resolved;

      expect(imageResult?.kind === 'image' && imageResult.relativePath).to.equal(
        image.relativePath,
      );
      expect(maskResult?.kind === 'image' && maskResult.relativePath).to.equal(mask.relativePath);
    });
  });

  describe('character.body_template', () => {
    it('throws when no template is selected', () => {
      const characterImages = createCharacterImagesService(dir);
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'character.body_template' })],
        null,
      );
      expect(() =>
        resolveMapping(version, characterRecord, characterImages, templatesService),
      ).to.throw(/No body template selected/);
    });

    it('throws when the selected template no longer exists', () => {
      const characterImages = createCharacterImagesService(dir);
      const withTemplate = { ...characterRecord, body_template: 'missing-slug' };
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'character.body_template' })],
        null,
      );
      expect(() =>
        resolveMapping(version, withTemplate, characterImages, templatesService),
      ).to.throw(/no longer exists/);
    });

    it('throws when the selected template has no image uploaded', () => {
      const characterImages = createCharacterImagesService(dir);
      const template = templatesService.create({ name: 'Hourglass' });
      const withTemplate = { ...characterRecord, body_template: template.slug };
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'character.body_template' })],
        null,
      );
      expect(() =>
        resolveMapping(version, withTemplate, characterImages, templatesService),
      ).to.throw(/no image uploaded/);
    });

    it("resolves to the template's uploaded image", () => {
      const characterImages = createCharacterImagesService(dir);
      const template = templatesService.create({
        name: 'Inverted Triangle',
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      });
      const withTemplate = { ...characterRecord, body_template: template.slug };
      const version = makeVersion(
        [node({ sourceType: 'domain', sourceValue: 'character.body_template' })],
        null,
      );

      const resolved = resolveMapping(version, withTemplate, characterImages, templatesService)[0]
        .resolved;
      expect(resolved).to.deep.equal({
        kind: 'image',
        role: 'body_template',
        filePath: path.join(templatesDir, 'uploads', template.filename),
        relativePath: template.filename,
      });
    });
  });
});
