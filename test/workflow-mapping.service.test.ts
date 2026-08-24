import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkflowMappingService } from '../src/services/workflow-mapping.service';

describe('workflow-mapping.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-mapping-service-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getRawGraph reads back exactly what importVersion persisted', () => {
    const service = createWorkflowMappingService(dir);
    const graph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { title: 'Load Image' } },
    };

    const { version } = service.importVersion(graph, 'cleanup.json', '003-Cleanup');

    expect(service.getRawGraph('003-Cleanup', version)).to.deep.equal(graph);
  });

  it('getRawGraph returns undefined for a version that was never imported', () => {
    const service = createWorkflowMappingService(dir);
    expect(service.getRawGraph('003-Cleanup', 99)).to.equal(undefined);
  });

  it('getRawGraph returns undefined for an unknown slot id', () => {
    const service = createWorkflowMappingService(dir);
    expect(service.getRawGraph('999-Nonexistent-Slot', 1)).to.equal(undefined);
  });
});
