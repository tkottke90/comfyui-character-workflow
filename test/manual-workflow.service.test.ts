import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ManualWorkflowRegistry,
  ManualFieldSchema,
  ManualGenerationSchema,
  ImageSchema,
} from '../src/services/manual-workflow.service';

describe('manual-workflow.service schemas', () => {
  describe('ManualFieldSchema', () => {
    it('accepts an alphanumeric/underscore key', () => {
      const field = ManualFieldSchema.parse({ key: 'seed_1', type: 'number', value: 0 });
      expect(field.key).to.equal('seed_1');
      expect(field.id).to.be.a('string');
      expect(field.createdAt).to.be.instanceOf(Date);
      expect(field.updatedAt).to.be.instanceOf(Date);
    });

    it('rejects a key with spaces or symbols', () => {
      expect(() => ManualFieldSchema.parse({ key: 'not a key!', type: 'text', value: '' })).to.throw();
    });

    it('accepts a string, number, boolean, or null value', () => {
      expect(ManualFieldSchema.parse({ key: 'a', type: 'text', value: 'hi' }).value).to.equal('hi');
      expect(ManualFieldSchema.parse({ key: 'b', type: 'number', value: 5 }).value).to.equal(5);
      expect(ManualFieldSchema.parse({ key: 'c', type: 'boolean', value: true }).value).to.equal(true);
      expect(ManualFieldSchema.parse({ key: 'd', type: 'image', value: null }).value).to.equal(null);
    });

    it('rejects an unknown type', () => {
      expect(() => ManualFieldSchema.parse({ key: 'a', type: 'color', value: '#fff' })).to.throw();
    });

    it('accepts a multiline type with a string value', () => {
      const field = ManualFieldSchema.parse({ key: 'prompt', type: 'multiline', value: 'line one\nline two' });
      expect(field.value).to.equal('line one\nline two');
    });
  });

  describe('ManualGenerationSchema', () => {
    it('parses a done generation with an image and optional fields omitted', () => {
      const generation = ManualGenerationSchema.parse({
        status: 'done',
        fieldValuesSnapshot: { seed: 42, prompt: 'a cat' },
        imageId: 'abc-123',
      });
      expect(generation.status).to.equal('done');
      expect(generation.error).to.equal(undefined);
      expect(generation.completedAt).to.equal(undefined);
    });

    it('rejects an unknown status', () => {
      expect(() =>
        ManualGenerationSchema.parse({ status: 'paused', fieldValuesSnapshot: {} }),
      ).to.throw();
    });
  });

  describe('ImageSchema', () => {
    it('requires a filename', () => {
      expect(() =>
        ImageSchema.parse({ id: 'x', size: { width: 1, height: 1 } }),
      ).to.throw();
    });

    it('parses with a filename present', () => {
      const image = ImageSchema.parse({ id: 'x', filename: 'x.png', size: { width: 1, height: 1 } });
      expect(image.filename).to.equal('x.png');
    });
  });
});

describe('ManualWorkflowRegistry — fields persistence', () => {
  let dir: string;
  let registry: ManualWorkflowRegistry;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-workflow-service-'));
    registry = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a new session starts with empty fields and generations arrays', async () => {
    const session = await registry.addSession('Test Session');
    expect(session.fields).to.deep.equal([]);
    expect(session.generations).to.deep.equal([]);
  });

  it('updateSession({ fields }) round-trips through getSession — regression test for the ManualSession constructor wiring', async () => {
    const session = await registry.addSession('Test Session');
    const field = ManualFieldSchema.parse({ key: 'seed', type: 'number', value: 42 });

    await registry.updateSession(session.id, { fields: [field] });

    const reloaded = await registry.getSession(session.id);
    expect(reloaded.fields).to.have.length(1);
    expect(reloaded.fields[0].key).to.equal('seed');
    expect(reloaded.fields[0].value).to.equal(42);

    // Also confirm it round-trips through toJSON()/disk, not just the in-memory getter.
    const json = reloaded.toJSON() as { fields: unknown[] };
    expect(json.fields).to.have.length(1);
  });

  describe('deleteImage', () => {
    it('removes the image record and its file from disk', async () => {
      const session = await registry.addSession('Test Session');
      const image = ImageSchema.parse({ id: 'img-1', filename: 'img-1.png', size: { width: 1, height: 1 } });
      const assetPath = path.join(session.workflowDir, 'assets', image.filename);
      fs.writeFileSync(assetPath, 'fake image bytes');
      await registry.updateSession(session.id, { images: [image] });

      const result = await registry.deleteImage(session.id, image.id);

      expect(result).to.deep.equal({ deleted: true });
      expect(fs.existsSync(assetPath)).to.equal(false);

      const reloaded = await registry.getSession(session.id);
      expect(reloaded.images).to.deep.equal([]);
    });

    it('is idempotent for an unknown imageId', async () => {
      const session = await registry.addSession('Test Session');

      const result = await registry.deleteImage(session.id, 'does-not-exist');

      expect(result).to.deep.equal({ deleted: false });
    });

    it('does not throw when the file is already missing on disk', async () => {
      const session = await registry.addSession('Test Session');
      const image = ImageSchema.parse({ id: 'img-1', filename: 'img-1.png', size: { width: 1, height: 1 } });
      await registry.updateSession(session.id, { images: [image] });
      // No file written for this image — simulates an out-of-band deletion.

      const result = await registry.deleteImage(session.id, image.id);

      expect(result).to.deep.equal({ deleted: true });
      const reloaded = await registry.getSession(session.id);
      expect(reloaded.images).to.deep.equal([]);
    });
  });
});
