import { expect } from 'chai';
import { WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import { createComfyUISocket } from '../src/services/comfyui-socket.service';

async function startStubWsServer(): Promise<{
  port: number;
  wss: WebSocketServer;
  send: (payload: unknown) => void;
  connections: URL[];
}> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const port = (wss.address() as AddressInfo).port;

  const connections: URL[] = [];
  const clients: Array<import('ws').WebSocket> = [];
  wss.on('connection', (socket, request) => {
    clients.push(socket);
    connections.push(new URL(request.url ?? '', 'http://localhost'));
  });

  return {
    port,
    wss,
    connections,
    send: (payload) => {
      const message = JSON.stringify(payload);
      clients.forEach((client) => client.send(message));
    },
  };
}

function waitFor<T>(register: (resolve: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve) => register(resolve));
}

describe('comfyui-socket.service', () => {
  it('connects to /ws with the configured client id as a query param', async () => {
    const stub = await startStubWsServer();
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${stub.port}`, clientId: 'client-42' });

    try {
      const opened = waitFor<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      expect(socket.isConnected()).to.equal(true);
      expect(stub.connections).to.have.length(1);
      expect(stub.connections[0].pathname).to.equal('/ws');
      expect(stub.connections[0].searchParams.get('clientId')).to.equal('client-42');
    } finally {
      socket.close();
      await new Promise<void>((resolve) => stub.wss.close(() => resolve()));
    }
  });

  it('parses and emits incoming JSON messages', async () => {
    const stub = await startStubWsServer();
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${stub.port}`, clientId: 'client-1' });

    try {
      const opened = waitFor<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;

      const messagePromise = waitFor<{ type: string; data: Record<string, unknown> }>((resolve) =>
        socket.onMessage((message) => resolve(message)),
      );
      stub.send({ type: 'progress', data: { value: 12, max: 28, prompt_id: 'p1' } });

      const message = await messagePromise;
      expect(message.type).to.equal('progress');
      expect(message.data.value).to.equal(12);
    } finally {
      socket.close();
      await new Promise<void>((resolve) => stub.wss.close(() => resolve()));
    }
  });

  it('reports disconnected after close()', async () => {
    const stub = await startStubWsServer();
    const socket = createComfyUISocket({ baseUrl: `http://127.0.0.1:${stub.port}`, clientId: 'client-1' });

    try {
      const opened = waitFor<void>((resolve) => socket.onOpen(() => resolve()));
      socket.connect();
      await opened;
      expect(socket.isConnected()).to.equal(true);

      socket.close();
      expect(socket.isConnected()).to.equal(false);
    } finally {
      await new Promise<void>((resolve) => stub.wss.close(() => resolve()));
    }
  });
});
