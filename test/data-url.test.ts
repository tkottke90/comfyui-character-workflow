import { expect } from 'chai';
import { parseDataUrl } from '../src/lib/data-url';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('parseDataUrl', () => {
  it('decodes a PNG data URL into a buffer and extension', () => {
    const result = parseDataUrl(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`);
    expect(result.mime).to.equal('image/png');
    expect(result.extension).to.equal('png');
    expect(result.buffer).to.be.instanceOf(Buffer);
    expect(result.buffer.length).to.be.greaterThan(0);
  });

  it('accepts jpeg and webp mime types', () => {
    expect(parseDataUrl(`data:image/jpeg;base64,${ONE_PIXEL_PNG_BASE64}`).extension).to.equal(
      'jpg',
    );
    expect(parseDataUrl(`data:image/webp;base64,${ONE_PIXEL_PNG_BASE64}`).extension).to.equal(
      'webp',
    );
  });

  it('rejects an unsupported mime type', () => {
    expect(() => parseDataUrl(`data:image/gif;base64,${ONE_PIXEL_PNG_BASE64}`)).to.throw(
      /Unsupported image type/,
    );
  });

  it('rejects a string that is not a data URL', () => {
    expect(() => parseDataUrl('not-a-data-url')).to.throw(/base64-encoded data URL/);
  });
});
