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

export function createComfyUIClient(config: ComfyUIClientConfig): ComfyUIClient {
  function resolveUrl(pathSegment: string): string {
    const trimmed = config.baseUrl.trim().replace(/\/+$/, '');
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
    return `${withProtocol}${pathSegment}`;
  }

  async function request<T>(pathSegment: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const response = await fetch(resolveUrl(pathSegment), { headers });
    if (!response.ok) {
      throw new Error(
        `ComfyUI request to ${pathSegment} failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as T;
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

  return { getSystemStats, getQueueStatus, getObjectInfo, testConnection };
}
