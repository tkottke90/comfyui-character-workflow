import { expect } from 'chai';
import { createTestApp, TestApp } from './support/manual-test-app';
import { ManualGenerationSchema } from '../src/services/manual-workflow.service';

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('manual field CRUD + image upload + asset serving', () => {
  let app: TestApp;
  let sessionId: string;

  beforeEach(async () => {
    app = await createTestApp();
    const session = await app.manualWorkflows.addSession('Test Workflow');
    sessionId = session.id;
  });

  afterEach(() => app.close());

  describe('POST /api/v1/manual/:id/fields', () => {
    it('creates a field with the type default value', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'seed', type: 'number' }),
      });

      expect(res.status).to.equal(201);
      const field = (await res.json()) as { key: string; type: string; value: unknown };
      expect(field.key).to.equal('seed');
      expect(field.type).to.equal('number');
      expect(field.value).to.equal(0);
    });

    it('rejects a duplicate key with 400', async () => {
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'seed', type: 'number' }),
      });
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'seed', type: 'text' }),
      });

      expect(res.status).to.equal(400);
    });

    it('rejects an invalid type with 400, not 500 — regression for the ManualFieldSchema.parse try/catch', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'seed', type: 'color' }),
      });

      expect(res.status).to.equal(400);
    });

    it('creates a multiline field defaulting to an empty string', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'prompt', type: 'multiline' }),
      });

      expect(res.status).to.equal(201);
      const field = (await res.json()) as { type: string; value: unknown };
      expect(field.type).to.equal('multiline');
      expect(field.value).to.equal('');
    });
  });

  describe('PATCH /api/v1/manual/:id/fields/:fieldId', () => {
    async function createField(key: string, type: string) {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, type }),
      });
      return (await res.json()) as { id: string; key: string; type: string; value: unknown };
    }

    it('renames a field', async () => {
      const field = await createField('a', 'text');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'b' }),
      });

      expect(res.status).to.equal(200);
      const updated = (await res.json()) as { key: string };
      expect(updated.key).to.equal('b');
    });

    it('rejects a rename to an existing key with 400', async () => {
      await createField('a', 'text');
      const field = await createField('b', 'text');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a' }),
      });

      expect(res.status).to.equal(400);
    });

    it('resets value to the new type default when type changes', async () => {
      const field = await createField('a', 'text');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'boolean' }),
      });

      const updated = (await res.json()) as { type: string; value: unknown };
      expect(updated.type).to.equal('boolean');
      expect(updated.value).to.equal(false);
    });

    it('a value-only patch leaves key/type untouched', async () => {
      const field = await createField('a', 'number');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 7 }),
      });

      const updated = (await res.json()) as { key: string; type: string; value: unknown };
      expect(updated.key).to.equal('a');
      expect(updated.type).to.equal('number');
      expect(updated.value).to.equal(7);
    });

    it('rejects an invalid type with 400, not 500', async () => {
      const field = await createField('a', 'text');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'color' }),
      });

      expect(res.status).to.equal(400);
    });

    it('round-trips a multiline value with embedded newlines', async () => {
      const field = await createField('prompt', 'multiline');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'line one\nline two' }),
      });

      const updated = (await res.json()) as { value: unknown };
      expect(updated.value).to.equal('line one\nline two');
    });

    it('saves a mappings array for a field', async () => {
      const field = await createField('prompt', 'text');
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'text', classType: 'CLIPTextEncode' }],
        }),
      });

      expect(res.status).to.equal(200);
      const updated = (await res.json()) as { mappings: unknown[] };
      expect(updated.mappings).to.deep.equal([
        { nodeId: '1', inputName: 'text', classType: 'CLIPTextEncode' },
      ]);
    });

    it('rejects mapping an input that another field already claims', async () => {
      const first = await createField('a', 'text');
      const second = await createField('b', 'text');
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${first.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'text', classType: 'CLIPTextEncode' }],
        }),
      });

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${second.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'text', classType: 'CLIPTextEncode' }],
        }),
      });

      expect(res.status).to.equal(400);
    });

    it('re-saving the same field\'s own mappings is not treated as a conflict', async () => {
      const field = await createField('a', 'text');
      const mapping = { nodeId: '1', inputName: 'text', classType: 'CLIPTextEncode' };
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: [mapping] }),
      });

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: [mapping] }),
      });

      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/v1/manual/:id/fields/:fieldId/move', () => {
    async function createField(key: string) {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, type: 'text' }),
      });
      return (await res.json()) as { id: string; key: string };
    }

    async function move(fieldId: string, direction: string) {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${fieldId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      return res;
    }

    async function keysInOrder() {
      const session = await app.manualWorkflows.getSession(sessionId);
      const json = session.toJSON() as { fields: { key: string }[] };
      return json.fields.map((f) => f.key);
    }

    it('moves a field up, swapping it with its predecessor', async () => {
      await createField('a');
      await createField('b');
      const c = await createField('c');

      const res = await move(c.id, 'up');

      expect(res.status).to.equal(200);
      expect(await res.json()).to.deep.equal({ moved: true });
      expect(await keysInOrder()).to.deep.equal(['a', 'c', 'b']);
    });

    it('moves a field down, swapping it with its successor', async () => {
      const a = await createField('a');
      await createField('b');
      await createField('c');

      const res = await move(a.id, 'down');

      expect(res.status).to.equal(200);
      expect(await res.json()).to.deep.equal({ moved: true });
      expect(await keysInOrder()).to.deep.equal(['b', 'a', 'c']);
    });

    it('is a no-op when moving the first field up', async () => {
      const a = await createField('a');
      await createField('b');

      const res = await move(a.id, 'up');

      expect(res.status).to.equal(200);
      expect(await res.json()).to.deep.equal({ moved: false });
      expect(await keysInOrder()).to.deep.equal(['a', 'b']);
    });

    it('is a no-op when moving the last field down', async () => {
      await createField('a');
      const b = await createField('b');

      const res = await move(b.id, 'down');

      expect(res.status).to.equal(200);
      expect(await res.json()).to.deep.equal({ moved: false });
      expect(await keysInOrder()).to.deep.equal(['a', 'b']);
    });

    it('returns 404 for an unknown fieldId', async () => {
      const res = await move('does-not-exist', 'up');
      expect(res.status).to.equal(404);
    });

    it('returns 400 for an invalid direction', async () => {
      const a = await createField('a');
      const res = await move(a.id, 'sideways');
      expect(res.status).to.equal(400);
    });
  });

  describe('DELETE /api/v1/manual/:id/fields/:fieldId', () => {
    it('deletes a field', async () => {
      const created = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a', type: 'text' }),
      });
      const field = (await created.json()) as { id: string };

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'DELETE',
      });
      expect(res.status).to.equal(204);

      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.fields).to.have.length(0);
    });

    it('returns 404 for a non-existent field id', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/does-not-exist`, {
        method: 'DELETE',
      });
      expect(res.status).to.equal(404);
    });

  });

  describe('POST /api/v1/manual/:id/images', () => {
    it('decodes and stores an image, recording it on the session', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: ONE_PIXEL_PNG_DATA_URL }),
      });

      expect(res.status).to.equal(201);
      const image = (await res.json()) as { id: string; filename: string; size: { width: number; height: number } };
      expect(image.filename).to.match(/\.png$/);
      expect(image.size).to.deep.equal({ width: 1, height: 1 });

      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.images).to.have.length(1);
      expect(session.images[0].id).to.equal(image.id);

      const fileRes = await fetch(`${app.baseUrl}/manual/${sessionId}/assets/${image.filename}`);
      expect(fileRes.status).to.equal(200);
    });

    it('rejects a malformed data URL with 400, not 500', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,not-valid-base64!!!' }),
      });

      expect(res.status).to.equal(400);
    });
  });

  describe('PATCH /api/v1/manual/:id/images/:imageId', () => {
    async function seedImage() {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: ONE_PIXEL_PNG_DATA_URL }),
      });
      const image = (await res.json()) as { id: string };
      return image.id;
    }

    it('sets nsfw to true and persists it on the session', async () => {
      const imageId = await seedImage();

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nsfw: true }),
      });

      expect(res.status).to.equal(200);
      const image = (await res.json()) as { nsfw: boolean };
      expect(image.nsfw).to.equal(true);

      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.images[0].nsfw).to.equal(true);
    });

    it('rejects a non-boolean nsfw with 400', async () => {
      const imageId = await seedImage();

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nsfw: 'yes' }),
      });

      expect(res.status).to.equal(400);
    });

    it('returns 404 for an unknown imageId', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images/does-not-exist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nsfw: true }),
      });

      expect(res.status).to.equal(404);
    });

    it('sets locked to true and persists it on the session', async () => {
      const imageId = await seedImage();

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: true }),
      });

      expect(res.status).to.equal(200);
      const image = (await res.json()) as { locked: boolean };
      expect(image.locked).to.equal(true);

      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.images[0].locked).to.equal(true);
    });

    it('rejects a non-boolean locked with 400', async () => {
      const imageId = await seedImage();

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: 'yes' }),
      });

      expect(res.status).to.equal(400);
    });
  });

  describe('POST /manual/:id/workspace/images/:imageId/delete', () => {
    async function seedImage() {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: ONE_PIXEL_PNG_DATA_URL }),
      });
      const image = (await res.json()) as { id: string };
      return image.id;
    }

    it('deletes an unlocked image and redirects without an error param', async () => {
      const imageId = await seedImage();

      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/images/${imageId}/delete`, {
        method: 'POST',
        redirect: 'manual',
      });

      expect(res.status).to.equal(302);
      expect(res.headers.get('location')).to.equal(`/manual/${sessionId}/workspace/images`);

      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.images).to.have.length(0);
    });

    it('refuses to delete a locked image and redirects with a deleteError param', async () => {
      const imageId = await seedImage();
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: true }),
      });

      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/images/${imageId}/delete`, {
        method: 'POST',
        redirect: 'manual',
      });

      expect(res.status).to.equal(302);
      const location = res.headers.get('location') ?? '';
      expect(location).to.include(`/manual/${sessionId}/workspace/images`);
      expect(location).to.include('deleteError=');

      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.images).to.have.length(1);
    });
  });

  describe('GET /manual/:id/workspace/images', () => {
    it('renders the error banner when a deleteError query param is present', async () => {
      const message = encodeURIComponent('Image is locked and cannot be deleted');
      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/images?deleteError=${message}`);

      expect(res.status).to.equal(200);
      const body = await res.text();
      expect(body).to.include('Image is locked and cannot be deleted');
    });
  });

  describe('GET /api/v1/manual/:id/workflow-inputs', () => {
    it('returns an empty list when no workflow is attached', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/workflow-inputs`);
      expect(res.status).to.equal(200);
      const body = (await res.json()) as { inputs: unknown[] };
      expect(body.inputs).to.deep.equal([]);
    });

    it('returns every mappable widget input parsed from the attached workflow', async () => {
      const graph = {
        '1': {
          class_type: 'CLIPTextEncode',
          inputs: { text: 'a placeholder prompt' },
          _meta: { title: 'Positive Prompt' },
        },
      };
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/set-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'upload',
          workflowJsonDataUrl: `data:application/json;base64,${Buffer.from(JSON.stringify(graph)).toString('base64')}`,
        }),
      });

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/workflow-inputs`);
      expect(res.status).to.equal(200);
      const body = (await res.json()) as { inputs: Array<{ nodeId: string; inputName: string }> };
      expect(body.inputs).to.have.length(1);
      expect(body.inputs[0]).to.deep.include({ nodeId: '1', inputName: 'text' });
    });
  });

  describe('POST /api/v1/manual/:id/result-output', () => {
    it('sets the result output node/index', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/result-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: '4', outputIndex: 0 }),
      });

      expect(res.status).to.equal(200);
      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.resultOutput).to.deep.equal({ nodeId: '4', outputIndex: 0 });
    });

    it('rejects a missing nodeId with 400', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/result-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputIndex: 0 }),
      });

      expect(res.status).to.equal(400);
    });
  });

  describe('PATCH /api/v1/manual/:id/seed-mapping', () => {
    it('saves a mappings array for Seed', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/seed-mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'seed', classType: 'KSampler' }],
        }),
      });

      expect(res.status).to.equal(200);
      const session = await app.manualWorkflows.getSession(sessionId);
      expect(session.seedMappings).to.deep.equal([
        { nodeId: '1', inputName: 'seed', classType: 'KSampler' },
      ]);
    });

    it('rejects mapping an input a field already claims', async () => {
      const created = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a', type: 'number' }),
      });
      const field = (await created.json()) as { id: string };
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'seed', classType: 'KSampler' }],
        }),
      });

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/seed-mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'seed', classType: 'KSampler' }],
        }),
      });

      expect(res.status).to.equal(400);
    });

    it('a field mapping an input Seed already claims is also rejected', async () => {
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/seed-mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'seed', classType: 'KSampler' }],
        }),
      });
      const created = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a', type: 'number' }),
      });
      const field = (await created.json()) as { id: string };

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [{ nodeId: '1', inputName: 'seed', classType: 'KSampler' }],
        }),
      });

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /api/v1/manual/:id/output-nodes', () => {
    it('returns an empty list when no workflow is attached', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/output-nodes`);
      expect(res.status).to.equal(200);
      const body = (await res.json()) as { candidates: unknown[]; allNodeIds: unknown[] };
      expect(body.candidates).to.deep.equal([]);
      expect(body.allNodeIds).to.deep.equal([]);
    });

    it('returns candidate output nodes and every node id from the attached workflow', async () => {
      const graph = {
        '1': {
          class_type: 'CLIPTextEncode',
          inputs: { text: 'a placeholder prompt' },
          _meta: { title: 'Positive Prompt' },
        },
        '4': {
          class_type: 'SaveImage',
          inputs: { filename_prefix: 'ComfyUI' },
          _meta: { title: 'Save Image' },
        },
      };
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/set-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'upload',
          workflowJsonDataUrl: `data:application/json;base64,${Buffer.from(JSON.stringify(graph)).toString('base64')}`,
        }),
      });

      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/output-nodes`);
      expect(res.status).to.equal(200);
      const body = (await res.json()) as { candidates: Array<{ nodeId: string }>; allNodeIds: string[] };
      expect(body.candidates.map((c) => c.nodeId)).to.deep.equal(['4']);
      expect(body.allNodeIds.sort()).to.deep.equal(['1', '4']);
    });
  });

  describe('POST /api/v1/manual/:id/generate', () => {
    it('rejects a missing/non-numeric seed with 400', async () => {
      const res = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /manual/:id/assets/:filename', () => {
    it('returns 400 for a path-traversal-shaped filename', async () => {
      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/assets/..%2Fmetadata.json`);
      expect(res.status).to.equal(400);
    });

    it('returns 404 for a filename that does not exist', async () => {
      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/assets/nope.png`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /manual/:id/workspace/generation', () => {
    it('renders the empty state with Generate disabled', async () => {
      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/generation`);
      const html = await res.text();

      expect(res.status).to.equal(200);
      expect(html).to.include('No generations yet.');
      expect(html).to.include('disabled');
      expect(html).to.include('Attach a workflow and set a Result Output on the Configuration tab first');
    });

    it('renders all four field types in Interact mode', async () => {
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a_text', type: 'text' }),
      });
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a_number', type: 'number' }),
      });
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a_boolean', type: 'boolean' }),
      });
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a_image', type: 'image' }),
      });

      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/generation`);
      const html = await res.text();

      expect(html).to.include('a_text');
      expect(html).to.include('a_number');
      expect(html).to.include('a_boolean');
      expect(html).to.include('a_image');
      expect(html).to.include('type="checkbox"');
      expect(html).to.include('data-field-image-value');
    });

    it('renders an actual <img> thumbnail for an image field whose value is set — regression test for the imagesById/session lookup inside the dynamicFieldForm macro\'s imageValuePartial hook', async () => {
      const uploadRes = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: ONE_PIXEL_PNG_DATA_URL }),
      });
      const image = (await uploadRes.json()) as { id: string; filename: string };

      const fieldRes = await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'a_image', type: 'image' }),
      });
      const field = (await fieldRes.json()) as { id: string };
      await fetch(`${app.baseUrl}/api/v1/manual/${sessionId}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: image.id }),
      });

      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/generation`);
      const html = await res.text();

      expect(html).to.include(`<img src="/manual/${sessionId}/assets/${image.filename}"`);
      expect(html).to.not.include('No image');
    });

    it('renders a "Generating…" tile for a single queued generation, keyed by its own id', async () => {
      await app.manualWorkflows.updateSession(sessionId, {
        generations: [
          ManualGenerationSchema.parse({ id: 'gen-1', status: 'queued', fieldValuesSnapshot: {}, seed: 5 }),
        ],
      });

      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/generation`);
      const html = await res.text();

      expect(html).to.include('Generating…');
      expect(html).to.include('data-tile-key="gen-1"');
      expect(html).to.include('data-sse-tiles');
    });

    it('renders one "Generating…" tile per unsettled batch sub-generation, keyed by its own seed', async () => {
      await app.manualWorkflows.updateSession(sessionId, {
        generations: [
          ManualGenerationSchema.parse({
            id: 'gen-1',
            status: 'done',
            batchId: 'batch-1',
            fieldValuesSnapshot: {},
            seed: 10,
          }),
          ManualGenerationSchema.parse({
            id: 'gen-2',
            status: 'running',
            batchId: 'batch-1',
            fieldValuesSnapshot: {},
            seed: 11,
          }),
        ],
      });

      const res = await fetch(`${app.baseUrl}/manual/${sessionId}/workspace/generation`);
      const html = await res.text();

      expect(html).to.include('Generating…');
      expect(html).to.include('data-tile-key="11"');
      // The done sibling is settled (and has no resolvable image), so it renders in
      // neither the live-tile section nor doneGenerations — any number of jobs can be
      // in flight per session now, each shown only while queued/running.
      expect(html).to.not.include('data-tile-key="10"');
    });
  });
});
