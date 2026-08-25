import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCharacterImagesService } from '../src/services/character-images.service';

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('character-images.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'character-images-service-'));
    fs.mkdirSync(path.join(dir, 'rin-takahashi'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores a working file with a timestamped filename under the phase-binding directory', () => {
    const service = createCharacterImagesService(dir);
    const stored = service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );

    expect(stored.phaseBindingKey).to.equal('refinement_cleanup');
    expect(stored.kind).to.equal('image');
    expect(stored.filename).to.match(/^\d{14}-image\.png$/);
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', stored.relativePath))).to.equal(true);
  });

  it('never overwrites a working file — repeated stores accumulate', () => {
    const service = createCharacterImagesService(dir);
    service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );
    service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );

    const files = fs.readdirSync(path.join(dir, 'rin-takahashi', 'refinement_cleanup'));
    expect(files).to.have.length(2);
  });

  it('stores a casting candidate by seed and never overwrites it', () => {
    const service = createCharacterImagesService(dir);
    const relativePath = service.storeCastingCandidate('rin-takahashi', 42, ONE_PIXEL_PNG_DATA_URL);

    expect(relativePath).to.equal(path.join('casting_batch', 'seed-42.png'));
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', relativePath))).to.equal(true);
  });

  it('rejects a path-traversal-shaped slug, phase-binding key, or seed', () => {
    const service = createCharacterImagesService(dir);

    expect(() =>
      service.storeWorkingFile('../etc', 'refinement_cleanup', 'image', ONE_PIXEL_PNG_DATA_URL),
    ).to.throw();
    expect(() =>
      service.storeWorkingFile('rin-takahashi', '../../etc', 'image', ONE_PIXEL_PNG_DATA_URL),
    ).to.throw();
  });

  it('promotes a file into another phase binding as a new timestamped working file', () => {
    const service = createCharacterImagesService(dir);
    const candidate = service.storeCastingCandidate('rin-takahashi', 42, ONE_PIXEL_PNG_DATA_URL);

    const promoted = service.promoteToPhaseBinding(
      'rin-takahashi',
      candidate,
      'refinement_face_detail',
    );

    expect(promoted.phaseBindingKey).to.equal('refinement_face_detail');
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', promoted.relativePath))).to.equal(true);
    // The source file is untouched — promotion copies, it doesn't move.
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', candidate))).to.equal(true);
  });

  it('rejects a promote source path that resolves outside the character directory', () => {
    const service = createCharacterImagesService(dir);
    expect(() =>
      service.promoteToPhaseBinding(
        'rin-takahashi',
        '../other-character/secret.png',
        'refinement_face_detail',
      ),
    ).to.throw();
  });

  it('listImages groups finalized vs. working and orders working newest first', () => {
    const service = createCharacterImagesService(dir);
    service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );
    service.storeWorkingFile('rin-takahashi', 'refinement_cleanup', 'mask', ONE_PIXEL_PNG_DATA_URL);

    const listing = service.listImages('rin-takahashi');
    expect(listing.finalized).to.have.length(0);
    expect(listing.working).to.have.length(2);
    expect(listing.working[0].timestamp >= listing.working[1].timestamp).to.equal(true);
  });

  it('finalize refuses to run without a matching .safetensors file', () => {
    const service = createCharacterImagesService(dir);
    service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );

    expect(() => service.finalize('rin-takahashi', [])).to.throw(/safetensors/);
  });

  it('finalize promotes only the selected working files and sweeps everything else', () => {
    const service = createCharacterImagesService(dir);
    const keep = service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );
    const discard = service.storeWorkingFile(
      'rin-takahashi',
      'targeted_fix',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );
    fs.writeFileSync(path.join(dir, 'rin-takahashi', 'rin-takahashi.safetensors'), 'fake-lora');

    const result = service.finalize('rin-takahashi', [keep.relativePath]);

    expect(result.finalized).to.have.length(1);
    expect(result.finalized[0]).to.match(/^img-001\.png$/);
    expect(
      fs.existsSync(path.join(dir, 'rin-takahashi', 'finalizedImages', result.finalized[0])),
    ).to.equal(true);

    // The discarded working file is gone; the promoted source is untouched (finalize copies).
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', discard.relativePath))).to.equal(false);
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', keep.relativePath))).to.equal(true);
    expect(result.deleted).to.include(discard.relativePath);
  });

  it('promotes a file into another phase binding from a finalized-image source', () => {
    const service = createCharacterImagesService(dir);
    const working = service.storeWorkingFile(
      'rin-takahashi',
      'refinement_cleanup',
      'image',
      ONE_PIXEL_PNG_DATA_URL,
    );
    fs.writeFileSync(path.join(dir, 'rin-takahashi', 'rin-takahashi.safetensors'), 'fake-lora');
    const finalizeResult = service.finalize('rin-takahashi', [working.relativePath]);
    const finalizedRelativePath = path.join('finalizedImages', finalizeResult.finalized[0]);

    const promoted = service.promoteToPhaseBinding(
      'rin-takahashi',
      finalizedRelativePath,
      'targeted_fix',
    );

    expect(promoted.phaseBindingKey).to.equal('targeted_fix');
    expect(fs.existsSync(path.join(dir, 'rin-takahashi', promoted.relativePath))).to.equal(true);
  });

  describe('getCurrentWorkingFile', () => {
    it('returns the newest matching file for a phase binding + kind', () => {
      const service = createCharacterImagesService(dir);
      const phaseDir = path.join(dir, 'rin-takahashi', 'refinement_cleanup');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, '20260101120000-image.png'), 'older');
      fs.writeFileSync(path.join(phaseDir, '20260101120005-image.png'), 'newer');

      const current = service.getCurrentWorkingFile('rin-takahashi', 'refinement_cleanup', 'image');
      expect(current?.filename).to.equal('20260101120005-image.png');
    });

    it('returns undefined when no working file exists for that phase binding + kind', () => {
      const service = createCharacterImagesService(dir);
      expect(
        service.getCurrentWorkingFile('rin-takahashi', 'refinement_cleanup', 'image'),
      ).to.equal(undefined);
    });
  });

  describe('deleteWorkingFile', () => {
    it('deletes a non-current working file and reports wasCurrent: false', () => {
      const service = createCharacterImagesService(dir);
      const older = service.storeWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );
      // Directly write a file with a later timestamp so "current" is unambiguous regardless
      // of what wall-clock second storeWorkingFile happened to land on.
      fs.writeFileSync(
        path.join(dir, 'rin-takahashi', 'refinement_cleanup', '99999999999999-image.png'),
        'newer',
      );

      const result = service.deleteWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        older.filename,
      );

      expect(result).to.deep.equal({ deleted: true, wasCurrent: false });
      expect(fs.existsSync(path.join(dir, 'rin-takahashi', older.relativePath))).to.equal(false);
    });

    it('deletes the newest working file for its phase binding and reports wasCurrent: true', () => {
      const service = createCharacterImagesService(dir);
      const current = service.storeWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );

      const result = service.deleteWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        current.filename,
      );

      expect(result).to.deep.equal({ deleted: true, wasCurrent: true });
    });

    it('is idempotent — deleting an already-gone or never-existing file reports deleted: false', () => {
      const service = createCharacterImagesService(dir);
      const result = service.deleteWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        '20260101120000-image.png',
      );
      expect(result).to.deep.equal({ deleted: false, wasCurrent: false });
    });

    it('rejects a path-traversal-shaped phase-binding key or filename', () => {
      const service = createCharacterImagesService(dir);
      expect(() => service.deleteWorkingFile('rin-takahashi', '../../etc', 'x.png')).to.throw();
      expect(() =>
        service.deleteWorkingFile('rin-takahashi', 'refinement_cleanup', '../../etc/passwd'),
      ).to.throw();
    });
  });

  describe('listGalleryTiles', () => {
    it('tags images from all three sources and keeps the flat list sorted newest first', () => {
      const service = createCharacterImagesService(dir);
      const working = service.storeWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );
      const castingRelativePath = service.storeCastingCandidate(
        'rin-takahashi',
        7,
        ONE_PIXEL_PNG_DATA_URL,
      );
      fs.writeFileSync(path.join(dir, 'rin-takahashi', 'rin-takahashi.safetensors'), 'fake-lora');
      service.finalize('rin-takahashi', [working.relativePath]);

      const tiles = service.listGalleryTiles('rin-takahashi');
      const bySource = (kind: string) => tiles.filter((t) => t.source.kind === kind);

      // finalize() copies rather than moves, so the original working file is still present
      // alongside its new finalized copy.
      expect(bySource('working')).to.have.length(1);
      expect(bySource('finalized')).to.have.length(1);
      expect(bySource('casting')).to.have.length(1);
      expect(bySource('casting')[0].relativePath).to.equal(castingRelativePath);

      for (let i = 1; i < tiles.length; i += 1) {
        expect(tiles[i - 1].timestamp >= tiles[i].timestamp).to.equal(true);
      }
    });

    it('marks exactly the newest working image per phase binding as current; finalized/casting are never current', () => {
      const service = createCharacterImagesService(dir);
      service.storeWorkingFile(
        'rin-takahashi',
        'refinement_cleanup',
        'image',
        ONE_PIXEL_PNG_DATA_URL,
      );
      fs.writeFileSync(
        path.join(dir, 'rin-takahashi', 'refinement_cleanup', '99999999999999-image.png'),
        'newer',
      );
      service.storeCastingCandidate('rin-takahashi', 3, ONE_PIXEL_PNG_DATA_URL);

      const tiles = service.listGalleryTiles('rin-takahashi');
      const workingTiles = tiles.filter(
        (t) => t.source.kind === 'working' && t.source.phaseBindingKey === 'refinement_cleanup',
      );

      expect(workingTiles).to.have.length(2);
      expect(workingTiles.filter((t) => t.isCurrent)).to.have.length(1);
      expect(workingTiles.find((t) => t.isCurrent)?.filename).to.equal('99999999999999-image.png');
      expect(tiles.filter((t) => t.source.kind === 'casting').every((t) => !t.isCurrent)).to.equal(
        true,
      );
    });
  });
});
