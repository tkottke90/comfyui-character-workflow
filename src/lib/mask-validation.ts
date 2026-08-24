import { imageSize } from 'image-size';
import { BadRequestError } from '../errors/http.errors';

/**
 * Throws if an uploaded mask's pixel dimensions don't exactly match the current image's.
 * ComfyUI's mask-consuming nodes (SetLatentNoiseMask, VAEEncodeForInpaint, etc.) require
 * this — a mismatch here should be caught at upload time with a clear message, not surface
 * as an opaque ComfyUI execution error later.
 */
export function assertMaskDimensionsMatch(imageBuffer: Uint8Array, maskBuffer: Uint8Array): void {
  const image = imageSize(imageBuffer);
  const mask = imageSize(maskBuffer);

  if (image.width !== mask.width || image.height !== mask.height) {
    throw new BadRequestError(
      `Mask dimensions (${mask.width}x${mask.height}) do not match the current image's ` +
        `(${image.width}x${image.height})`,
    );
  }
}
