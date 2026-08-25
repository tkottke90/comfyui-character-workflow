import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { Style, StyleRecord, StyleSchema } from '../schemas/style.schema';
import { slugify } from '../lib/character-logic';

export class StyleConflictError extends Error {
  constructor(name: string) {
    super(`A style named "${name}" already exists`);
    this.name = 'StyleConflictError';
  }
}

export interface CreateStyleInput extends Partial<Style> {
  name: string;
}

export interface StylesService {
  list(): StyleRecord[];
  get(slug: string): StyleRecord | undefined;
  create(input: CreateStyleInput): StyleRecord;
  update(slug: string, patch: Partial<Style>): StyleRecord | undefined;
  remove(slug: string): boolean;
}

export function createStylesService(dir: string): StylesService {
  function filePath(slug: string): string {
    return path.join(dir, `${slug}.md`);
  }

  function readSlug(slug: string): StyleRecord | undefined {
    const file = filePath(slug);
    if (!fs.existsSync(file)) return undefined;

    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = matter(raw);
    const data = StyleSchema.parse(parsed.data);
    return { slug, ...data };
  }

  function write(record: StyleRecord): void {
    const { slug, ...data } = record;
    const content = matter.stringify(`# Style: ${record.name}\n\n${record.description}\n`, data);
    fs.writeFileSync(filePath(slug), content, 'utf-8');
  }

  return {
    list() {
      return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => readSlug(file.slice(0, -3)))
        .filter((record): record is StyleRecord => record !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    get(slug) {
      return readSlug(slug);
    },

    create(input) {
      const slug = slugify(input.name);
      if (fs.existsSync(filePath(slug))) {
        throw new StyleConflictError(input.name);
      }

      const data = StyleSchema.parse({
        ...input,
        createdAt: new Date().toISOString().slice(0, 10),
      });

      const record: StyleRecord = { slug, ...data };
      write(record);
      return record;
    },

    update(slug, patch) {
      const existing = readSlug(slug);
      if (!existing) return undefined;

      const merged = StyleSchema.parse({ ...existing, ...patch });
      const record: StyleRecord = { slug, ...merged };
      write(record);
      return record;
    },

    remove(slug) {
      const existing = readSlug(slug);
      if (!existing) return false;

      fs.unlinkSync(filePath(slug));
      return true;
    },
  };
}
