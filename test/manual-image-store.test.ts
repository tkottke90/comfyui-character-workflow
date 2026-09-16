import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ManualWorkflowRegistry } from '../src/services/manual-workflow.service';
import { storeManualImage } from '../src/lib/manual-image-store';

// A real, tiny, decodable PNG — used to prove the image path still computes size,
// and (for video/audio) to prove imageSize() is never invoked on it at all.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Not a valid image — imageSize() would throw on this. Used to prove the
// video/audio path never calls it.
const NOT_AN_IMAGE = Buffer.from('not a real media file', 'utf-8');

describe('storeManualImage', () => {
  let dir: string;
  let registry: ManualWorkflowRegistry;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-image-store-'));
    registry = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('computes and stores size for kind: image (default)', async () => {
    const session = await registry.addSession('Test Session');

    const image = await storeManualImage(registry, session.id, session.workflowDir, ONE_PIXEL_PNG, 'png');

    expect(image.kind).to.equal('image');
    expect(image.size).to.deep.equal({ width: 1, height: 1 });

    const reloaded = await registry.getSession(session.id);
    expect(reloaded.images[0].size).to.deep.equal({ width: 1, height: 1 });
  });

  it('skips imageSize() and omits size for kind: video, even with a non-image buffer', async () => {
    const session = await registry.addSession('Test Session');

    const image = await storeManualImage(registry, session.id, session.workflowDir, NOT_AN_IMAGE, 'mp4', 'video');

    expect(image.kind).to.equal('video');
    expect(image.size).to.equal(undefined);

    const reloaded = await registry.getSession(session.id);
    expect(reloaded.images[0].kind).to.equal('video');
    expect(reloaded.images[0].size).to.equal(undefined);
  });

  it('skips imageSize() and omits size for kind: audio, even with a non-image buffer', async () => {
    const session = await registry.addSession('Test Session');

    const image = await storeManualImage(registry, session.id, session.workflowDir, NOT_AN_IMAGE, 'mp3', 'audio');

    expect(image.kind).to.equal('audio');
    expect(image.size).to.equal(undefined);

    const reloaded = await registry.getSession(session.id);
    expect(reloaded.images[0].kind).to.equal('audio');
    expect(reloaded.images[0].size).to.equal(undefined);
  });
});
