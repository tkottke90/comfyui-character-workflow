import { z } from 'zod';

export const NodeMappingSchema = z.object({
  nodeId: z.string(),
  nodeTitle: z.string(),
  inputName: z.string(),
  classType: z.string().default(''),
  sourceType: z.enum(['unset', 'domain', 'computed', 'static']).default('unset'),
  sourceValue: z.string().default(''),
  status: z.enum(['unmapped', 'mapped', 'verified', 'missing']).default('unmapped'),
});
export type NodeMapping = z.infer<typeof NodeMappingSchema>;

export const ResultOutputSchema = z.object({
  nodeId: z.string(),
  outputIndex: z.number(),
  label: z.string(),
});
export type ResultOutput = z.infer<typeof ResultOutputSchema>;

export const WorkflowVersionSchema = z.object({
  version: z.number(),
  filename: z.string(),
  importedAt: z.string(),
  boundPhaseSlotId: z.string().nullable().default(null),
  nodes: z.array(NodeMappingSchema).default(() => []),
  resultOutput: ResultOutputSchema.nullable().default(null),
  active: z.boolean().default(false),
});
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

export const WorkflowMappingSchema = z.object({
  slotId: z.string(),
  versions: z.array(WorkflowVersionSchema).default(() => []),
});
export type WorkflowMapping = z.infer<typeof WorkflowMappingSchema>;

export interface WorkflowMappingRecord extends WorkflowMapping {
  slug: string;
}
