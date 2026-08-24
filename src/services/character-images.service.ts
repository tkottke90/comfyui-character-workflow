import fs from 'node:fs';
import path from 'node:path';
import { parseDataUrl } from '../lib/data-url';
import { sanitizeSegment } from '../lib/path-sanitize';

const FINALIZED_DIR_NAME = 'finalizedImages';
const CASTING_BATCH_DIR_NAME = 'casting_batch';

export interface WorkingFile {
  phaseBindingKey: string;
  kind: 'image' | 'mask';
  filename: string;
  /** Path relative to this character's directory — the identifier passed back into finalize(). */
  relativePath: string;
  timestamp: string;
}

export interface FinalizedImage {
  filename: string;
  relativePath: string;
}

export interface CharacterImageListing {
  finalized: FinalizedImage[];
  /** Every non-finalized working file across every phase binding, newest first. */
  working: WorkingFile[];
}

export interface FinalizeResult {
  finalized: string[];
  deleted: string[];
}

export interface CharacterImagesService {
  storeWorkingFile(
    slug: string,
    phaseBindingKey: string,
    kind: 'image' | 'mask',
    dataUrl: string,
  ): WorkingFile;
  storeCastingCandidate(slug: string, seed: number, dataUrl: string): string;
  promoteToPhaseBinding(slug: string, sourceRelativePath: string, targetPhaseBindingKey: string): WorkingFile;
  listImages(slug: string): CharacterImageListing;
  /**
   * Finalization is a picker screen, not an inferred rule: the caller (a human reviewing
   * every working file) supplies exactly the relative paths that fed the external LoRA
   * training run. Those are copied into finalizedImages/, sequentially numbered; every
   * other working file across every phase binding is deleted — the low-res/incomplete/
   * superseded "sawdust" left over from getting there.
   */
  finalize(slug: string, selectedRelativePaths: string[]): FinalizeResult;
  /**
   * Resolves a relative path (as returned by listImages()) to an absolute filesystem path
   * for serving — throws if it would resolve outside the character's directory. Callers
   * (route handlers) are responsible for checking the file actually exists before serving it.
   */
  resolvePath(slug: string, relativePath: string): string;
}

const TIMESTAMP_DIR_SKIP = new Set([FINALIZED_DIR_NAME]);

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

export function createCharacterImagesService(dir: string): CharacterImagesService {
  function characterDir(slug: string): string {
    return path.join(dir, sanitizeSegment(slug));
  }

  function phaseBindingDir(slug: string, phaseBindingKey: string): string {
    return path.join(characterDir(slug), sanitizeSegment(phaseBindingKey));
  }

  function finalizedDir(slug: string): string {
    return path.join(characterDir(slug), FINALIZED_DIR_NAME);
  }

  /**
   * Resolves a caller-supplied relative path (e.g. from finalize()'s selected paths, which
   * ultimately originate from a form post) against this character's directory, refusing to
   * resolve outside of it — the relativePath values listImages() hands out are always safe,
   * but nothing stops a caller from passing something else back in.
   */
  function resolveWithinCharacterDir(slug: string, relativePath: string): string {
    const root = characterDir(slug);
    const resolved = path.join(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`"${relativePath}" resolves outside of character "${slug}"'s directory`);
    }
    return resolved;
  }

  /**
   * Timestamps are second-resolution, so two stores landing in the same second need a
   * disambiguator to avoid one silently overwriting the other — working files are never
   * meant to overwrite in place (that's a ComfyUI-upload-side concern, not local storage).
   */
  function uniqueFilename(dirPath: string, ts: string, kind: string, extension: string): string {
    let candidate = `${ts}-${kind}.${extension}`;
    let counter = 2;
    while (fs.existsSync(path.join(dirPath, candidate))) {
      candidate = `${ts}-${kind}-${counter}.${extension}`;
      counter += 1;
    }
    return candidate;
  }

  function computeListing(slug: string): CharacterImageListing {
    const root = characterDir(slug);
    if (!fs.existsSync(root)) return { finalized: [], working: [] };

    const finalized: FinalizedImage[] = fs.existsSync(finalizedDir(slug))
      ? fs
          .readdirSync(finalizedDir(slug))
          .filter((filename) => !filename.startsWith('.'))
          .map((filename) => ({
            filename,
            relativePath: path.join(FINALIZED_DIR_NAME, filename),
          }))
      : [];

    const working: WorkingFile[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || TIMESTAMP_DIR_SKIP.has(entry.name)) continue;

      const phaseBindingKey = entry.name;
      const phaseDir = path.join(root, phaseBindingKey);
      for (const filename of fs.readdirSync(phaseDir)) {
        const match = /^(\d{14})-(image|mask)(?:-\d+)?\.[^.]+$/.exec(filename);
        if (!match) continue;

        working.push({
          phaseBindingKey,
          kind: match[2] as 'image' | 'mask',
          filename,
          relativePath: path.join(phaseBindingKey, filename),
          timestamp: match[1],
        });
      }
    }

    working.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

    return { finalized, working };
  }

  return {
    storeWorkingFile(slug, phaseBindingKey, kind, dataUrl) {
      const key = sanitizeSegment(phaseBindingKey);
      const ts = timestamp();
      const dirPath = phaseBindingDir(slug, key);
      fs.mkdirSync(dirPath, { recursive: true });

      const { buffer, extension } = parseDataUrl(dataUrl);
      const filename = uniqueFilename(dirPath, ts, kind, extension);
      fs.writeFileSync(path.join(dirPath, filename), buffer);

      return {
        phaseBindingKey: key,
        kind,
        filename,
        relativePath: path.join(key, filename),
        timestamp: ts,
      };
    },

    storeCastingCandidate(slug, seed, dataUrl) {
      const dirPath = path.join(characterDir(slug), CASTING_BATCH_DIR_NAME);
      fs.mkdirSync(dirPath, { recursive: true });

      const { buffer, extension } = parseDataUrl(dataUrl);
      const filename = `seed-${sanitizeSegment(String(seed))}.${extension}`;
      fs.writeFileSync(path.join(dirPath, filename), buffer);

      return path.join(CASTING_BATCH_DIR_NAME, filename);
    },

    promoteToPhaseBinding(slug, sourceRelativePath, targetPhaseBindingKey) {
      const sourcePath = resolveWithinCharacterDir(slug, sourceRelativePath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`No file at "${sourceRelativePath}" for character "${slug}"`);
      }

      const key = sanitizeSegment(targetPhaseBindingKey);
      const ts = timestamp();
      const extension = path.extname(sourcePath).replace(/^\./, '');
      const dirPath = phaseBindingDir(slug, key);
      fs.mkdirSync(dirPath, { recursive: true });

      const filename = uniqueFilename(dirPath, ts, 'image', extension);
      const targetPath = path.join(dirPath, filename);
      fs.copyFileSync(sourcePath, targetPath);

      return {
        phaseBindingKey: key,
        kind: 'image',
        filename,
        relativePath: path.join(key, filename),
        timestamp: ts,
      };
    },

    listImages(slug) {
      return computeListing(slug);
    },

    finalize(slug, selectedRelativePaths) {
      const root = characterDir(slug);
      const safetensorsPath = path.join(root, `${sanitizeSegment(slug)}.safetensors`);
      if (!fs.existsSync(safetensorsPath)) {
        throw new Error(
          `Cannot finalize "${slug}" — no ${sanitizeSegment(slug)}.safetensors found`,
        );
      }

      fs.mkdirSync(finalizedDir(slug), { recursive: true });
      const existingFinalizedCount = fs.readdirSync(finalizedDir(slug)).length;

      const finalized: string[] = [];
      selectedRelativePaths.forEach((relativePath, index) => {
        const sourcePath = resolveWithinCharacterDir(slug, relativePath);
        if (!fs.existsSync(sourcePath)) return;

        const extension = path.extname(sourcePath).replace(/^\./, '');
        const filename = `img-${String(existingFinalizedCount + index + 1).padStart(3, '0')}.${extension}`;
        fs.copyFileSync(sourcePath, path.join(finalizedDir(slug), filename));
        finalized.push(filename);
      });

      const selected = new Set(selectedRelativePaths.map((p) => path.normalize(p)));
      const deleted: string[] = [];
      const { working } = computeListing(slug);
      for (const file of working) {
        if (selected.has(path.normalize(file.relativePath))) continue;
        fs.unlinkSync(path.join(root, file.relativePath));
        deleted.push(file.relativePath);
      }

      return { finalized, deleted };
    },

    resolvePath(slug, relativePath) {
      return resolveWithinCharacterDir(slug, relativePath);
    },
  };
}
