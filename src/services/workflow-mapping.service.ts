import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import {
  NodeMapping,
  ResultOutput,
  WorkflowMappingRecord,
  WorkflowMappingSchema,
  WorkflowVersion,
} from '../schemas/workflow-mapping.schema';
import { getWorkflowSlot, slugifySlotId } from '../comfy/workflow-registry';
import { carryForwardMappings, defaultMapping, parseWorkflowGraph } from '../lib/comfyui-workflow';

export class WorkflowSlotNotFoundError extends Error {
  constructor(slotId: string) {
    super(`Unknown workflow slot "${slotId}"`);
    this.name = 'WorkflowSlotNotFoundError';
  }
}

export class WorkflowVersionNotFoundError extends Error {
  constructor(slotId: string, version: number) {
    super(`Version ${version} not found for slot "${slotId}"`);
    this.name = 'WorkflowVersionNotFoundError';
  }
}

export interface WorkflowMappingService {
  list(): WorkflowMappingRecord[];
  get(slotId: string): WorkflowMappingRecord | undefined;
  importVersion(
    rawGraphJson: unknown,
    filename: string,
    slotId: string,
  ): { record: WorkflowMappingRecord; version: number };
  updateNodeMapping(
    slotId: string,
    version: number,
    nodeId: string,
    inputName: string,
    patch: Partial<Pick<NodeMapping, 'sourceType' | 'sourceValue' | 'status'>>,
  ): WorkflowMappingRecord;
  setResultOutput(slotId: string, version: number, output: ResultOutput): WorkflowMappingRecord;
  bindPhase(slotId: string, version: number, boundPhaseSlotId: string): WorkflowMappingRecord;
  activateVersion(slotId: string, version: number): WorkflowMappingRecord;
  replaceNodes(slotId: string, version: number, nodes: NodeMapping[]): WorkflowMappingRecord;
  deleteRecord(slotId: string): boolean;
  /**
   * Reads back the raw ComfyUI API-format graph importVersion() persisted for a given
   * version — the template the execution engine clones and splices resolved mapping
   * values into before submitting. Returns undefined if that slot/version was never
   * imported (or its raw file is missing for some other reason).
   */
  getRawGraph(slotId: string, version: number): unknown | undefined;
  rawGraphDir: string;
}

export function createWorkflowMappingService(dir: string): WorkflowMappingService {
  const rawGraphDir = path.join(dir, 'raw');
  fs.mkdirSync(rawGraphDir, { recursive: true });

  function filePath(slug: string): string {
    return path.join(dir, `${slug}.md`);
  }

  function readSlug(slug: string): WorkflowMappingRecord | undefined {
    const file = filePath(slug);
    if (!fs.existsSync(file)) return undefined;

    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = matter(raw);
    const data = WorkflowMappingSchema.parse(parsed.data);
    return { slug, ...data };
  }

  function write(record: WorkflowMappingRecord): void {
    const { slug, ...data } = record;
    const content = matter.stringify(`# Workflow mapping: ${data.slotId}\n`, data);
    fs.writeFileSync(filePath(slug), content, 'utf-8');
  }

  function requireSlotRecord(slotId: string): WorkflowMappingRecord {
    const slot = getWorkflowSlot(slotId);
    if (!slot) throw new WorkflowSlotNotFoundError(slotId);

    const slug = slugifySlotId(slotId);
    return readSlug(slug) ?? { slug, slotId, versions: [] };
  }

  function requireVersion(record: WorkflowMappingRecord, version: number): WorkflowVersion {
    const found = record.versions.find((v) => v.version === version);
    if (!found) throw new WorkflowVersionNotFoundError(record.slotId, version);
    return found;
  }

  function persist(record: WorkflowMappingRecord): WorkflowMappingRecord {
    const validated = WorkflowMappingSchema.parse(record);
    const finalRecord: WorkflowMappingRecord = { slug: record.slug, ...validated };
    write(finalRecord);
    return finalRecord;
  }

  return {
    rawGraphDir,

    list() {
      return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => readSlug(file.slice(0, -3)))
        .filter((record): record is WorkflowMappingRecord => record !== undefined)
        .sort((a, b) => a.slotId.localeCompare(b.slotId));
    },

    get(slotId) {
      const slot = getWorkflowSlot(slotId);
      if (!slot) return undefined;
      return readSlug(slugifySlotId(slotId));
    },

    importVersion(rawGraphJson, filename, slotId) {
      const record = requireSlotRecord(slotId);
      const parsedNodes = parseWorkflowGraph(rawGraphJson);

      const previousVersion = record.versions.at(-1);
      const nodes = previousVersion
        ? carryForwardMappings(previousVersion.nodes, parsedNodes)
        : parsedNodes.map(defaultMapping);

      const version = (previousVersion?.version ?? 0) + 1;
      const graphDir = path.join(rawGraphDir, record.slug);
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(path.join(graphDir, `v${version}.json`), JSON.stringify(rawGraphJson, null, 2));

      const newVersion: WorkflowVersion = {
        version,
        filename,
        importedAt: new Date().toISOString(),
        boundPhaseSlotId: previousVersion?.boundPhaseSlotId ?? null,
        nodes,
        resultOutput: previousVersion?.resultOutput ?? null,
        active: false,
      };

      const updated = persist({ ...record, versions: [...record.versions, newVersion] });
      return { record: updated, version };
    },

    updateNodeMapping(slotId, version, nodeId, inputName, patch) {
      const record = requireSlotRecord(slotId);
      requireVersion(record, version);

      const updatedVersions = record.versions.map((v) =>
        v.version !== version
          ? v
          : {
              ...v,
              nodes: v.nodes.map((n) =>
                n.nodeId === nodeId && n.inputName === inputName ? { ...n, ...patch } : n,
              ),
            },
      );

      return persist({ ...record, versions: updatedVersions });
    },

    replaceNodes(slotId, version, nodes) {
      const record = requireSlotRecord(slotId);
      requireVersion(record, version);

      const updatedVersions = record.versions.map((v) => (v.version === version ? { ...v, nodes } : v));

      return persist({ ...record, versions: updatedVersions });
    },

    setResultOutput(slotId, version, output) {
      const record = requireSlotRecord(slotId);
      requireVersion(record, version);

      const updatedVersions = record.versions.map((v) =>
        v.version === version ? { ...v, resultOutput: output } : v,
      );

      return persist({ ...record, versions: updatedVersions });
    },

    bindPhase(slotId, version, boundPhaseSlotId) {
      const record = requireSlotRecord(slotId);
      requireVersion(record, version);

      const updatedVersions = record.versions.map((v) =>
        v.version === version ? { ...v, boundPhaseSlotId } : v,
      );

      return persist({ ...record, versions: updatedVersions });
    },

    activateVersion(slotId, version) {
      const record = requireSlotRecord(slotId);
      requireVersion(record, version);

      const updatedVersions = record.versions.map((v) => ({
        ...v,
        active: v.version === version,
      }));

      return persist({ ...record, versions: updatedVersions });
    },

    getRawGraph(slotId, version) {
      const slot = getWorkflowSlot(slotId);
      if (!slot) return undefined;

      const slug = slugifySlotId(slotId);
      const graphPath = path.join(rawGraphDir, slug, `v${version}.json`);
      if (!fs.existsSync(graphPath)) return undefined;

      return JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    },

    deleteRecord(slotId) {
      const slot = getWorkflowSlot(slotId);
      if (!slot) throw new WorkflowSlotNotFoundError(slotId);

      const slug = slugifySlotId(slotId);
      const file = filePath(slug);
      if (!fs.existsSync(file)) return false;

      fs.unlinkSync(file);

      const graphDir = path.join(rawGraphDir, slug);
      if (fs.existsSync(graphDir)) fs.rmSync(graphDir, { recursive: true, force: true });

      return true;
    },
  };
}
