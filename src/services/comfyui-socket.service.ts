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
  /**
   * Backoff base delay in ms between automatic reconnect attempts after an unexpected
   * disconnect — doubles each attempt, capped at MAX_RECONNECT_ATTEMPTS. Defaults to 1s
   * (so the schedule is 1s/2s/4s/8s/16s); tests override this to a tiny value so the
   * backoff schedule runs fast and deterministically instead of over real seconds.
   */
  reconnectBaseDelayMs?: number;
}

export interface ComfyUISocket {
  connect(): void;
  close(): void;
  isConnected(): boolean;
  onMessage(handler: (message: ComfyWsMessage) => void): void;
  onOpen(handler: () => void): void;
  onClose(handler: () => void): void;
  onError(handler: (err: unknown) => void): void;
  /** Fires once the automatic reconnect schedule gives up after MAX_RECONNECT_ATTEMPTS
   *  consecutive failures — the signal a "Check Connection" / "Reset connection" UI needs. */
  onReconnectExhausted(handler: () => void): void;
  getReconnectAttempts(): number;
  isExhausted(): boolean;
  /** Manual "Reset connection" — clears the exhausted state and reconnects immediately,
   *  as if this were the first connect() call. */
  reset(): void;
}

const MAX_RECONNECT_ATTEMPTS = 5;

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
 * out from, not a per-request connection. Automatically reconnects with capped backoff
 * on an unexpected disconnect (never on an intentional close()); once the schedule is
 * exhausted, it stops retrying on its own and waits for reset() (see /integration/connection).
 */
export function createComfyUISocket(config: ComfyUISocketConfig): ComfyUISocket {
  const emitter = new EventEmitter();
  let socket: WebSocket | null = null;
  let connected = false;
  let intentionalClose = false;
  let reconnectAttempts = 0;
  let exhausted = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const baseDelay = config.reconnectBaseDelayMs ?? 1000;

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (intentionalClose) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      exhausted = true;
      emitter.emit('reconnect-exhausted');
      return;
    }
    reconnectAttempts += 1;
    const delay = baseDelay * 2 ** (reconnectAttempts - 1);
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => openSocket(), delay);
  }

  function openSocket(): void {
    socket = new WebSocket(resolveWsUrl(config));

    // A connection refused outright fires only 'error' (never 'close'); a connection that
    // opened successfully and later drops fires only 'close' (no preceding 'error') — this
    // flag makes scheduling a reconnect idempotent per attempt regardless of which of the
    // two actually fires, rather than assuming either one specific event.
    let failureHandled = false;
    const handleFailure = () => {
      if (failureHandled) return;
      failureHandled = true;
      scheduleReconnect();
    };

    socket.addEventListener('open', () => {
      connected = true;
      reconnectAttempts = 0;
      exhausted = false;
      emitter.emit('open');
    });

    socket.addEventListener('close', () => {
      connected = false;
      emitter.emit('close');
      handleFailure();
    });

    socket.addEventListener('error', (event) => {
      // Deliberately NOT emitted as the EventEmitter's own 'error' event — Node treats
      // that name specially and throws (crashing the process) if nothing has called
      // onError() yet, which is exactly the case at boot before any caller has
      // subscribed. A distinct internal event name sidesteps that entirely.
      emitter.emit('socket-error', event);
      handleFailure();
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

  function connect(): void {
    intentionalClose = false;
    reconnectAttempts = 0;
    exhausted = false;
    clearReconnectTimer();
    openSocket();
  }

  function close(): void {
    intentionalClose = true;
    clearReconnectTimer();
    socket?.close();
    socket = null;
    connected = false;
  }

  function reset(): void {
    intentionalClose = false;
    reconnectAttempts = 0;
    exhausted = false;
    clearReconnectTimer();
    socket?.close();
    openSocket();
  }

  return {
    connect,
    close,
    reset,
    isConnected: () => connected,
    getReconnectAttempts: () => reconnectAttempts,
    isExhausted: () => exhausted,
    onMessage: (handler) => emitter.on('message', handler),
    onOpen: (handler) => emitter.on('open', handler),
    onClose: (handler) => emitter.on('close', handler),
    onError: (handler) => emitter.on('socket-error', handler),
    onReconnectExhausted: (handler) => emitter.on('reconnect-exhausted', handler),
  };
}
