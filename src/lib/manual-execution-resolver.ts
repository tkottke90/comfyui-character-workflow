import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readJsonFile } from './files';
import { BadRequestError } from '../errors/http.errors';
import { ComfyUIClient } from '../services/comfyui-client.service';
import { ManualWorkflowSession } from '../services/manual-workflow.service';

interface RawComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}
export type RawComfyGraph = Record<string, RawComfyNode>;

/**
 * Resolves a manual session's mapped fields (and its pinned Seed mapping) into its
 * attached workflow.json — every field with at least one mapping splices its actual
 * typed value (string/number/boolean, not stringified like the character pipeline's
 * NodeMapping.sourceValue, since ManualFieldSchema.value already carries a real type)
 * into each of its mapped (nodeId, inputName) targets. Every unmapped node input is left
 * untouched, retaining whatever literal value the original export already had — the
 * "static passthrough" this whole feature is built around.
 *
 * `seed` is spliced into `session.seedMappings`' targets the same way — Seed is a
 * first-class, always-present mapping (not tied to any user-created field), supplied
 * fresh by the caller each time rather than read from a stored value.
 */
export async function resolveManualGraph(
  session: ManualWorkflowSession,
  comfyClient: ComfyUIClient,
  seed: number
): Promise<RawComfyGraph> {
  if (!session.workflowFile) {
    throw new BadRequestError('No workflow attached to this session');
  }

  const rawGraph = (await readJsonFile(
    path.join(session.workflowDir, session.workflowFile)
  )) as RawComfyGraph;
  const graph: RawComfyGraph = JSON.parse(JSON.stringify(rawGraph));

  for (const mapping of session.seedMappings) {
    const node = graph[mapping.nodeId];
    if (!node) continue;
    node.inputs = node.inputs ?? {};
    node.inputs[mapping.inputName] = seed;
  }

  for (const field of session.fields) {
    if (field.mappings.length === 0) continue;

    const value = field.value;
    let spliced: string | number | boolean;

    if (field.type === 'image') {
      if (value === null) {
        throw new BadRequestError(`Field "${field.key}" is mapped but has no image selected`);
      }
      const image = session.images.find((img) => img.id === value);
      if (!image) {
        throw new BadRequestError(`Field "${field.key}"'s selected image no longer exists`);
      }
      const buffer = await readFile(path.join(session.workflowDir, 'assets', image.filename));
      const uploaded = await comfyClient.uploadImage(buffer, image.filename, 'input', {
        overwrite: true
      });
      spliced = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
    } else {
      if (value === null) {
        throw new BadRequestError(`Field "${field.key}" is mapped but has no value set`);
      }
      spliced = value;
    }

    for (const mapping of field.mappings) {
      const node = graph[mapping.nodeId];
      if (!node) continue;
      node.inputs = node.inputs ?? {};
      node.inputs[mapping.inputName] = spliced;
    }
  }

  return graph;
}
