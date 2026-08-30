import { readFileSync } from 'fs';
import fsSync from 'fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import z from 'zod';
import { dirname } from 'node:path'


export function getFile(path: string) {
  return readFile(path, 'utf-8');
}

/**
 * Tries to read the file Or creates one with the default value if
 * none is found.
 */
export async function getFileSafe(path: string, defaultValue: string) {
  try {
    await stat(path);
    return readFile(path, 'utf-8');
  } catch {
    await writeFile(path, defaultValue, 'utf-8');
    return defaultValue
  }
}

/**
 * Tries to read the file Or creates one with the default value if
 * none is found.
 */
export function getFileSafeSync(path: string, getDefaultValue: () => string) {
  try {
    fsSync.statSync(path);
    return readFileSync(path, 'utf-8');
  } catch {
    const defaultValue = getDefaultValue();

    fsSync.mkdirSync(dirname(path), { recursive: true })

    fsSync.writeFileSync(path, defaultValue, 'utf-8');
    return defaultValue
  }
}

export async function readJsonFile(path: string) {
  const file = await getFile(path);

  return JSON.parse(file);
}

export async function readFileWithSchema<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const file = await readJsonFile(path);

  return schema.parse(file)
}

export async function writeJsonFile(path: string, content: unknown) {
  await writeFile(
    path,
    JSON.stringify(content, null, 2),
    'utf-8'
  )
}