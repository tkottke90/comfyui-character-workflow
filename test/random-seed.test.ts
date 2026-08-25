import { expect } from 'chai';
import { generateRandomSeed, MAX_SEED } from '../src/lib/random-seed';

describe('generateRandomSeed', () => {
  it('returns an integer within [0, MAX_SEED] across repeated calls', () => {
    for (let i = 0; i < 1000; i++) {
      const seed = generateRandomSeed();
      expect(Number.isInteger(seed)).to.equal(true);
      expect(seed).to.be.at.least(0);
      expect(seed).to.be.at.most(MAX_SEED);
    }
  });

  it('does not return the same value on every consecutive call', () => {
    const seeds = Array.from({ length: 20 }, () => generateRandomSeed());
    const distinct = new Set(seeds);
    expect(distinct.size).to.be.greaterThan(1);
  });
});
