import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import initializeConfig from '../src/config';
import { Application } from '../src/types/application';
import { DEFAULT_PROMPT_ADAPTER_PRESETS } from '../src/lib/prompt-adapter-defaults';

describe('initializeConfig — missing-section migration', () => {
  let dir: string;
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    previousConfigDir = process.env.CONFIG_DIR;
    process.env.CONFIG_DIR = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousConfigDir === undefined) {
      delete process.env.CONFIG_DIR;
    } else {
      process.env.CONFIG_DIR = previousConfigDir;
    }
  });

  it('adds the prompt-adapter-presets section to a config.yaml missing it', () => {
    const configPath = path.join(dir, 'config.yaml');
    fs.writeFileSync(configPath, yaml.stringify({ port: 3000, host: 'localhost' }), 'utf-8');

    const app = {} as Application;
    initializeConfig(app);

    expect(app.config._configData['prompt-adapter-presets']).to.deep.equal(
      DEFAULT_PROMPT_ADAPTER_PRESETS,
    );

    const onDisk = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(onDisk['prompt-adapter-presets']).to.deep.equal(DEFAULT_PROMPT_ADAPTER_PRESETS);
  });

  it('creates a fresh config.yaml with the full preset set when none exists', () => {
    const app = {} as Application;
    initializeConfig(app);

    const configPath = path.join(dir, 'config.yaml');
    const onDisk = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(onDisk['prompt-adapter-presets']).to.deep.equal(DEFAULT_PROMPT_ADAPTER_PRESETS);
  });
});
