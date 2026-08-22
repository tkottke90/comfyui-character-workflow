import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTemplatesService, TemplateConflictError } from '../src/services/templates.service';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('templates.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'templates-service-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a template with a slug and default type', () => {
    const service = createTemplatesService(dir);
    const record = service.create({ name: 'Inverted Triangle' });

    expect(record.slug).to.equal('inverted-triangle');
    expect(record.type).to.equal('silhouette');
    expect(record.filename).to.equal('');
  });

  it('stores an uploaded image and records its filename', () => {
    const service = createTemplatesService(dir);
    const record = service.create({ name: 'Hourglass', imageDataUrl: ONE_PIXEL_PNG });

    expect(record.filename).to.equal('hourglass.png');
    expect(fs.existsSync(path.join(service.uploadsDir, 'hourglass.png'))).to.equal(true);
  });

  it('refuses duplicate template names', () => {
    const service = createTemplatesService(dir);
    service.create({ name: 'Pear' });
    expect(() => service.create({ name: 'Pear' })).to.throw(TemplateConflictError);
  });

  it('replaces an image, overwriting the stored file', () => {
    const service = createTemplatesService(dir);
    service.create({ name: 'Diamond', imageDataUrl: ONE_PIXEL_PNG });

    const replaced = service.replaceImage('diamond', ONE_PIXEL_PNG);
    expect(replaced?.filename).to.equal('diamond.png');
  });

  it('lists templates alphabetically by name', () => {
    const service = createTemplatesService(dir);
    service.create({ name: 'Rectangle' });
    service.create({ name: 'Apple' });

    expect(service.list().map((t) => t.name)).to.deep.equal(['Apple', 'Rectangle']);
  });

  it('removes a template and its stored image', () => {
    const service = createTemplatesService(dir);
    service.create({ name: 'OpenPose Sheet', imageDataUrl: ONE_PIXEL_PNG });

    const imagePath = path.join(service.uploadsDir, 'openpose-sheet.png');
    expect(fs.existsSync(imagePath)).to.equal(true);

    expect(service.remove('openpose-sheet')).to.equal(true);
    expect(fs.existsSync(imagePath)).to.equal(false);
    expect(service.get('openpose-sheet')).to.equal(undefined);
  });
});
