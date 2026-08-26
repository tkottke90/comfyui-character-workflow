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

export type ImageSource =
  { kind: 'working'; phaseBindingKey: string } | { kind: 'finalized' } | { kind: 'casting' };

export interface GalleryTile {
  relativePath: string;
  filename: string;
  timestamp: string;
  source: ImageSource;
  /** Whether this is the newest working file for its phase binding — meaningless for finalized/casting tiles, always false there. */
  isCurrent: boolean;
}

export interface CharacterImagesService {
  storeWorkingFile(
    slug: string,
    phaseBindingKey: string,
    kind: 'image' | 'mask',
    dataUrl: string,
  ): WorkingFile;
  storeCastingCandidate(slug: string, seed: number, dataUrl: string): string;
  promoteToPhaseBinding(
    slug: string,
    sourceRelativePath: string,
    targetPhaseBindingKey: string,
  ): WorkingFile;
  listImages(slug: string): CharacterImageListing;
  /**
   * The newest working file for a phase binding + kind — "current" is derived, not stored,
   * so this single helper is the one place that definition lives (job submission and the
   * refinement/targeted-fix pages all need the same answer).
   */
  getCurrentWorkingFile(
    slug: string,
    phaseBindingKey: string,
    kind: 'image' | 'mask',
  ): WorkingFile | undefined;
  /**
   * Deletes a single working file. Idempotent — deleting an already-gone file is treated as
   * success, not an error, since the end state the caller wants is already true. Reports
   * whether the deleted file was the current one for its phase binding, computed before the
   * delete, so callers can warn about the consequence up front rather than after the fact.
   */
  deleteWorkingFile(
    slug: string,
    phaseBindingKey: string,
    filename: string,
  ): { deleted: boolean; wasCurrent: boolean };
  /**
   * Deletes a single casting candidate's image file by seed. Idempotent, matching
   * deleteWorkingFile — a seed with no file on disk (never generated, or already
   * deleted) is not an error. There is no "current" concept for casting candidates,
   * so the return shape is simpler than deleteWorkingFile's.
   */
  deleteCastingCandidate(slug: string, seed: number): { deleted: boolean };
  /**
   * Every image belonging to a character — working files (image kind only; masks stay
   * inline in the mask editor, not standalone gallery tiles), finalized picks, and casting
   * candidates — as one flat, newest-first list for the Images gallery and the
   * choose-from-library pickers.
   */
  listGalleryTiles(slug: string): GalleryTile[];
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
const WORKING_FILENAME_PATTERN = /^(\d{14})-(image|mask)(?:-\d+)?\.[^.]+$/;
const CASTING_FILENAME_PATTERN = /^seed-.+\.[^.]+$/;

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

function timestamp(): string {
  return formatTimestamp(new Date());
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
        const match = WORKING_FILENAME_PATTERN.exec(filename);
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

  function computeCastingCandidates(slug: string): FinalizedImage[] {
    const dirPath = path.join(characterDir(slug), CASTING_BATCH_DIR_NAME);
    if (!fs.existsSync(dirPath)) return [];
    return fs
      .readdirSync(dirPath)
      .filter((filename) => CASTING_FILENAME_PATTERN.test(filename))
      .map((filename) => ({ filename, relativePath: path.join(CASTING_BATCH_DIR_NAME, filename) }));
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

    getCurrentWorkingFile(slug, phaseBindingKey, kind) {
      return computeListing(slug).working.find(
        (file) => file.phaseBindingKey === phaseBindingKey && file.kind === kind,
      );
    },

    deleteWorkingFile(slug, phaseBindingKey, filename) {
      const key = sanitizeSegment(phaseBindingKey);
      const safeFilename = sanitizeSegment(filename);
      const match = WORKING_FILENAME_PATTERN.exec(safeFilename);
      if (!match) return { deleted: false, wasCurrent: false };
      const kind = match[2] as 'image' | 'mask';

      const targetPath = resolveWithinCharacterDir(slug, path.join(key, safeFilename));
      if (!fs.existsSync(targetPath)) return { deleted: false, wasCurrent: false };

      const current = computeListing(slug).working.find(
        (file) => file.phaseBindingKey === key && file.kind === kind,
      );
      const wasCurrent = current?.filename === safeFilename;

      fs.unlinkSync(targetPath);
      return { deleted: true, wasCurrent };
    },

    deleteCastingCandidate(slug, seed) {
      const prefix = `seed-${sanitizeSegment(String(seed))}.`;
      const match = computeCastingCandidates(slug).find((candidate) =>
        candidate.filename.startsWith(prefix),
      );
      if (!match) return { deleted: false };

      const targetPath = resolveWithinCharacterDir(slug, match.relativePath);
      if (!fs.existsSync(targetPath)) return { deleted: false };

      fs.unlinkSync(targetPath);
      return { deleted: true };
    },

    listGalleryTiles(slug) {
      const root = characterDir(slug);
      const { finalized, working } = computeListing(slug);

      const currentImageFilenameByPhase = new Map<string, string>();
      for (const file of working) {
        if (file.kind !== 'image') continue;
        if (!currentImageFilenameByPhase.has(file.phaseBindingKey)) {
          currentImageFilenameByPhase.set(file.phaseBindingKey, file.filename);
        }
      }

      const workingTiles: GalleryTile[] = working
        .filter((file) => file.kind === 'image')
        .map((file) => ({
          relativePath: file.relativePath,
          filename: file.filename,
          timestamp: file.timestamp,
          source: { kind: 'working', phaseBindingKey: file.phaseBindingKey },
          isCurrent: currentImageFilenameByPhase.get(file.phaseBindingKey) === file.filename,
        }));

      // finalizedImages/ and casting_batch/ files carry no timestamp of their own — mtime is
      // an honest, real ordering signal to interleave them with working files' timestamps,
      // rather than inventing one.
      const mtimeTimestamp = (relativePath: string): string =>
        formatTimestamp(fs.statSync(path.join(root, relativePath)).mtime);

      const finalizedTiles: GalleryTile[] = finalized.map((file) => ({
        relativePath: file.relativePath,
        filename: file.filename,
        timestamp: mtimeTimestamp(file.relativePath),
        source: { kind: 'finalized' },
        isCurrent: false,
      }));

      const castingTiles: GalleryTile[] = computeCastingCandidates(slug).map((file) => ({
        relativePath: file.relativePath,
        filename: file.filename,
        timestamp: mtimeTimestamp(file.relativePath),
        source: { kind: 'casting' },
        isCurrent: false,
      }));

      return [...workingTiles, ...finalizedTiles, ...castingTiles].sort((a, b) =>
        a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
      );
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
