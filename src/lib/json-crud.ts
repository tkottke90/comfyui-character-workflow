import z from 'zod';
import * as fileUtils from './files';
import { writeFile } from 'node:fs/promises';


export const RegistryBaseSchema = z.object({
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date())
})

export type BaseSchema = z.infer<typeof RegistryBaseSchema>;

export class JsonRegistry<RegistrySchema extends BaseSchema> {
  static readonly SCHEMA: z.ZodObject = RegistryBaseSchema;
  createdAt: Date;
  updatedAt: Date;

  constructor(
    schema: RegistrySchema,
    protected filePath: string,
    protected mapper: z.ZodObject
  ) {
    this.createdAt = schema.createdAt;
    this.updatedAt = schema.updatedAt;
  }

  async save() {
    await writeFile(
      this.filePath,
      JSON.stringify(this.toJSON(), null, 2),
      'utf-8'
    )
  }

  toJSON() {
    return this.mapper.parse(this)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed for subclass constructors to satisfy this constraint; `unknown` fails contravariant here
  static fromPath<T extends { new (...args: any[]): JsonRegistry<any>; SCHEMA: z.ZodObject }>(
    this: T,
    path: string,
    defaultValue: Record<string, unknown> = {}
  ): InstanceType<T> {
    const raw = JSON.parse(
      fileUtils.getFileSafeSync(
        path,
        () => JSON.stringify(this.SCHEMA.parse(defaultValue), null, 2)
      )
    )

    return new this(this.SCHEMA.parse(raw), path, this.SCHEMA) as InstanceType<T>;
  }
}

