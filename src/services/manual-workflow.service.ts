import { RegistryBaseSchema, JsonRegistry } from "@/lib/json-crud";
import z from "zod";
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { NotFoundError } from "@/errors/http.errors";
import { readFileWithSchema, writeJsonFile } from "@/lib/files";
import { Logger } from "@tkottke90/logger";
import { DefaultDateSchema } from "@/lib/validation";

export const ImageSchema = z.object({
  id: z.string(),
  filename: z.string(),
  size: z.object({ width: z.number(), height: z.number() }),
  parent: z.string().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
  final: z.boolean().default(false),
  nsfw: z.boolean().default(false)
});

const SessionNoteSchema = z.object({
  content: z.string(),

  createdAt: DefaultDateSchema,
  updatedAt: DefaultDateSchema
})

export const ManualFieldMappingSchema = z.object({
  nodeId: z.string(),
  inputName: z.string(),
  classType: z.string()
});
export type ManualFieldMapping = z.infer<typeof ManualFieldMappingSchema>;

export const ManualFieldSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  key: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Key must be alphanumeric/underscore only'),
  type: z.enum(['text', 'number', 'boolean', 'image', 'multiline']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  mappings: z.array(ManualFieldMappingSchema).default([]),
  createdAt: DefaultDateSchema,
  updatedAt: DefaultDateSchema
});

export const ManualGenerationSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  status: z.enum(['queued', 'running', 'done', 'error']),
  fieldValuesSnapshot: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  // Defaulted, not strictly required — every new write always sets it explicitly, but a
  // generation persisted before this field existed has no value to recover, and it must
  // still parse rather than 500 the whole session on load.
  seed: z.number().default(0),
  imageId: z.string().optional(),
  error: z.string().optional(),
  batchId: z.string().optional(),
  createdAt: DefaultDateSchema,
  completedAt: z.coerce.date().optional()
});

const ManualWorkflowSessionSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  workflowName: z.string(),
  description: z.string().default(''),
  workflowDir: z.string(),
  workflowFile: z.string().optional(),
  workflowSource: z.enum(['upload', 'select']).optional(),
  resultOutput: z.object({ nodeId: z.string(), outputIndex: z.number() }).nullable().default(null),
  seedMappings: z.array(ManualFieldMappingSchema).default([]),

  images: z.array(ImageSchema).default([]),
  sessionNotes: z.array(SessionNoteSchema).default([]),
  fields: z.array(ManualFieldSchema).default([]),
  generations: z.array(ManualGenerationSchema).default([]),

  createdAt: DefaultDateSchema,
  updatedAt: DefaultDateSchema
})

export const UploadSessionSchema = ManualWorkflowSessionSchema.pick({
  workflowName: true,
  description: true,
  workflowFile: true,
  workflowSource: true,
  resultOutput: true,
  seedMappings: true,
  images: true,
  sessionNotes: true,
  fields: true,
  generations: true
})

const ManualWorkflowSchema = RegistryBaseSchema.extend({
  sessions: z.record(z.string(), z.string()).default({})
})

export type ManualWorkflowSession = z.infer<typeof ManualWorkflowSessionSchema>;
export type ManualWorkflowUpdateSession = z.infer<typeof UploadSessionSchema>;
export type ManualWorkflowConfig = z.infer<typeof ManualWorkflowSchema>;
export type ManualField = z.infer<typeof ManualFieldSchema>;
export type ManualGeneration = z.infer<typeof ManualGenerationSchema>;
export type ManualImage = z.infer<typeof ImageSchema>;

export class ManualWorkflowRegistry extends JsonRegistry<z.infer<typeof ManualWorkflowSchema>> {
  static readonly SCHEMA = ManualWorkflowSchema;

  sessions: Map<string, string>;
  logger?: Logger

  // Serializes updateSession() calls per session id — concurrent completions/submissions
  // for the same session doing read-modify-write against the same on-disk file otherwise
  // risk one write silently losing another's change. Different sessions stay fully
  // concurrent; only calls for the same id ever queue behind one another.
  private updateLocks = new Map<string, Promise<unknown>>();

  constructor (
      schema: ManualWorkflowConfig,
      protected filePath: string,
      protected mapper: z.ZodObject
  ) {
    super(schema, filePath, mapper);

    this.sessions = new Map(Object.entries(schema.sessions));
  }

  /**
   * Creates a new manual workflow session
   * @param name Name of the session
   */
  async addSession(name: string) {
    const baseDir = path.resolve(
      path.dirname(this.filePath),
      z.string().slugify().parse(name)
    )

    // Create the new session record
    const newSession = ManualSession.fromPath(
      path.resolve(baseDir, 'metadata.json'),
      ManualWorkflowSessionSchema.parse({
        workflowName: name,
        workflowDir: baseDir
      })
    )


    // Create the session directories
    await mkdir(
      path.resolve(baseDir,'assets'),
      { recursive: true }
    )

    // Save the session id in the registry, as a path relative to the registry file
    const sessionFilePath = path.resolve(newSession.workflowDir, 'metadata.json');
    this.sessions.set(newSession.id, sessionFilePath);
    await this.save();

    // Return the session to the caller
    return newSession;
  }

  /**
   * Deletes a session 
   * @param path 
   */
  async deleteSession(id: string) {
    const sessionPath = this.checkForSession(id);

    await rm(path.dirname(sessionPath), { recursive: true, force: true })

    this.sessions.delete(id);
    await this.save();
  }

  /**
   * Loads a sessions metadata file
   * @param path The "metadata.json" file to load from disk
   */
  async getSession(id: string) {
    const sessionPath = this.checkForSession(id);
    const sessionDetails = await this.loadSession(sessionPath);

    return sessionDetails
  }

  /**
   * `session` may be a plain patch, or an updater `(current) => patch` — the latter is
   * required whenever the patch is derived from the session's own current state (e.g.
   * appending to `generations`/`images`), since with a plain patch two overlapping calls
   * would both compute their patch from the same stale snapshot and the loser's write
   * would silently drop the winner's addition even though the lock serializes the writes
   * themselves. The updater form runs with the freshly-loaded session, inside the lock.
   */
  async updateSession(
    id: string,
    session: Partial<ManualWorkflowUpdateSession> | ((current: ManualWorkflowSession) => Partial<ManualWorkflowUpdateSession>)
  ) {
    const previous = this.updateLocks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.updateSessionLocked(id, session));
    this.updateLocks.set(id, next.catch(() => {}));
    return next;
  }

  private async updateSessionLocked(
    id: string,
    session: Partial<ManualWorkflowUpdateSession> | ((current: ManualWorkflowSession) => Partial<ManualWorkflowUpdateSession>)
  ) {
    const sessionPath = this.checkForSession(id);
    const sessionDetails = await this.loadSession(sessionPath);
    const patch = typeof session === 'function' ? session(sessionDetails) : session;

    // Validates the updates are legal
    const updatedDetails = ManualWorkflowSessionSchema.parse({ ...sessionDetails, ...patch });

    // Writes the updates back to the file
    await writeJsonFile(sessionPath, updatedDetails)

    return updatedDetails;
  }

  /**
   * Deletes a single image from a session's gallery and removes its file from disk.
   * Idempotent: deleting an unknown imageId or an already-missing file is not an error.
   * @param id ID of the session
   * @param imageId ID of the image to delete
   */
  async deleteImage(id: string, imageId: string): Promise<{ deleted: boolean }> {
    const sessionPath = this.checkForSession(id);
    const session = await this.loadSession(sessionPath);
    const image = session.images.find((img) => img.id === imageId);

    if (!image) return { deleted: false };

    await rm(path.join(session.workflowDir, 'assets', image.filename), { force: true });

    const images = session.images.filter((img) => img.id !== imageId);
    await this.updateSession(id, { images });

    return { deleted: true };
  }

  /**
   * Sets (or clears) the nsfw flag on a single image in a session's gallery.
   * @param id ID of the session
   * @param imageId ID of the image to update
   * @param nsfw The new nsfw value
   * @throws {NotFoundError} when the image is not found
   */
  async setImageNsfw(id: string, imageId: string, nsfw: boolean): Promise<ManualImage> {
    const sessionPath = this.checkForSession(id);
    const session = await this.loadSession(sessionPath);
    const image = session.images.find((img) => img.id === imageId);

    if (!image) throw new NotFoundError(`No image found for id - ${imageId}`);

    const images = session.images.map((img) => (img.id === imageId ? { ...img, nsfw } : img));
    await this.updateSession(id, { images });

    return images.find((img) => img.id === imageId)!;
  }


  toJSON() {
    const data = this.mapper.parse({
      ...this,
      sessions: Object.fromEntries(this.sessions)
    })
    
    return data;
  }

  /**
   * Checks if a session exists and normalizes the error thrown when missing
   * @param id ID of the session
   * @throws {NotFoundError} 404 error when session is not found
   * @returns The on-disk path to the session metadata file
   */
  private checkForSession(id: string) {
    const sessionPath = this.sessions.get(id);
    
    if (!sessionPath) {
      throw new NotFoundError(`No Session found for id - ${id}`);
    }

    return sessionPath;
  }

  /**
   * Loads a session metadata file
   */
  private async loadSession(path: string) {

    const sessionExists = await stat(path).catch(() => undefined);
    
    if (!sessionExists) {
      const err = new NotFoundError(`No session files found for the workflow`);
      err.metadata.path = path;

      throw err;
    }

    return ManualSession.fromPath(path);
  }
}

class ManualSession extends JsonRegistry<ManualWorkflowSession> {
  static readonly SCHEMA = ManualWorkflowSessionSchema;

  readonly id: string;
  workflowName: string;
  description: string;
  workflowDir: string;
  workflowFile?: string;
  workflowSource?: ManualWorkflowSession['workflowSource'];
  resultOutput: ManualWorkflowSession['resultOutput'];
  seedMappings: ManualWorkflowSession['seedMappings'];

  images: ManualWorkflowSession['images'];
  sessionNotes: ManualWorkflowSession['sessionNotes'];
  fields: ManualWorkflowSession['fields'];
  generations: ManualWorkflowSession['generations'];

  constructor(
      schema: ManualWorkflowSession,
      protected filePath: string,
      protected mapper: z.ZodObject
  ) {
    super(schema, filePath, mapper);

    this.id = schema.id;
    this.workflowName = schema.workflowName;
    this.description = schema.description;
    this.workflowDir = schema.workflowDir;
    this.workflowFile = schema.workflowFile
    this.workflowSource = schema.workflowSource;
    this.resultOutput = schema.resultOutput;
    this.seedMappings = schema.seedMappings;
    this.images = schema.images;
    this.sessionNotes = schema.sessionNotes;
    this.fields = schema.fields;
    this.generations = schema.generations;
  }

  generateLinks(baseRoute: string) {
    return {
      self: `${baseRoute}/${this.id}`,
      images: `${baseRoute}/${this.id}/images`,
      view: `/manual/${this.id}`
    }
  }
}