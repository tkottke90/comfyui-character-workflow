import { z } from 'zod';

export const TemplateTypeSchema = z.enum(['silhouette', 'openpose']);
export type TemplateType = z.infer<typeof TemplateTypeSchema>;

export const TemplateSchema = z.object({
  name: z.string().min(1),
  type: TemplateTypeSchema.default('silhouette'),
  filename: z.string().default(''),
  notes: z.string().default(''),
  createdAt: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;

export interface TemplateRecord extends Template {
  slug: string;
}
