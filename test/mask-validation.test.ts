import { expect } from 'chai';
import zlib from 'node:zlib';
import { assertMaskDimensionsMatch } from '../src/lib/mask-validation';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Builds a minimal valid grayscale PNG of the given pixel dimensions, for test fixtures only. */
function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(0, 9); // color type: grayscale
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const row = Buffer.alloc(1 + width); // filter byte (0) + pixel bytes (0)
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('assertMaskDimensionsMatch', () => {
  it('does not throw when the mask matches the image dimensions exactly', () => {
    const image = makePng(64, 96);
    const mask = makePng(64, 96);
    expect(() => assertMaskDimensionsMatch(image, mask)).to.not.throw();
  });

  it('throws with both dimensions in the message when they differ', () => {
    const image = makePng(64, 96);
    const mask = makePng(32, 48);
    expect(() => assertMaskDimensionsMatch(image, mask)).to.throw(/32x48.*64x96/);
  });
});
