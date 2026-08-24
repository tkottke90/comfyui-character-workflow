import { expect } from 'chai';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createComfyUIClient, HistoryEntry } from '../src/services/comfyui-client.service';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function startStubServer(routes: Record<string, Handler>): Promise<{
  baseUrl: string;
  requests: Array<{ method: string; url: string; contentType?: string }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{ method: string; url: string; contentType?: string }> = [];

  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      contentType: req.headers['content-type'],
    });

    const pathname = (req.url ?? '').split('?')[0];
    const key = `${req.method} ${pathname}`;
    const exactHandler = routes[key];
    if (exactHandler) {
      exactHandler(req, res);
      return;
    }

    // /history/:id
    if (req.method === 'GET' && pathname.startsWith('/history/') && routes['GET /history/:id']) {
      routes['GET /history/:id'](req, res);
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('comfyui-client.service (against a local stub server)', () => {
  it('uploadImage posts multipart form data and returns the parsed result', async () => {
    const stub = await startStubServer({
      'POST /upload/image': async (req, res) => {
        await readBody(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: 'saved-image.png', subfolder: 'rin-takahashi', type: 'input' }));
      },
    });

    try {
      const client = createComfyUIClient({ baseUrl: stub.baseUrl });
      const result = await client.uploadImage(Buffer.from('fake-png-bytes'), 'image.png', 'input', {
        subfolder: 'rin-takahashi',
        overwrite: true,
      });

      expect(result).to.deep.equal({ name: 'saved-image.png', subfolder: 'rin-takahashi', type: 'input' });
      expect(stub.requests[0].contentType).to.match(/^multipart\/form-data/);
    } finally {
      await stub.close();
    }
  });

  it('submitPrompt posts the graph and client id, returning the prompt id', async () => {
    let receivedBody: unknown;
    const stub = await startStubServer({
      'POST /prompt': async (req, res) => {
        receivedBody = JSON.parse((await readBody(req)).toString('utf-8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: 'prompt-abc-123' }));
      },
    });

    try {
      const client = createComfyUIClient({ baseUrl: stub.baseUrl });
      const result = await client.submitPrompt({ '1': { class_type: 'LoadImage' } }, 'client-xyz');

      expect(result).to.deep.equal({ promptId: 'prompt-abc-123' });
      expect(receivedBody).to.deep.equal({
        prompt: { '1': { class_type: 'LoadImage' } },
        client_id: 'client-xyz',
      });
    } finally {
      await stub.close();
    }
  });

  it('getHistory returns the full history map', async () => {
    const historyPayload: Record<string, Partial<HistoryEntry>> = {
      'prompt-1': { outputs: {}, status: { completed: true, statusStr: 'success' } },
    };
    const stub = await startStubServer({
      'GET /history': (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(historyPayload));
      },
    });

    try {
      const client = createComfyUIClient({ baseUrl: stub.baseUrl });
      const history = await client.getHistory();
      expect(history['prompt-1'].status.completed).to.equal(true);
    } finally {
      await stub.close();
    }
  });

  it('getHistoryEntry unwraps the single prompt_id-keyed entry', async () => {
    const stub = await startStubServer({
      'GET /history/:id': (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            'prompt-1': {
              outputs: { '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } },
              status: { completed: true, statusStr: 'success' },
            },
          }),
        );
      },
    });

    try {
      const client = createComfyUIClient({ baseUrl: stub.baseUrl });
      const entry = await client.getHistoryEntry('prompt-1');
      expect(entry?.outputs['9'].images?.[0].filename).to.equal('out.png');
    } finally {
      await stub.close();
    }
  });

  it('getHistoryEntry returns undefined for a prompt id not yet in history', async () => {
    const stub = await startStubServer({
      'GET /history/:id': (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      },
    });

    try {
      const client = createComfyUIClient({ baseUrl: stub.baseUrl });
      expect(await client.getHistoryEntry('unknown-prompt')).to.equal(undefined);
    } finally {
      await stub.close();
    }
  });

  it('viewImage returns the raw response bytes', async () => {
    const stub = await startStubServer({
      'GET /view': (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from('fake-image-bytes'));
      },
    });

    try {
      const client = createComfyUIClient({ baseUrl: stub.baseUrl });
      const bytes = await client.viewImage('out.png', 'rin-takahashi', 'output');
      expect(bytes.toString('utf-8')).to.equal('fake-image-bytes');
    } finally {
      await stub.close();
    }
  });
});
