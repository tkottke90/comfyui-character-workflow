const DATA_URL_PATTERN = /^data:([\w-]+\/[\w.+-]+);base64,(.*)$/s;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export interface ParsedDataUrl {
  mime: string;
  buffer: Buffer;
  extension: string;
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = DATA_URL_PATTERN.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Expected a base64-encoded data URL (data:<mime>;base64,<data>)');
  }

  const [, mime, base64] = match;
  const extension = MIME_EXTENSIONS[mime.toLowerCase()];
  if (!extension) {
    throw new Error(`Unsupported image type "${mime}" — use PNG, JPG, or WEBP`);
  }

  return { mime, buffer: Buffer.from(base64, 'base64'), extension };
}

const JSON_MIME_ALLOWLIST = new Set(['application/json', 'text/plain', 'application/octet-stream']);

/**
 * Decodes a base64 data URL produced by the same [data-file-upload] JS used for
 * image uploads, but for a JSON file (e.g. an imported ComfyUI workflow export).
 */
export function parseJsonDataUrl(dataUrl: string): unknown {
  const match = DATA_URL_PATTERN.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Expected a base64-encoded data URL (data:<mime>;base64,<data>)');
  }

  const [, mime, base64] = match;
  if (!JSON_MIME_ALLOWLIST.has(mime.toLowerCase())) {
    throw new Error(`Unsupported file type "${mime}" — expected a JSON file`);
  }

  const text = Buffer.from(base64, 'base64').toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
}
