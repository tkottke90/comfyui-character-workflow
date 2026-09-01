import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolveManualGraph } from '../src/lib/manual-execution-resolver';
import {
  ManualWorkflowRegistry,
  ManualFieldSchema,
  ImageSchema,
} from '../src/services/manual-workflow.service';
import { ComfyUIClient } from '../src/services/comfyui-client.service';

const TEST_GRAPH = {
  '1': {
    class_type: 'TestNode',
    inputs: { text: 'original text', number: 1, flag: false, untouched: 'stays-as-is' },
    _meta: { title: 'Test Node' },
  },
};

describe('resolveManualGraph', () => {
  let dir: string;
  let registry: ManualWorkflowRegistry;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-execution-resolver-'));
    registry = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function makeSession() {
    const session = await registry.addSession('Test Session');
    await writeFile(path.join(session.workflowDir, 'workflow.json'), JSON.stringify(TEST_GRAPH));
    await registry.updateSession(session.id, { workflowFile: 'workflow.json' });
    return registry.getSession(session.id);
  }

  it('leaves every unmapped node input untouched, retaining the original literal value', async () => {
    const session = await makeSession();
    const fakeComfyClient = {} as ComfyUIClient;

    const graph = await resolveManualGraph(session, fakeComfyClient, 0);

    expect(graph['1'].inputs?.untouched).to.equal('stays-as-is');
    expect(graph['1'].inputs?.text).to.equal('original text');
  });

  it('splices a mapped number/boolean field as its real type, not a stringified value', async () => {
    const numberField = ManualFieldSchema.parse({
      key: 'num',
      type: 'number',
      value: 42,
      mappings: [{ nodeId: '1', inputName: 'number', classType: 'TestNode' }],
    });
    const boolField = ManualFieldSchema.parse({
      key: 'flag',
      type: 'boolean',
      value: true,
      mappings: [{ nodeId: '1', inputName: 'flag', classType: 'TestNode' }],
    });
    let session = await makeSession();
    await registry.updateSession(session.id, { fields: [numberField, boolField] });
    session = await registry.getSession(session.id);

    const graph = await resolveManualGraph(session, {} as ComfyUIClient, 0);

    expect(graph['1'].inputs?.number).to.equal(42);
    expect(graph['1'].inputs?.number).to.be.a('number');
    expect(graph['1'].inputs?.flag).to.equal(true);
    expect(graph['1'].inputs?.flag).to.be.a('boolean');
  });

  it('splices a mapped text field targeting more than one input at once', async () => {
    const field = ManualFieldSchema.parse({
      key: 'shared',
      type: 'text',
      value: 'shared value',
      mappings: [
        { nodeId: '1', inputName: 'text', classType: 'TestNode' },
        { nodeId: '1', inputName: 'untouched', classType: 'TestNode' },
      ],
    });
    let session = await makeSession();
    await registry.updateSession(session.id, { fields: [field] });
    session = await registry.getSession(session.id);

    const graph = await resolveManualGraph(session, {} as ComfyUIClient, 0);

    expect(graph['1'].inputs?.text).to.equal('shared value');
    expect(graph['1'].inputs?.untouched).to.equal('shared value');
  });

  it('throws when a mapped image field has no image selected', async () => {
    const field = ManualFieldSchema.parse({
      key: 'img',
      type: 'image',
      value: null,
      mappings: [{ nodeId: '1', inputName: 'text', classType: 'TestNode' }],
    });
    let session = await makeSession();
    await registry.updateSession(session.id, { fields: [field] });
    session = await registry.getSession(session.id);

    await expectRejects(
      resolveManualGraph(session, {} as ComfyUIClient, 0),
      /no image selected/,
    );
  });

  it('resolves a mapped image field by uploading the stored asset and splicing the returned filename', async () => {
    let session = await makeSession();
    const assetsDir = path.join(session.workflowDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, 'photo.png'), 'fake-bytes');

    const image = ImageSchema.parse({ id: 'img-1', filename: 'photo.png', size: { width: 1, height: 1 } });
    const field = ManualFieldSchema.parse({
      key: 'img',
      type: 'image',
      value: 'img-1',
      mappings: [{ nodeId: '1', inputName: 'text', classType: 'TestNode' }],
    });
    await registry.updateSession(session.id, { images: [image], fields: [field] });
    session = await registry.getSession(session.id);

    const uploadCalls: Array<{ filename: string }> = [];
    const fakeComfyClient = {
      uploadImage: async (_buffer: Buffer, filename: string) => {
        uploadCalls.push({ filename });
        return { name: `saved-${filename}`, subfolder: '', type: 'input' };
      },
    } as unknown as ComfyUIClient;

    const graph = await resolveManualGraph(session, fakeComfyClient, 0);

    expect(uploadCalls).to.have.length(1);
    expect(uploadCalls[0].filename).to.equal('photo.png');
    expect(graph['1'].inputs?.text).to.equal('saved-photo.png');
  });

  it('splices the seed argument into every seedMappings target, independent of regular field resolution', async () => {
    const field = ManualFieldSchema.parse({
      key: 'prompt',
      type: 'text',
      value: 'unrelated',
      mappings: [{ nodeId: '1', inputName: 'text', classType: 'TestNode' }],
    });
    let session = await makeSession();
    await registry.updateSession(session.id, {
      fields: [field],
      seedMappings: [{ nodeId: '1', inputName: 'number', classType: 'TestNode' }],
    });
    session = await registry.getSession(session.id);

    const graph = await resolveManualGraph(session, {} as ComfyUIClient, 99);

    expect(graph['1'].inputs?.number).to.equal(99);
    expect(graph['1'].inputs?.text).to.equal('unrelated');
  });

  it('ignores the seed argument entirely when seedMappings is empty — static passthrough, same as an unmapped field', async () => {
    const session = await makeSession();

    const graph = await resolveManualGraph(session, {} as ComfyUIClient, 12345);

    expect(graph['1'].inputs?.number).to.equal(1);
  });
});

async function expectRejects(promise: Promise<unknown>, messagePattern: RegExp): Promise<void> {
  try {
    await promise;
    expect.fail('expected the promise to reject');
  } catch (err) {
    expect(err).to.be.instanceOf(Error);
    expect((err as Error).message).to.match(messagePattern);
  }
}
