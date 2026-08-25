import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import { createCharactersService } from '../src/services/characters.service';
import { createCharacterImagesService } from '../src/services/character-images.service';
import { createWorkflowMappingService } from '../src/services/workflow-mapping.service';
import { createJobStore } from '../src/services/job-store.service';
import { createComfyUIClient } from '../src/services/comfyui-client.service';
import { createComfyUISocket } from '../src/services/comfyui-socket.service';
import { createExecutionService } from '../src/services/execution.service';

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function startStubComfyServer(opts: {
  promptId: string;
  onUpload: (filename: string) => void;
  onPrompt: (graph: Record<string, unknown>) => void;
}) {
  let uploadCounter = 0;

  const server = http.createServer(async (req, res) => {
    const pathname = (req.url ?? '').split('?')[0];

    if (req.method === 'POST' && pathname === '/upload/image') {
      const body = (await readBody(req)).toString('utf-8');
      const match = /filename="([^"]+)"/.exec(body);
      const filename = match ? match[1] : `upload-${(uploadCounter += 1)}.png`;
      opts.onUpload(filename);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: `saved-${filename}`, subfolder: '', type: 'input' }));
      return;
    }

    if (req.method === 'POST' && pathname === '/prompt') {
      const body = JSON.parse((await readBody(req)).toString('utf-8'));
      opts.onPrompt(body.prompt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ prompt_id: opts.promptId }));
      return;
    }

    if (req.method === 'GET' && pathname === `/history/${opts.promptId}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          [opts.promptId]: {
            outputs: { '4': { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] } },
            status: { completed: true, statusStr: 'success' },
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/view') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from('fake-result-bytes'));
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A stub ComfyUI server that hands out a fresh sequential prompt_id per /prompt call —
 *  needed for casting batch, where each of the N submissions gets its own history entry. */
async function startStubComfyServerMulti(opts: {
  onUpload: (filename: string) => void;
  onPrompt: (graph: Record<string, unknown>, promptId: string) => void;
}) {
  let uploadCounter = 0;
  let promptCounter = 0;

  const server = http.createServer(async (req, res) => {
    const pathname = (req.url ?? '').split('?')[0];

    if (req.method === 'POST' && pathname === '/upload/image') {
      const body = (await readBody(req)).toString('utf-8');
      const match = /filename="([^"]+)"/.exec(body);
      const filename = match ? match[1] : `upload-${(uploadCounter += 1)}.png`;
      opts.onUpload(filename);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: `saved-${filename}`, subfolder: '', type: 'input' }));
      return;
    }

    if (req.method === 'POST' && pathname === '/prompt') {
      const body = JSON.parse((await readBody(req)).toString('utf-8'));
      const promptId = `prompt-${(promptCounter += 1)}`;
      opts.onPrompt(body.prompt, promptId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ prompt_id: promptId }));
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/history/')) {
      const promptId = pathname.slice('/history/'.length);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          [promptId]: {
            outputs: { '4': { images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }] } },
            status: { completed: true, statusStr: 'success' },
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/view') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from('fake-result-bytes'));
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function startStubWsServer() {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const port = (wss.address() as AddressInfo).port;

  const clients: WsClient[] = [];
  wss.on('connection', (socket) => clients.push(socket));

  return {
    port,
    wss,
    send: (payload: unknown) => {
      const message = JSON.stringify(payload);
      clients.forEach((client) => client.send(message));
    },
  };
}

function waitUntil<T>(check: () => T | undefined, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const result = check();
      if (result !== undefined) {
        resolve(result);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out waiting for condition'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('execution.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-service-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('submits a single-phase run, uploads image+mask with stable filenames, splices static/domain values, and completes via the executing:{node:null} signal', async () => {
    const charactersDir = path.join(dir, 'characters');
    const characters = createCharactersService(charactersDir);
    const character = characters.create({ name: 'Rin Takahashi', checkpoint: 'RealVisXL_V5.0' });

    const characterImages = createCharacterImagesService(charactersDir);
    characterImages.storeWorkingFile(character.slug, 'refinement_cleanup', 'image', ONE_PIXEL_PNG_DATA_URL);
    characterImages.storeWorkingFile(character.slug, 'refinement_cleanup', 'mask', ONE_PIXEL_PNG_DATA_URL);

    const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
    const graph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { title: 'Load Image' } },
      '2': { class_type: 'LoadImage', inputs: { image: 'placeholder-mask.png' }, _meta: { title: 'Load Mask' } },
      '3': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'placeholder.safetensors' },
        _meta: { title: 'Checkpoint' },
      },
      '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' }, _meta: { title: 'Save Image' } },
    };
    const { version } = workflowMapping.importVersion(graph, 'cleanup.json', '003-Cleanup');
    workflowMapping.updateNodeMapping('003-Cleanup', version, '1', 'image', {
      sourceType: 'domain',
      sourceValue: 'stage_input.current_image',
      status: 'mapped',
    });
    workflowMapping.updateNodeMapping('003-Cleanup', version, '2', 'image', {
      sourceType: 'domain',
      sourceValue: 'stage_input.current_mask',
      status: 'mapped',
    });
    workflowMapping.updateNodeMapping('003-Cleanup', version, '3', 'ckpt_name', {
      sourceType: 'domain',
      sourceValue: 'character.checkpoint',
      status: 'mapped',
    });
    workflowMapping.bindPhase('003-Cleanup', version, '003-Cleanup');
    workflowMapping.setResultOutput('003-Cleanup', version, { nodeId: '4', outputIndex: 0, label: 'primary_result' });
    workflowMapping.activateVersion('003-Cleanup', version);

    const uploadedFilenames: string[] = [];
    let submittedGraph: Record<string, { inputs?: Record<string, unknown> }> | undefined;
    const httpStub = await startStubComfyServer({
      promptId: 'prompt-abc',
      onUpload: (filename) => uploadedFilenames.push(filename),
      onPrompt: (graph) => {
        submittedGraph = graph as typeof submittedGraph;
      },
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({
      baseUrl: `http://127.0.0.1:${wsStub.port}`,
      clientId: 'app-client',
    });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const executionService = createExecutionService({
        workflowMapping,
        characters,
        characterImages,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      const result = await executionService.submitSingle(character.slug, 'refinement_cleanup');
      expect(result.promptId).to.equal('prompt-abc');

      expect(uploadedFilenames).to.have.length(2);
      expect(uploadedFilenames).to.include(`rin-takahashi-refinement_cleanup-image.png`);
      expect(uploadedFilenames).to.include(`rin-takahashi-refinement_cleanup-mask.png`);

      expect(submittedGraph?.['3'].inputs?.ckpt_name).to.equal('RealVisXL_V5.0');
      expect(submittedGraph?.['1'].inputs?.image).to.equal('saved-rin-takahashi-refinement_cleanup-image.png');
      expect(submittedGraph?.['2'].inputs?.image).to.equal('saved-rin-takahashi-refinement_cleanup-mask.png');

      const queued = jobStore.get(character.slug, 'refinement_cleanup');
      expect(queued?.kind === 'single' && queued.status).to.equal('queued');

      wsStub.send({ type: 'progress', data: { value: 10, max: 20, prompt_id: 'prompt-abc' } });
      await waitUntil(() => {
        const job = jobStore.get(character.slug, 'refinement_cleanup');
        return job?.kind === 'single' && job.progress?.value === 10 ? job : undefined;
      });

      wsStub.send({ type: 'executing', data: { node: null, prompt_id: 'prompt-abc' } });
      const done = await waitUntil(() => {
        const job = jobStore.get(character.slug, 'refinement_cleanup');
        return job?.kind === 'single' && job.status === 'done' ? job : undefined;
      });

      expect(done.resultPath).to.be.a('string');
      expect(fs.existsSync(path.join(charactersDir, character.slug, done.resultPath as string))).to.equal(
        true,
      );
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('threads per-run custom positive/negative prompt overrides into the submitted graph', async () => {
    const charactersDir = path.join(dir, 'characters');
    const characters = createCharactersService(charactersDir);
    const character = characters.create({ name: 'Rin Takahashi', checkpoint: 'RealVisXL_V5.0' });

    const characterImages = createCharacterImagesService(charactersDir);
    characterImages.storeWorkingFile(character.slug, 'refinement_cleanup', 'image', ONE_PIXEL_PNG_DATA_URL);

    const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
    const graph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { title: 'Load Image' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder positive' }, _meta: { title: 'Positive' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder negative' }, _meta: { title: 'Negative' } },
      '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' }, _meta: { title: 'Save Image' } },
    };
    const { version } = workflowMapping.importVersion(graph, 'cleanup.json', '003-Cleanup');
    workflowMapping.updateNodeMapping('003-Cleanup', version, '1', 'image', {
      sourceType: 'domain',
      sourceValue: 'stage_input.current_image',
      status: 'mapped',
    });
    workflowMapping.updateNodeMapping('003-Cleanup', version, '2', 'text', {
      sourceType: 'domain',
      sourceValue: 'stage_input.custom_positive_prompt',
      status: 'mapped',
    });
    workflowMapping.updateNodeMapping('003-Cleanup', version, '3', 'text', {
      sourceType: 'domain',
      sourceValue: 'stage_input.custom_negative_prompt',
      status: 'mapped',
    });
    workflowMapping.bindPhase('003-Cleanup', version, '003-Cleanup');
    workflowMapping.setResultOutput('003-Cleanup', version, { nodeId: '4', outputIndex: 0, label: 'primary_result' });
    workflowMapping.activateVersion('003-Cleanup', version);

    let submittedGraph: Record<string, { inputs?: Record<string, unknown> }> | undefined;
    const httpStub = await startStubComfyServer({
      promptId: 'prompt-def',
      onUpload: () => {},
      onPrompt: (graph) => {
        submittedGraph = graph as typeof submittedGraph;
      },
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({
      baseUrl: `http://127.0.0.1:${wsStub.port}`,
      clientId: 'app-client',
    });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const executionService = createExecutionService({
        workflowMapping,
        characters,
        characterImages,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      await executionService.submitSingle(character.slug, 'refinement_cleanup', {
        customPositivePrompt: 'a glowing rune on the wall',
        customNegativePrompt: 'no extra hands',
      });

      expect(submittedGraph?.['2'].inputs?.text).to.equal('a glowing rune on the wall');
      expect(submittedGraph?.['3'].inputs?.text).to.equal('no extra hands');
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('wraps the positive prompt in the configured phase prefix/suffix, leaving the negative prompt untouched', async () => {
    const charactersDir = path.join(dir, 'characters');
    const characters = createCharactersService(charactersDir);
    const character = characters.create({ name: 'Rin Takahashi', checkpoint: 'RealVisXL_V5.0' });

    const characterImages = createCharacterImagesService(charactersDir);
    characterImages.storeWorkingFile(character.slug, 'refinement_cleanup', 'image', ONE_PIXEL_PNG_DATA_URL);

    const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
    const graph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { title: 'Load Image' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder positive' }, _meta: { title: 'Positive' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder negative' }, _meta: { title: 'Negative' } },
      '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' }, _meta: { title: 'Save Image' } },
    };
    const { version } = workflowMapping.importVersion(graph, 'cleanup.json', '003-Cleanup');
    workflowMapping.updateNodeMapping('003-Cleanup', version, '1', 'image', {
      sourceType: 'domain',
      sourceValue: 'stage_input.current_image',
      status: 'mapped',
    });
    workflowMapping.updateNodeMapping('003-Cleanup', version, '2', 'text', {
      sourceType: 'domain',
      sourceValue: 'stage_input.custom_positive_prompt',
      status: 'mapped',
    });
    workflowMapping.updateNodeMapping('003-Cleanup', version, '3', 'text', {
      sourceType: 'domain',
      sourceValue: 'stage_input.custom_negative_prompt',
      status: 'mapped',
    });
    workflowMapping.bindPhase('003-Cleanup', version, '003-Cleanup');
    workflowMapping.setResultOutput('003-Cleanup', version, { nodeId: '4', outputIndex: 0, label: 'primary_result' });
    workflowMapping.activateVersion('003-Cleanup', version);

    let submittedGraph: Record<string, { inputs?: Record<string, unknown> }> | undefined;
    const httpStub = await startStubComfyServer({
      promptId: 'prompt-ghi',
      onUpload: () => {},
      onPrompt: (graph) => {
        submittedGraph = graph as typeof submittedGraph;
      },
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({
      baseUrl: `http://127.0.0.1:${wsStub.port}`,
      clientId: 'app-client',
    });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const executionService = createExecutionService({
        workflowMapping,
        characters,
        characterImages,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
        phasePromptConfig: {
          refinement_cleanup: { prefix: '', suffix: ', plain white background, studio lighting' },
        },
      });

      // Deliberately omits customPositivePrompt/customNegativePrompt, exercising the
      // "blank custom prompt is still a legitimate value" path — the suffix must land even
      // when the per-run override is empty.
      await executionService.submitSingle(character.slug, 'refinement_cleanup');

      expect(submittedGraph?.['2'].inputs?.text).to.equal(', plain white background, studio lighting');
      expect(submittedGraph?.['3'].inputs?.text).to.equal('');
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('marks the job as an execution error on execution_error, carrying the failing node id and message', async () => {
    const charactersDir = path.join(dir, 'characters');
    const characters = createCharactersService(charactersDir);
    const character = characters.create({ name: 'Ailsa MacLeod' });

    const characterImages = createCharacterImagesService(charactersDir);
    const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
    const graph = {
      '1': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' }, _meta: { title: 'Save Image' } },
    };
    const { version } = workflowMapping.importVersion(graph, 'polish.json', '008-Polish');
    workflowMapping.bindPhase('008-Polish', version, '008-Polish');
    workflowMapping.setResultOutput('008-Polish', version, { nodeId: '1', outputIndex: 0, label: 'primary_result' });
    workflowMapping.activateVersion('008-Polish', version);

    const httpStub = await startStubComfyServer({
      promptId: 'prompt-error',
      onUpload: () => undefined,
      onPrompt: () => undefined,
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({
      baseUrl: `http://127.0.0.1:${wsStub.port}`,
      clientId: 'app-client',
    });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const executionService = createExecutionService({
        workflowMapping,
        characters,
        characterImages,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      await executionService.submitSingle(character.slug, 'polish');

      wsStub.send({
        type: 'execution_error',
        data: { prompt_id: 'prompt-error', node_id: '1', exception_message: 'CUDA out of memory' },
      });

      const errored = await waitUntil(() => {
        const job = jobStore.get(character.slug, 'polish');
        return job?.kind === 'single' && job.status === 'error' ? job : undefined;
      });

      expect(errored.error?.kind).to.equal('execution');
      expect(errored.error?.message).to.equal('CUDA out of memory');
      expect(errored.error?.nodeId).to.equal('1');
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('casting batch submits N independent prompts with the seed overridden per candidate, tracked as sub-jobs', async () => {
    const charactersDir = path.join(dir, 'characters');
    const characters = createCharactersService(charactersDir);
    let character = characters.create({ name: 'Rin Takahashi' });
    // Mirrors what the "Queue Candidates" route does before submitting — placeholder
    // records with no imagePath yet, one per seed in the batch.
    character = characters.update(character.slug, {
      castingCandidates: [1000, 1001, 1002].map((seed) => ({
        seed,
        note: '',
        createdAt: new Date().toISOString(),
        imagePath: '',
      })),
    })!;

    const characterImages = createCharacterImagesService(charactersDir);
    const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
    const graph = {
      '1': { class_type: 'KSampler', inputs: { seed: 0 }, _meta: { title: 'KSampler' } },
      '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' }, _meta: { title: 'Save Image' } },
    };
    const { version } = workflowMapping.importVersion(graph, 'seed.json', '001-Seed');
    workflowMapping.updateNodeMapping('001-Seed', version, '1', 'seed', {
      sourceType: 'domain',
      sourceValue: 'stage_input.casting_seed',
      status: 'mapped',
    });
    workflowMapping.bindPhase('001-Seed', version, '001-Seed');
    workflowMapping.setResultOutput('001-Seed', version, { nodeId: '4', outputIndex: 0, label: 'primary_result' });
    workflowMapping.activateVersion('001-Seed', version);

    const submittedGraphs: Array<{ graph: Record<string, { inputs?: Record<string, unknown> }>; promptId: string }> =
      [];
    const httpStub = await startStubComfyServerMulti({
      onUpload: () => undefined,
      onPrompt: (graph, promptId) => {
        submittedGraphs.push({ graph: graph as never, promptId });
      },
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({
      baseUrl: `http://127.0.0.1:${wsStub.port}`,
      clientId: 'app-client',
    });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const executionService = createExecutionService({
        workflowMapping,
        characters,
        characterImages,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      const result = await executionService.submitCastingBatch(character.slug, 1000, 3);
      expect(result.promptIds).to.have.length(3);

      // Each of the 3 submissions got the seed overridden to startSeed + i, not a shared value.
      const seeds = submittedGraphs.map((s) => s.graph['1'].inputs?.seed);
      expect(seeds).to.deep.equal(['1000', '1001', '1002']);

      const queuedBatch = jobStore.get(character.slug, 'casting_batch');
      expect(queuedBatch?.kind).to.equal('batch');
      if (queuedBatch?.kind === 'batch') {
        expect(queuedBatch.subJobs.map((s) => s.seed)).to.deep.equal([1000, 1001, 1002]);
      }

      // Complete just the middle candidate — the other two sub-jobs must stay untouched.
      const middlePromptId = submittedGraphs[1].promptId;
      wsStub.send({ type: 'executing', data: { node: null, prompt_id: middlePromptId } });

      const afterOneDone = await waitUntil(() => {
        const job = jobStore.get(character.slug, 'casting_batch');
        if (job?.kind !== 'batch') return undefined;
        const middle = job.subJobs.find((s) => s.seed === 1001);
        return middle?.status === 'done' ? job : undefined;
      });

      const [first, middle, last] = afterOneDone.subJobs;
      expect(first.status).to.equal('queued');
      expect(middle.status).to.equal('done');
      expect(middle.resultPath).to.equal(path.join('casting_batch', 'seed-1001.png'));
      expect(last.status).to.equal('queued');

      expect(
        fs.existsSync(path.join(charactersDir, character.slug, 'casting_batch', 'seed-1001.png')),
      ).to.equal(true);

      // The character record's own castingCandidates.imagePath gets patched too — the tile
      // grid's pre-SSE initial render (and Phase 9's winner-lock promotion) both read this,
      // not the job store, which only holds state while a run is actually in flight.
      const updatedCharacter = characters.get(character.slug);
      const candidate = updatedCharacter?.castingCandidates.find((c) => c.seed === 1001);
      expect(candidate?.imagePath).to.equal(path.join('casting_batch', 'seed-1001.png'));
      expect(updatedCharacter?.castingCandidates.find((c) => c.seed === 1000)?.imagePath).to.equal('');
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  describe('reconcile (restart reconciliation)', () => {
    function setUpPolishMapping(workflowMapping: ReturnType<typeof createWorkflowMappingService>) {
      const graph = {
        '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' }, _meta: { title: 'Save Image' } },
      };
      const { version } = workflowMapping.importVersion(graph, 'polish.json', '008-Polish');
      workflowMapping.bindPhase('008-Polish', version, '008-Polish');
      // Node id '4' matches startStubComfyServer's fixed history-entry output key.
      workflowMapping.setResultOutput('008-Polish', version, { nodeId: '4', outputIndex: 0, label: 'primary_result' });
      workflowMapping.activateVersion('008-Polish', version);
    }

    it('resolves a job that actually completed while this process was down', async () => {
      const charactersDir = path.join(dir, 'characters');
      const characters = createCharactersService(charactersDir);
      const character = characters.create({ name: 'Restart Test' });
      const characterImages = createCharacterImagesService(charactersDir);
      const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
      setUpPolishMapping(workflowMapping);

      const jobStore = createJobStore(path.join(dir, 'jobs'));
      await jobStore.set(character.slug, 'polish', {
        kind: 'single',
        promptId: 'prompt-restart-done',
        status: 'running',
        progress: { value: 5, max: 10 },
        resultPath: null,
        error: null,
        submittedAt: new Date().toISOString(),
      });

      const httpStub = await startStubComfyServer({
        promptId: 'prompt-restart-done',
        onUpload: () => undefined,
        onPrompt: () => undefined,
      });
      const wsStub = await startStubWsServer();
      const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
      const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

      try {
        const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
        socket.connect();
        await opened;

        // A fresh service instance, exactly as boot would construct one — promptOwners
        // starts empty, simulating that the process (and its in-memory map) restarted.
        const executionService = createExecutionService({
          workflowMapping,
          characters,
          characterImages,
          comfyClient,
          socket,
          jobStore,
          clientId: 'app-client',
        });

        await executionService.reconcile();

        const resolved = jobStore.get(character.slug, 'polish');
        expect(resolved?.kind).to.equal('single');
        if (resolved?.kind === 'single') {
          expect(resolved.status).to.equal('done');
          expect(resolved.resultPath).to.be.a('string');
          expect(
            fs.existsSync(path.join(charactersDir, character.slug, resolved.resultPath as string)),
          ).to.equal(true);
        }
      } finally {
        socket.close();
        await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
        await httpStub.close();
        await jobStore.close();
      }
    });

    it('marks a job as a connection error when ComfyUI cannot be reached to check its status', async () => {
      const charactersDir = path.join(dir, 'characters');
      const characters = createCharactersService(charactersDir);
      const character = characters.create({ name: 'Restart Unreachable' });
      const characterImages = createCharacterImagesService(charactersDir);
      const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
      setUpPolishMapping(workflowMapping);

      const jobStore = createJobStore(path.join(dir, 'jobs'));
      await jobStore.set(character.slug, 'polish', {
        kind: 'single',
        promptId: 'prompt-restart-unreachable',
        status: 'running',
        progress: null,
        resultPath: null,
        error: null,
        submittedAt: new Date().toISOString(),
      });

      const wsStub = await startStubWsServer();
      // No HTTP stub server is started at all — every request to it fails outright.
      const comfyClient = createComfyUIClient({ baseUrl: 'http://127.0.0.1:1' });
      const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

      try {
        const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
        socket.connect();
        await opened;

        const executionService = createExecutionService({
          workflowMapping,
          characters,
          characterImages,
          comfyClient,
          socket,
          jobStore,
          clientId: 'app-client',
        });

        await executionService.reconcile();

        const resolved = jobStore.get(character.slug, 'polish');
        expect(resolved?.kind).to.equal('single');
        if (resolved?.kind === 'single') {
          expect(resolved.status).to.equal('error');
          expect(resolved.error?.kind).to.equal('connection');
        }
      } finally {
        socket.close();
        await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
        await jobStore.close();
      }
    });

    it('re-attaches a job still genuinely in flight, so future socket messages resolve it normally', async () => {
      const charactersDir = path.join(dir, 'characters');
      const characters = createCharactersService(charactersDir);
      const character = characters.create({ name: 'Restart Still Running' });
      const characterImages = createCharacterImagesService(charactersDir);
      const workflowMapping = createWorkflowMappingService(path.join(dir, 'workflows'));
      setUpPolishMapping(workflowMapping);

      const jobStore = createJobStore(path.join(dir, 'jobs'));
      await jobStore.set(character.slug, 'polish', {
        kind: 'single',
        promptId: 'prompt-restart-inflight',
        status: 'running',
        progress: null,
        resultPath: null,
        error: null,
        submittedAt: new Date().toISOString(),
      });

      // /history/:id for this prompt returns 200 with an empty object (no key for that
      // prompt_id) while `historyReady` is false — ComfyUI's actual "not in history yet"
      // shape, not a 404, so getHistoryEntry() must resolve to undefined rather than throw.
      // Flips to a completed entry once the test's own "it actually finishes" step runs,
      // so completeSingle's own history check (triggered by the socket message below)
      // succeeds exactly as it would against a real ComfyUI instance.
      let historyReady = false;
      const stubServer = http.createServer((req, res) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (req.method === 'GET' && pathname.startsWith('/history/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            historyReady
              ? JSON.stringify({
                  'prompt-restart-inflight': {
                    outputs: { '4': { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] } },
                    status: { completed: true, statusStr: 'success' },
                  },
                })
              : '{}',
          );
          return;
        }
        if (req.method === 'GET' && pathname === '/view') {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(Buffer.from('fake-result-bytes'));
          return;
        }
        res.writeHead(404).end('not found');
      });
      await new Promise<void>((resolve) => stubServer.listen(0, resolve));
      const httpPort = (stubServer.address() as AddressInfo).port;
      const httpStub = {
        baseUrl: `http://127.0.0.1:${httpPort}`,
        close: () => new Promise<void>((resolve) => stubServer.close(() => resolve())),
      };
      const wsStub = await startStubWsServer();
      const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
      const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

      try {
        const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
        socket.connect();
        await opened;

        const executionService = createExecutionService({
          workflowMapping,
          characters,
          characterImages,
          comfyClient,
          socket,
          jobStore,
          clientId: 'app-client',
        });

        await executionService.reconcile();

        // Not resolved yet — reconcile must not have marked it done or failed just because
        // it wasn't in history.
        const stillRunning = jobStore.get(character.slug, 'polish');
        expect(stillRunning?.kind).to.equal('single');
        if (stillRunning?.kind === 'single') expect(stillRunning.status).to.equal('running');

        // The prompt actually finishes moments later — this only resolves if reconcile()
        // re-registered promptOwners for it, since that map started empty this run.
        historyReady = true;
        wsStub.send({ type: 'executing', data: { node: null, prompt_id: 'prompt-restart-inflight' } });

        const done = await waitUntil(() => {
          const job = jobStore.get(character.slug, 'polish');
          return job?.kind === 'single' && job.status === 'done' ? job : undefined;
        });
        expect(done.resultPath).to.be.a('string');
      } finally {
        socket.close();
        await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
        await httpStub.close();
        await jobStore.close();
      }
    });
  });
});
