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

export const ManualFieldSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  key: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Key must be alphanumeric/underscore only'),
  type: z.enum(['text', 'number', 'boolean', 'image']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  createdAt: DefaultDateSchema,
  updatedAt: DefaultDateSchema
});

export const ManualGenerationSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  status: z.enum(['queued', 'running', 'done', 'error']),
  fieldValuesSnapshot: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  imageId: z.string().optional(),
  error: z.string().optional(),
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
  images: true,
  sessionNotes: true,
  fields: true
})

const ManualWorkflowSchema = RegistryBaseSchema.extend({
  sessions: z.record(z.string(), z.string()).default({})
})

export type ManualWorkflowSession = z.infer<typeof ManualWorkflowSessionSchema>;
export type ManualWorkflowUpdateSession = z.infer<typeof UploadSessionSchema>;
export type ManualWorkflowConfig = z.infer<typeof ManualWorkflowSchema>;
export type ManualField = z.infer<typeof ManualFieldSchema>;
export type ManualGeneration = z.infer<typeof ManualGenerationSchema>;

export class ManualWorkflowRegistry extends JsonRegistry<z.infer<typeof ManualWorkflowSchema>> {
  static readonly SCHEMA = ManualWorkflowSchema;

  sessions: Map<string, string>;
  logger?: Logger

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

  async updateSession(id: string, session: Partial<ManualWorkflowUpdateSession>) {
    const sessionPath = this.checkForSession(id);
    const sessionDetails = await this.loadSession(sessionPath);

    // Validates the updates are legal
    const updatedDetails = ManualWorkflowSessionSchema.parse({ ...sessionDetails, ...session });

    // Writes the updates back to the file
    await writeJsonFile(sessionPath, updatedDetails)

    return updatedDetails;
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