import { expect } from 'chai';
import { applyPromptAdapter } from '../src/lib/prompt-adapter';
import { PromptAdapterSchema } from '../src/schemas/prompt-adapter.schema';

describe('applyPromptAdapter', () => {
  it('is a no-op for an all-default adapter', () => {
    const adapter = PromptAdapterSchema.parse({});
    expect(applyPromptAdapter('photo of a woman', adapter, 'positive')).to.equal(
      'photo of a woman',
    );
    expect(applyPromptAdapter('blurry, watermark', adapter, 'negative')).to.equal(
      'blurry, watermark',
    );
  });

  it('joins leadTags and qualityTagsPositive ahead of the value, in order', () => {
    const adapter = PromptAdapterSchema.parse({
      leadTags: '1girl',
      qualityTagsPositive: 'masterpiece, best quality',
    });
    expect(applyPromptAdapter('photo of a woman', adapter, 'positive')).to.equal(
      '1girl, masterpiece, best quality, photo of a woman',
    );
  });

  it('skips empty segments without leaving stray commas', () => {
    const adapter = PromptAdapterSchema.parse({ leadTags: '1girl' });
    expect(applyPromptAdapter('photo of a woman', adapter, 'positive')).to.equal(
      '1girl, photo of a woman',
    );
  });

  it('joins qualityTagsNegative ahead of the negative value in template mode', () => {
    const adapter = PromptAdapterSchema.parse({
      qualityTagsNegative: 'worst quality, low quality',
    });
    expect(applyPromptAdapter('blurry, watermark', adapter, 'negative')).to.equal(
      'worst quality, low quality, blurry, watermark',
    );
  });

  it('always returns an empty string for a suppressed negative, regardless of input', () => {
    const adapter = PromptAdapterSchema.parse({
      negativeMode: 'suppressed',
      qualityTagsNegative: 'worst quality',
    });
    expect(applyPromptAdapter('blurry, watermark', adapter, 'negative')).to.equal('');
    expect(applyPromptAdapter('', adapter, 'negative')).to.equal('');
  });
});
