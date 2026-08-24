import { EventEmitter } from 'node:events';

/**
 * ComfyUI's confirmed /ws message types (see design/docs/2026-08-24-1521-workflow-image-mask-execution-design.md §9a):
 * execution_start, executing ({node: null} = the authoritative "prompt fully finished"
 * signal — more reliable than executed, which can fire once per output node), progress
 * ({value, max, node, prompt_id} — step-level, e.g. mid-KSampler), executed
 * ({node, output, prompt_id} — an output node produced something), execution_cached
 * (informational only), execution_error ({prompt_id, node_id, exception_message, ...}).
 */
export interface ComfyWsMessage {
  type: string;
  data: Record<string, unknown>;
}

export interface ComfyUISocketConfig {
  baseUrl: string;
  apiKey?: string;
  clientId: string;
}

export interface ComfyUISocket {
  connect(): void;
  close(): void;
  isConnected(): boolean;
  onMessage(handler: (message: ComfyWsMessage) => void): void;
  onOpen(handler: () => void): void;
  onClose(handler: () => void): void;
  onError(handler: (err: unknown) => void): void;
}

function resolveWsUrl(config: ComfyUISocketConfig): string {
  const trimmed = config.baseUrl.trim().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  const wsBase = withProtocol.replace(/^http/, 'ws');

  const params = new URLSearchParams({ clientId: config.clientId });
  if (config.apiKey) params.set('token', config.apiKey);

  return `${wsBase}/ws?${params.toString()}`;
}

/**
 * One persistent connection to ComfyUI's /ws, scoped by client_id — this is the single
 * server-side socket every in-flight run's progress/completion/error events are fanned
 * out from, not a per-request connection. Reconnect/backoff is layered on separately
 * (createReconnectingComfyUISocket) so this stays a plain, testable connect/emit wrapper.
 */
export function createComfyUISocket(config: ComfyUISocketConfig): ComfyUISocket {
  const emitter = new EventEmitter();
  let socket: WebSocket | null = null;
  let connected = false;

  function connect(): void {
    socket = new WebSocket(resolveWsUrl(config));

    socket.addEventListener('open', () => {
      connected = true;
      emitter.emit('open');
    });

    socket.addEventListener('close', () => {
      connected = false;
      emitter.emit('close');
    });

    socket.addEventListener('error', (event) => {
      // Deliberately NOT emitted as the EventEmitter's own 'error' event — Node treats
      // that name specially and throws (crashing the process) if nothing has called
      // onError() yet, which is exactly the case at boot before any caller has
      // subscribed. A distinct internal event name sidesteps that entirely.
      emitter.emit('socket-error', event);
    });

    socket.addEventListener('message', (event) => {
      // Binary frames carry preview images mid-sampling — not part of the confirmed
      // message set this app acts on, so they're ignored rather than mis-parsed as JSON.
      if (typeof event.data !== 'string') return;

      let parsed: ComfyWsMessage;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      emitter.emit('message', parsed);
    });
  }

  function close(): void {
    socket?.close();
    socket = null;
    connected = false;
  }

  return {
    connect,
    close,
    isConnected: () => connected,
    onMessage: (handler) => emitter.on('message', handler),
    onOpen: (handler) => emitter.on('open', handler),
    onClose: (handler) => emitter.on('close', handler),
    onError: (handler) => emitter.on('socket-error', handler),
  };
}
