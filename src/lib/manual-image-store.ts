import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { imageSize } from 'image-size';
import { ImageSchema, ManualImage, ManualWorkflowRegistry, ManualWorkflowSession, MediaKind } from '../services/manual-workflow.service';

/**
 * Writes an already-decoded media buffer into a manual session's assets/ directory and
 * registers it in session.images — shared by the user-facing image upload route
 * (`POST /:id/images`) and by generation completion, which both need the same
 * decode-write-register sequence. Dimensions are only probed for images — there's no
 * video/audio metadata extraction (duration, resolution) in this app.
 */
export async function storeManualImage(
  manualWorkflows: ManualWorkflowRegistry,
  sessionId: string,
  workflowDir: string,
  buffer: Buffer,
  extension: string,
  kind: MediaKind = 'image'
): Promise<ManualImage> {
  const size = kind === 'image' ? imageSize(buffer) : undefined;
  const id = crypto.randomUUID();
  const filename = `${id}.${extension}`;

  const assetsDir = path.join(workflowDir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(assetsDir, filename), buffer);

  const image = ImageSchema.parse({ id, kind, filename, size });
  // Functional update — two generations can complete concurrently now, and each must
  // append to whatever `images` currently holds rather than a snapshot taken before this
  // call, or one completion's stored image would silently vanish from the session record.
  await manualWorkflows.updateSession(sessionId, (current: ManualWorkflowSession) => ({
    images: [...current.images, image]
  }));

  return image;
}
