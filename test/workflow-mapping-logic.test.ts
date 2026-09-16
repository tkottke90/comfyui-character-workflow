import { expect } from 'chai';
import { candidateOutputNodes } from '../src/lib/workflow-mapping-logic';

describe('candidateOutputNodes', () => {
  it('includes nodes matching the original save/preview keywords', () => {
    const candidates = candidateOutputNodes([
      { nodeId: '1', nodeTitle: 'Save Image', classType: 'SaveImage' },
      { nodeId: '2', nodeTitle: 'Preview', classType: 'PreviewImage' },
    ]);

    expect(candidates.map((c) => c.nodeId)).to.have.members(['1', '2']);
  });

  it('includes a VHS_VideoCombine-style node via the broadened keyword list', () => {
    const candidates = candidateOutputNodes([
      { nodeId: '1', nodeTitle: 'Video Combine', classType: 'VHS_VideoCombine' },
    ]);

    expect(candidates.map((c) => c.nodeId)).to.deep.equal(['1']);
  });

  it('includes an audio-save-style node via the broadened keyword list', () => {
    const candidates = candidateOutputNodes([
      { nodeId: '1', nodeTitle: 'Export Audio', classType: 'SaveAudio' },
    ]);

    expect(candidates.map((c) => c.nodeId)).to.deep.equal(['1']);
  });

  it('excludes a node matching none of the keywords', () => {
    const candidates = candidateOutputNodes([
      { nodeId: '1', nodeTitle: 'KSampler', classType: 'KSampler' },
    ]);

    expect(candidates).to.deep.equal([]);
  });
});
