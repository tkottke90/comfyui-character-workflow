import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CharacterConflictError,
  createCharactersService,
} from '../src/services/characters.service';

describe('characters.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'characters-service-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a character with defaults and a slugified filename', () => {
    const service = createCharactersService(dir);
    const record = service.create({ name: 'Rin Takahashi' });

    expect(record.slug).to.equal('rin-takahashi');
    expect(record.status).to.equal('draft');
    expect(fs.existsSync(path.join(dir, 'rin-takahashi.md'))).to.equal(true);
    expect(record.negativePrompt).to.include('cartoon');
  });

  it('round-trips through disk: what is created can be read back identically', () => {
    const service = createCharactersService(dir);
    service.create({ name: 'Ailsa MacLeod' });

    const fresh = createCharactersService(dir);
    const record = fresh.get('ailsa-macleod');
    expect(record?.name).to.equal('Ailsa MacLeod');
  });

  it('refuses to create two characters with the same slug', () => {
    const service = createCharactersService(dir);
    service.create({ name: 'Rin Takahashi' });

    expect(() => service.create({ name: 'Rin Takahashi' })).to.throw(CharacterConflictError);
  });

  it('lists every character, newest updated first', () => {
    const service = createCharactersService(dir);
    service.create({ name: 'Alpha' });
    service.create({ name: 'Beta' });

    const names = service.list().map((c) => c.name);
    expect(names).to.have.members(['Alpha', 'Beta']);
    expect(names).to.have.length(2);
  });

  it('bumps the updated date on every update', () => {
    const service = createCharactersService(dir);
    service.create({ name: 'Kwame Asante' });

    const updated = service.update('kwame-asante', { trigger_token: 'kwame' });
    expect(updated?.trigger_token).to.equal('kwame');
    expect(updated?.updated).to.equal(new Date().toISOString().slice(0, 10));
  });

  it('derives status from checklist completion rather than trusting a patched value directly', () => {
    const service = createCharactersService(dir);
    service.create({ name: 'Kwame Asante' });

    const forced = service.update('kwame-asante', { status: 'lora-trained' });
    expect(forced?.status).to.equal('draft');

    const preflightChecklist = Object.fromEntries(
      [
        'no_feature_lines',
        'full_body_uncropped',
        'silhouette_adherence',
        'attrs_present',
        'bg_clean',
        'no_watermarks',
        'vram_ok',
        'embeds_seed',
      ].map((id) => [`preflight.${id}`, true]),
    );
    const advanced = service.update('kwame-asante', { checklist: preflightChecklist });
    expect(advanced?.status).to.equal('casting');
  });

  it('returns undefined when updating a character that does not exist', () => {
    const service = createCharactersService(dir);
    expect(service.update('nobody', { status: 'casting' })).to.equal(undefined);
  });

  it('preserves nested objects (attributes) across an unrelated update', () => {
    const service = createCharactersService(dir);
    service.create({
      name: 'Marguerite Dubois',
      attributes: {
        sex: 'Female',
        apparent_age: '',
        ethnicity: 'French',
        skin_tone: '',
        face_shape: '',
        eyes: '',
        eyebrows: '',
        hair: '',
        nose: '',
        lips: '',
        build: '',
        height_impression: '',
        base_clothing: '',
      },
    });

    const updated = service.update('marguerite-dubois', { status: 'casting' });
    expect(updated?.attributes.ethnicity).to.equal('French');
  });

  it('removes a character', () => {
    const service = createCharactersService(dir);
    service.create({ name: 'Temp Character' });

    expect(service.remove('temp-character')).to.equal(true);
    expect(service.get('temp-character')).to.equal(undefined);
    expect(service.remove('temp-character')).to.equal(false);
  });
});
