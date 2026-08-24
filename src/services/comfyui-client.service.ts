import type { NodeMapping } from '../schemas/workflow-mapping.schema';

export interface ComfyUIClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface SystemStats {
  comfyuiVersion: string;
  gpuName?: string;
  vramTotal?: number;
  vramFree?: number;
  vramUsedPct?: number;
}

export interface QueueStatus {
  running: number;
  pending: number;
}

export interface ObjectInfoEntry {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
}
export type ObjectInfo = Record<string, ObjectInfoEntry>;

export interface TestConnectionResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface ComfyUIClient {
  getSystemStats(): Promise<SystemStats>;
  getQueueStatus(): Promise<QueueStatus>;
  getObjectInfo(classType?: string): Promise<ObjectInfo>;
  testConnection(): Promise<TestConnectionResult>;
  freeMemory(): Promise<void>;
}

/**
 * Returns the list of choices ComfyUI's /object_info reports for a given
 * node class type + input name (e.g. LoraLoaderModelOnly.lora_name), or an
 * empty array if that node/input isn't a choice-list input.
 */
export function getObjectInfoChoices(
  objectInfo: ObjectInfo,
  classType: string,
  inputName: string,
): string[] {
  const entry = objectInfo[classType];
  const required = entry?.input?.required?.[inputName];
  const optional = entry?.input?.optional?.[inputName];
  const raw = required ?? optional;

  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return (raw[0] as unknown[]).map((value) => String(value));
  }

  return [];
}

/**
 * Whether a given node class type + input name is flagged `image_upload: true` in
 * ComfyUI's /object_info — the purpose-built signal ComfyUI itself uses to mark an
 * input as wanting an uploaded file (e.g. LoadImage.image), as opposed to any other
 * plain choice-list or scalar widget input. Used to restrict which node inputs the
 * mapping editor offers the Current Image/Current Mask domain fields for.
 */
export function isImageUploadInput(
  objectInfo: ObjectInfo,
  classType: string,
  inputName: string,
): boolean {
  const entry = objectInfo[classType];
  const required = entry?.input?.required?.[inputName];
  const optional = entry?.input?.optional?.[inputName];
  const raw = required ?? optional;

  if (!Array.isArray(raw)) return false;
  const config = raw[1];
  return Boolean(
    config && typeof config === 'object' && (config as Record<string, unknown>).image_upload === true,
  );
}

/**
 * Re-checks every 'static' mapping against a live /object_info snapshot, flagging
 * anything that no longer resolves (e.g. a LoRA that's been renamed or removed
 * from the server) as 'missing' instead of 'verified'. Inputs with no choice-list
 * (e.g. a plain float like denoise) have nothing to check against, so they're
 * left 'mapped'/'verified' as-is — there's no way to further verify a scalar. Runs
 * after every import (fresh or re-import) since new static defaults come straight
 * from the exported file and haven't been checked against this server yet.
 */
export function verifyStaticMappings(nodes: NodeMapping[], objectInfo: ObjectInfo): NodeMapping[] {
  return nodes.map((node) => {
    if (node.sourceType !== 'static' || !node.sourceValue) return node;

    const choices = getObjectInfoChoices(objectInfo, node.classType, node.inputName);
    if (choices.length === 0) return { ...node, status: 'verified' };

    return { ...node, status: choices.includes(node.sourceValue) ? 'verified' : 'missing' };
  });
}

export function createComfyUIClient(config: ComfyUIClientConfig): ComfyUIClient {
  function resolveUrl(pathSegment: string): string {
    const trimmed = config.baseUrl.trim().replace(/\/+$/, '');
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
    return `${withProtocol}${pathSegment}`;
  }

  async function request<T>(
    pathSegment: string,
    options?: { method?: string; body?: unknown },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    let body: string | undefined;
    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(resolveUrl(pathSegment), { method: options?.method, headers, body });
    if (!response.ok) {
      throw new Error(
        `ComfyUI request to ${pathSegment} failed: ${response.status} ${response.statusText}`,
      );
    }

    // Action endpoints like /free can return an empty body on success.
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async function getSystemStats(): Promise<SystemStats> {
    const raw = await request<{
      system?: { comfyui_version?: string };
      devices?: Array<{ name?: string; vram_total?: number; vram_free?: number }>;
    }>('/system_stats');

    const device = raw.devices?.[0];
    const vramTotal = device?.vram_total;
    const vramFree = device?.vram_free;
    const vramUsedPct =
      typeof vramTotal === 'number' && typeof vramFree === 'number' && vramTotal > 0
        ? Math.round(((vramTotal - vramFree) / vramTotal) * 100)
        : undefined;

    return {
      comfyuiVersion: raw.system?.comfyui_version ?? 'unknown',
      gpuName: device?.name,
      vramTotal,
      vramFree,
      vramUsedPct,
    };
  }

  async function getQueueStatus(): Promise<QueueStatus> {
    const raw = await request<{ queue_running?: unknown[]; queue_pending?: unknown[] }>('/queue');
    return {
      running: raw.queue_running?.length ?? 0,
      pending: raw.queue_pending?.length ?? 0,
    };
  }

  async function getObjectInfo(classType?: string): Promise<ObjectInfo> {
    return request<ObjectInfo>(
      classType ? `/object_info/${encodeURIComponent(classType)}` : '/object_info',
    );
  }

  async function testConnection(): Promise<TestConnectionResult> {
    try {
      const stats = await getSystemStats();
      return { ok: true, version: stats.comfyuiVersion };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async function freeMemory(): Promise<void> {
    await request('/free', { method: 'POST', body: { unload_models: true, free_memory: true } });
  }

  return { getSystemStats, getQueueStatus, getObjectInfo, testConnection, freeMemory };
}
