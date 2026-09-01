import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import {
  ManualWorkflowRegistry,
  ManualFieldSchema,
  ManualGenerationSchema,
} from '../src/services/manual-workflow.service';
import { createJobStore } from '../src/services/job-store.service';
import { createComfyUIClient } from '../src/services/comfyui-client.service';
import { createComfyUISocket } from '../src/services/comfyui-socket.service';
import { createManualExecutionService } from '../src/services/manual-execution.service';

// A real, tiny, decodable PNG — unlike the character pipeline (whose CharacterImagesService
// never computes width/height), storeManualImage() calls `imageSize()` on every result, so
// the stub /view route must hand back bytes an actual image decoder accepts.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** A stub ComfyUI server that hands out a fresh sequential prompt_id per /prompt call and
 *  records every submitted graph — mirrors execution.service.test.ts's
 *  `startStubComfyServerMulti`, since manual batches submit sequentially too.
 *
 *  `/history/<promptId>` returns empty until the test calls `markDone(promptId)` —
 *  matching real ComfyUI (history is empty while a prompt is still in flight) and
 *  needed because ManualExecutionService now checks history once, right after
 *  submission, as a guard against a real race (see manual-execution.service.ts's
 *  `checkAlreadyCompletedSingle`/`checkAlreadyCompletedBatchSubJob`): if this stub
 *  reported every prompt as instantly complete, that guard would resolve every job
 *  immediately and the tests below would never see a genuine "queued"/"running" state. */
async function startStubComfyServer(opts: {
  onPrompt: (graph: Record<string, { inputs?: Record<string, unknown> }>, promptId: string) => void;
}) {
  let promptCounter = 0;
  const completedPromptIds = new Set<string>();

  const server = http.createServer(async (req, res) => {
    const pathname = (req.url ?? '').split('?')[0];

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
      if (!completedPromptIds.has(promptId)) {
        res.end(JSON.stringify({}));
        return;
      }
      res.end(
        JSON.stringify({
          [promptId]: {
            outputs: {
              '4': { images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }] },
            },
            status: { completed: true, statusStr: 'success' },
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/view') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(ONE_PIXEL_PNG);
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    markDone: (promptId: string) => completedPromptIds.add(promptId),
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

const TEST_GRAPH = {
  '1': {
    class_type: 'TestNode',
    inputs: { text: 'unset', seed: 0 },
    _meta: { title: 'Test Node' },
  },
  '4': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'ComfyUI' },
    _meta: { title: 'Save Image' },
  },
};

describe('manual-execution.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-execution-service-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('submits a single generation and completes it via the executing:{node:null} signal, writing one generations entry and one images entry', async () => {
    const manualWorkflows = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
    const session = await manualWorkflows.addSession('Test Session');
    await writeFile(path.join(session.workflowDir, 'workflow.json'), JSON.stringify(TEST_GRAPH));

    const promptField = ManualFieldSchema.parse({
      key: 'prompt',
      type: 'text',
      value: 'a placeholder prompt',
      mappings: [{ nodeId: '1', inputName: 'text', classType: 'TestNode' }],
    });
    await manualWorkflows.updateSession(session.id, {
      workflowFile: 'workflow.json',
      fields: [promptField],
      resultOutput: { nodeId: '4', outputIndex: 0 },
    });

    let submittedGraph: Record<string, { inputs?: Record<string, unknown> }> | undefined;
    const httpStub = await startStubComfyServer({
      onPrompt: (graph) => {
        submittedGraph = graph;
      },
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const manualExecution = createManualExecutionService({
        manualWorkflows,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      const { generationId } = await manualExecution.submitGeneration(session.id, 42);
      expect(submittedGraph?.['1'].inputs?.text).to.equal('a placeholder prompt');

      const queued = jobStore.get(session.id, generationId);
      expect(queued?.kind === 'single' && queued.status).to.equal('queued');

      httpStub.markDone('prompt-1');
      wsStub.send({ type: 'executing', data: { node: null, prompt_id: 'prompt-1' } });

      const done = await waitUntil(() => {
        const job = jobStore.get(session.id, generationId);
        return job?.kind === 'single' && job.status === 'done' ? job : undefined;
      });
      expect(done.resultPath).to.be.a('string');

      const finalSession = await manualWorkflows.getSession(session.id);
      expect(finalSession.generations).to.have.length(1);
      expect(finalSession.generations[0].id).to.equal(generationId);
      expect(finalSession.generations[0].status).to.equal('done');
      expect(finalSession.images).to.have.length(1);
      expect(finalSession.generations[0].imageId).to.equal(finalSession.images[0].id);
      expect(finalSession.generations[0].seed).to.equal(42);
      expect(
        fs.existsSync(path.join(session.workflowDir, 'assets', finalSession.images[0].filename)),
      ).to.equal(true);
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('resolves a generation whose history is already complete immediately after submission — regression for the cache-hit race where completion beats promptOwners registration', async () => {
    const manualWorkflows = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
    const session = await manualWorkflows.addSession('Test Session');
    await writeFile(path.join(session.workflowDir, 'workflow.json'), JSON.stringify(TEST_GRAPH));
    await manualWorkflows.updateSession(session.id, {
      workflowFile: 'workflow.json',
      resultOutput: { nodeId: '4', outputIndex: 0 },
    });

    const httpStub = await startStubComfyServer({ onPrompt: () => {} });
    // Simulates ComfyUI finishing (e.g. every node a cache hit) before the websocket ever
    // gets a chance to notify this process — the fix must not depend on any socket message.
    httpStub.markDone('prompt-1');
    const wsStub = await startStubWsServer(); // deliberately never sends anything
    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const manualExecution = createManualExecutionService({
        manualWorkflows,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      const { generationId } = await manualExecution.submitGeneration(session.id, 7);

      const record = jobStore.get(session.id, generationId);
      expect(record?.kind === 'single' && record.status).to.equal('done');

      const finalSession = await manualWorkflows.getSession(session.id);
      expect(finalSession.generations[0].status).to.equal('done');
      expect(finalSession.images).to.have.length(1);
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('submits a batch, auto-incrementing the seed mapping, producing N generations sharing a batchId', async () => {
    const manualWorkflows = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
    const session = await manualWorkflows.addSession('Test Session');
    await writeFile(path.join(session.workflowDir, 'workflow.json'), JSON.stringify(TEST_GRAPH));

    await manualWorkflows.updateSession(session.id, {
      workflowFile: 'workflow.json',
      resultOutput: { nodeId: '4', outputIndex: 0 },
      seedMappings: [{ nodeId: '1', inputName: 'seed', classType: 'TestNode' }],
    });

    const submittedSeeds: unknown[] = [];
    const httpStub = await startStubComfyServer({
      onPrompt: (graph) => {
        submittedSeeds.push(graph['1'].inputs?.seed);
      },
    });
    const wsStub = await startStubWsServer();

    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const manualExecution = createManualExecutionService({
        manualWorkflows,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      const { batchId } = await manualExecution.submitBatch(session.id, 10, 3);
      expect(submittedSeeds).to.deep.equal([10, 11, 12]);

      const afterSubmit = await manualWorkflows.getSession(session.id);
      expect(afterSubmit.generations).to.have.length(3);
      expect(afterSubmit.generations.every((g) => g.batchId === batchId)).to.equal(true);
      expect(afterSubmit.generations.every((g) => g.status === 'queued')).to.equal(true);

      // Sent one at a time, each awaited before the next — mirroring ComfyUI's actual
      // serial execution of a batch (never truly simultaneous completions), and avoiding
      // the same "process one completion at a time" assumption `replaceSubJob`'s
      // captured-snapshot pattern already relies on in the character pipeline this
      // mirrors (execution.service.ts).
      for (const promptId of ['prompt-1', 'prompt-2', 'prompt-3']) {
        httpStub.markDone(promptId);
        wsStub.send({ type: 'executing', data: { node: null, prompt_id: promptId } });
        await waitUntil(() => {
          const job = jobStore.get(session.id, batchId);
          const subJob = job?.kind === 'batch' && job.subJobs.find((s) => s.promptId === promptId);
          return subJob && subJob.status === 'done' ? subJob : undefined;
        });
      }

      await waitUntil(() => {
        const job = jobStore.get(session.id, batchId);
        return job?.kind === 'batch' && job.subJobs.every((s) => s.status === 'done') ? job : undefined;
      });

      const finalSession = await manualWorkflows.getSession(session.id);
      expect(finalSession.generations.filter((g) => g.status === 'done')).to.have.length(3);
      expect(finalSession.generations.map((g) => g.seed).sort()).to.deep.equal([10, 11, 12]);
      expect(finalSession.images).to.have.length(3);
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  it('allows two overlapping submitGeneration calls for the same session, each tracked and completed independently', async () => {
    const manualWorkflows = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
    const session = await manualWorkflows.addSession('Test Session');
    await writeFile(path.join(session.workflowDir, 'workflow.json'), JSON.stringify(TEST_GRAPH));
    await manualWorkflows.updateSession(session.id, {
      workflowFile: 'workflow.json',
      resultOutput: { nodeId: '4', outputIndex: 0 },
    });

    const httpStub = await startStubComfyServer({ onPrompt: () => {} });
    const wsStub = await startStubWsServer();
    const jobStore = createJobStore(path.join(dir, 'jobs'));
    const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${wsStub.port}`, clientId: 'app-client' });

    try {
      const opened = new Promise<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const manualExecution = createManualExecutionService({
        manualWorkflows,
        comfyClient,
        socket,
        jobStore,
        clientId: 'app-client',
      });

      // Neither call is awaited before the other starts — mirrors clicking Generate twice
      // in a row without waiting for the first to resolve.
      const [{ generationId: firstId }, { generationId: secondId }] = await Promise.all([
        manualExecution.submitGeneration(session.id, 1),
        manualExecution.submitGeneration(session.id, 2),
      ]);

      expect(firstId).to.not.equal(secondId);
      const firstQueued = jobStore.get(session.id, firstId);
      const secondQueued = jobStore.get(session.id, secondId);
      expect(firstQueued?.kind === 'single' && firstQueued.status).to.equal('queued');
      expect(secondQueued?.kind === 'single' && secondQueued.status).to.equal('queued');

      // Complete them out of submission order — each must resolve independently, keyed by
      // its own generationId, without disturbing the other's job-store entry.
      httpStub.markDone('prompt-2');
      wsStub.send({ type: 'executing', data: { node: null, prompt_id: 'prompt-2' } });
      await waitUntil(() => {
        const job = jobStore.get(session.id, secondId);
        return job?.kind === 'single' && job.status === 'done' ? job : undefined;
      });

      const stillQueued = jobStore.get(session.id, firstId);
      expect(stillQueued?.kind === 'single' && stillQueued.status).to.equal('queued');

      httpStub.markDone('prompt-1');
      wsStub.send({ type: 'executing', data: { node: null, prompt_id: 'prompt-1' } });
      await waitUntil(() => {
        const job = jobStore.get(session.id, firstId);
        return job?.kind === 'single' && job.status === 'done' ? job : undefined;
      });

      const finalSession = await manualWorkflows.getSession(session.id);
      expect(finalSession.generations).to.have.length(2);
      expect(finalSession.generations.every((g) => g.status === 'done')).to.equal(true);
      expect(finalSession.images).to.have.length(2);
    } finally {
      socket.close();
      await new Promise<void>((resolve) => wsStub.wss.close(() => resolve()));
      await httpStub.close();
      await jobStore.close();
    }
  });

  describe('reconcile', () => {
    it('resolves a manual job that actually completed while the process was down', async () => {
      const manualWorkflows = ManualWorkflowRegistry.fromPath(path.join(dir, 'registry.json'));
      const session = await manualWorkflows.addSession('Test Session');
      await writeFile(path.join(session.workflowDir, 'workflow.json'), JSON.stringify(TEST_GRAPH));
      await manualWorkflows.updateSession(session.id, {
        workflowFile: 'workflow.json',
        resultOutput: { nodeId: '4', outputIndex: 0 },
      });

      const httpStub = await startStubComfyServer({ onPrompt: () => {} });
      httpStub.markDone('prompt-1'); // this test's whole premise: it already finished while the process was down
      const jobStore = createJobStore(path.join(dir, 'jobs'));
      const comfyClient = createComfyUIClient({ baseUrl: httpStub.baseUrl });
      const socket = createComfyUISocket({ baseUrl: httpStub.baseUrl, clientId: 'app-client' });

      // Simulate a generation left "queued" by a process that died before completion —
      // written directly rather than via submitGeneration, whose socket-driven completion
      // path is exactly what reconcile() exists to substitute for.
      const generationRecord = ManualGenerationSchema.parse({
        id: 'gen-1',
        status: 'queued',
        fieldValuesSnapshot: {},
      });
      await manualWorkflows.updateSession(session.id, { generations: [generationRecord] });
      await jobStore.set(session.id, 'gen-1', {
        kind: 'single',
        promptId: 'prompt-1',
        status: 'queued',
        progress: null,
        resultPath: null,
        error: null,
        submittedAt: new Date().toISOString(),
        generationId: 'gen-1',
      });

      try {
        const manualExecution = createManualExecutionService({
          manualWorkflows,
          comfyClient,
          socket,
          jobStore,
          clientId: 'app-client',
        });

        await manualExecution.reconcile();

        const record = jobStore.get(session.id, 'gen-1');
        expect(record?.kind === 'single' && record.status).to.equal('done');

        const finalSession = await manualWorkflows.getSession(session.id);
        expect(finalSession.generations[0].status).to.equal('done');
        expect(finalSession.images).to.have.length(1);
      } finally {
        await httpStub.close();
        await jobStore.close();
      }
    });
  });
});
