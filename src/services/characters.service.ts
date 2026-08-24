import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { Character, CharacterRecord, CharacterSchema } from '../schemas/character.schema';
import { emptyChecklist } from '../checklist/definitions';
import {
  DEFAULT_NEGATIVE_PROMPT,
  deriveChecklist,
  deriveStatus,
  slugify,
} from '../lib/character-logic';
import { renderCharacterMarkdown } from '../lib/character-markdown';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export class CharacterConflictError extends Error {
  constructor(name: string) {
    super(`A character named "${name}" already exists`);
    this.name = 'CharacterConflictError';
  }
}

export interface CharactersService {
  list(): CharacterRecord[];
  get(slug: string): CharacterRecord | undefined;
  create(input: { name: string } & Partial<Character>): CharacterRecord;
  update(slug: string, patch: Partial<Character>): CharacterRecord | undefined;
  remove(slug: string): boolean;
}

export function createCharactersService(dir: string): CharactersService {
  fs.mkdirSync(dir, { recursive: true });

  function characterDir(slug: string): string {
    return path.join(dir, slug);
  }

  function filePath(slug: string): string {
    return path.join(characterDir(slug), `${slug}.md`);
  }

  function readSlug(slug: string): CharacterRecord | undefined {
    const file = filePath(slug);
    if (!fs.existsSync(file)) return undefined;

    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = matter(raw);
    const data = CharacterSchema.parse(parsed.data);
    return { slug, ...data };
  }

  function write(record: CharacterRecord): void {
    const { slug, ...data } = record;
    const body = renderCharacterMarkdown(record);
    const content = matter.stringify(body, data);
    fs.writeFileSync(filePath(slug), content, 'utf-8');
  }

  return {
    list() {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => readSlug(entry.name))
        .filter((record): record is CharacterRecord => record !== undefined)
        .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
    },

    get(slug) {
      return readSlug(slug);
    },

    create(input) {
      const slug = slugify(input.name);
      if (fs.existsSync(filePath(slug))) {
        throw new CharacterConflictError(input.name);
      }

      const now = todayIso();
      const data = CharacterSchema.parse({
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        checklist: emptyChecklist(),
        ...input,
        created: now,
        updated: now,
      });
      data.status = deriveStatus(deriveChecklist(data));

      const record: CharacterRecord = { slug, ...data };
      fs.mkdirSync(path.join(characterDir(slug), 'finalizedImages'), { recursive: true });
      write(record);
      return record;
    },

    update(slug, patch) {
      const existing = readSlug(slug);
      if (!existing) return undefined;

      const merged = CharacterSchema.parse({
        ...existing,
        ...patch,
        updated: todayIso(),
      });
      merged.status = deriveStatus(deriveChecklist(merged));

      const record: CharacterRecord = { slug, ...merged };
      write(record);
      return record;
    },

    remove(slug) {
      const dirToRemove = characterDir(slug);
      if (!fs.existsSync(dirToRemove)) return false;
      fs.rmSync(dirToRemove, { recursive: true, force: true });
      return true;
    },
  };
}
