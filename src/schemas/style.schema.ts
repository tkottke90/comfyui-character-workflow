import { z } from 'zod';

export const StyleSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  artStyle: z.string().default(''),
  checkpoint: z.string().min(1),
  sampler: z.string().min(1),
  scheduler: z.string().min(1),
  cfg: z.number().min(1).max(20),
  steps: z.number().min(1).max(100),
  createdAt: z.string(),
});
export type Style = z.infer<typeof StyleSchema>;

export interface StyleRecord extends Style {
  slug: string;
}
