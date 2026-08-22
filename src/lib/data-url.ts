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
