import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { Template, TemplateRecord, TemplateSchema } from '../schemas/template.schema';
import { slugify } from '../lib/character-logic';
import { parseDataUrl } from '../lib/data-url';

export class TemplateConflictError extends Error {
  constructor(name: string) {
    super(`A template named "${name}" already exists`);
    this.name = 'TemplateConflictError';
  }
}

export interface CreateTemplateInput extends Partial<Template> {
  name: string;
  imageDataUrl?: string;
}

export interface TemplatesService {
  list(): TemplateRecord[];
  get(slug: string): TemplateRecord | undefined;
  create(input: CreateTemplateInput): TemplateRecord;
  replaceImage(slug: string, imageDataUrl: string): TemplateRecord | undefined;
  update(slug: string, patch: Partial<Template>): TemplateRecord | undefined;
  remove(slug: string): boolean;
  uploadsDir: string;
}

export function createTemplatesService(dir: string): TemplatesService {
  const uploadsDir = path.join(dir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  function filePath(slug: string): string {
    return path.join(dir, `${slug}.md`);
  }

  function readSlug(slug: string): TemplateRecord | undefined {
    const file = filePath(slug);
    if (!fs.existsSync(file)) return undefined;

    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = matter(raw);
    const data = TemplateSchema.parse(parsed.data);
    return { slug, ...data };
  }

  function write(record: TemplateRecord): void {
    const { slug, ...data } = record;
    const content = matter.stringify(`# Template: ${record.name}\n\n${record.notes}\n`, data);
    fs.writeFileSync(filePath(slug), content, 'utf-8');
  }

  function storeImage(slug: string, imageDataUrl: string): string {
    const { buffer, extension } = parseDataUrl(imageDataUrl);
    const filename = `${slug}.${extension}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    return filename;
  }

  return {
    uploadsDir,

    list() {
      return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => readSlug(file.slice(0, -3)))
        .filter((record): record is TemplateRecord => record !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    get(slug) {
      return readSlug(slug);
    },

    create(input) {
      const slug = slugify(input.name);
      if (fs.existsSync(filePath(slug))) {
        throw new TemplateConflictError(input.name);
      }

      const { imageDataUrl, ...rest } = input;
      const filename = imageDataUrl ? storeImage(slug, imageDataUrl) : '';

      const data = TemplateSchema.parse({
        ...rest,
        filename,
        createdAt: new Date().toISOString().slice(0, 10),
      });

      const record: TemplateRecord = { slug, ...data };
      write(record);
      return record;
    },

    replaceImage(slug, imageDataUrl) {
      const existing = readSlug(slug);
      if (!existing) return undefined;

      const filename = storeImage(slug, imageDataUrl);
      const record: TemplateRecord = { ...existing, filename };
      write(record);
      return record;
    },

    update(slug, patch) {
      const existing = readSlug(slug);
      if (!existing) return undefined;

      const merged = TemplateSchema.parse({ ...existing, ...patch });
      const record: TemplateRecord = { slug, ...merged };
      write(record);
      return record;
    },

    remove(slug) {
      const existing = readSlug(slug);
      if (!existing) return false;

      if (existing.filename) {
        const imagePath = path.join(uploadsDir, existing.filename);
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }
      fs.unlinkSync(filePath(slug));
      return true;
    },
  };
}
