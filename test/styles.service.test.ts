import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStylesService, StyleConflictError } from '../src/services/styles.service';

const BASE_INPUT = {
  checkpoint: 'RealVisXL_V5.0',
  sampler: 'dpmpp_2m',
  scheduler: 'karras',
  cfg: 5,
  steps: 28,
};

describe('styles.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-service-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a style with a slug and defaults', () => {
    const service = createStylesService(dir);
    const record = service.create({ name: 'Cinematic Portrait', ...BASE_INPUT });

    expect(record.slug).to.equal('cinematic-portrait');
    expect(record.description).to.equal('');
    expect(record.artStyle).to.equal('');
    expect(record.checkpoint).to.equal('RealVisXL_V5.0');
  });

  it('refuses duplicate style names', () => {
    const service = createStylesService(dir);
    service.create({ name: 'Pear', ...BASE_INPUT });
    expect(() => service.create({ name: 'Pear', ...BASE_INPUT })).to.throw(StyleConflictError);
  });

  it('lists styles alphabetically by name', () => {
    const service = createStylesService(dir);
    service.create({ name: 'Rectangle', ...BASE_INPUT });
    service.create({ name: 'Apple', ...BASE_INPUT });

    expect(service.list().map((s) => s.name)).to.deep.equal(['Apple', 'Rectangle']);
  });

  it('gets a style by slug, and undefined for an unknown slug', () => {
    const service = createStylesService(dir);
    service.create({ name: 'Diamond', ...BASE_INPUT });

    expect(service.get('diamond')?.name).to.equal('Diamond');
    expect(service.get('nonexistent')).to.equal(undefined);
  });

  it('updates a style, round-tripping the change', () => {
    const service = createStylesService(dir);
    service.create({ name: 'Hourglass', ...BASE_INPUT });

    const updated = service.update('hourglass', { cfg: 7 });
    expect(updated?.cfg).to.equal(7);
    expect(service.get('hourglass')?.cfg).to.equal(7);
  });

  it('removes a style', () => {
    const service = createStylesService(dir);
    service.create({ name: 'OpenPose Sheet', ...BASE_INPUT });

    expect(service.remove('openpose-sheet')).to.equal(true);
    expect(service.get('openpose-sheet')).to.equal(undefined);
  });

  it('rejects cfg above the max', () => {
    const service = createStylesService(dir);
    expect(() => service.create({ name: 'Too Hot', ...BASE_INPUT, cfg: 25 })).to.throw();
  });

  it('rejects steps above the max', () => {
    const service = createStylesService(dir);
    expect(() => service.create({ name: 'Too Many Steps', ...BASE_INPUT, steps: 150 })).to.throw();
  });

  it('defaults promptAdapter to empty/template when not provided', () => {
    const service = createStylesService(dir);
    const record = service.create({ name: 'Plain Style', ...BASE_INPUT });

    expect(record.promptAdapter).to.deep.equal({
      presetId: '',
      leadTags: '',
      qualityTagsPositive: '',
      negativeMode: 'template',
      qualityTagsNegative: '',
    });
  });

  it('round-trips a promptAdapter patch through update', () => {
    const service = createStylesService(dir);
    service.create({ name: 'Anime Style', ...BASE_INPUT });

    const updated = service.update('anime-style', {
      promptAdapter: {
        presetId: 'illustrious',
        leadTags: '1girl',
        qualityTagsPositive: 'masterpiece, best quality',
        negativeMode: 'template',
        qualityTagsNegative: 'worst quality, low quality',
      },
    });

    expect(updated?.promptAdapter).to.deep.equal({
      presetId: 'illustrious',
      leadTags: '1girl',
      qualityTagsPositive: 'masterpiece, best quality',
      negativeMode: 'template',
      qualityTagsNegative: 'worst quality, low quality',
    });
    expect(service.get('anime-style')?.promptAdapter.leadTags).to.equal('1girl');
  });
});
