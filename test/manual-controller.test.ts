import { expect } from 'chai';
import { createTestApp, TestApp } from './support/manual-test-app';

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
      expect(html).to.include("Workflow field mapping isn't available yet");
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
  });
});
