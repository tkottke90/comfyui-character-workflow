import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJobStore, JobRecord, SingleJobRecord } from '../src/services/job-store.service';

const SAMPLE: SingleJobRecord = {
  kind: 'single',
  promptId: 'prompt-1',
  status: 'running',
  progress: { value: 5, max: 20 },
  resultPath: null,
  error: null,
  submittedAt: '2026-08-24T00:00:00.000Z',
};

describe('job-store.service', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-store-service-'));
  });

  afterEach(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined for a job that was never stored', async () => {
    const store = createJobStore(dir);
    try {
      expect(store.get('rin-takahashi', 'refinement_cleanup')).to.equal(undefined);
    } finally {
      await store.close();
    }
  });

  it('round-trips a single-job record', async () => {
    const store = createJobStore(dir);
    try {
      await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);
      const fetched = store.get('rin-takahashi', 'refinement_cleanup');
      expect(fetched).to.deep.equal(SAMPLE);
    } finally {
      await store.close();
    }
  });

  it('keeps jobs for different characters/phase bindings independent', async () => {
    const store = createJobStore(dir);
    try {
      await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);
      expect(store.get('rin-takahashi', 'targeted_fix')).to.equal(undefined);
      expect(store.get('ailsa-macleod', 'refinement_cleanup')).to.equal(undefined);
    } finally {
      await store.close();
    }
  });

  it('round-trips a batch-job record with independent sub-jobs', async () => {
    const store = createJobStore(dir);
    const batch: JobRecord = {
      kind: 'batch',
      submittedAt: '2026-08-24T00:00:00.000Z',
      subJobs: [
        { seed: 100, promptId: 'p-100', status: 'done', progress: null, resultPath: 'a.png', error: null },
        { seed: 101, promptId: 'p-101', status: 'running', progress: { value: 3, max: 20 }, resultPath: null, error: null },
      ],
    };

    try {
      await store.set('rin-takahashi', 'casting_batch', batch);
      const fetched = store.get('rin-takahashi', 'casting_batch');
      expect(fetched).to.deep.equal(batch);
    } finally {
      await store.close();
    }
  });

  it('onChange fires with the new record on set(), and not for a different key', async () => {
    const store = createJobStore(dir);
    try {
      const received: JobRecord[] = [];
      const unsubscribe = store.onChange('rin-takahashi', 'refinement_cleanup', (record) => {
        received.push(record);
      });

      await store.set('rin-takahashi', 'targeted_fix', SAMPLE); // different key — no callback
      await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);

      expect(received).to.have.length(1);
      expect(received[0]).to.deep.equal(SAMPLE);

      unsubscribe();
      await store.set('rin-takahashi', 'refinement_cleanup', { ...SAMPLE, status: 'done' });
      expect(received).to.have.length(1); // unsubscribed — no further callbacks
    } finally {
      await store.close();
    }
  });

  it('onAnyChange fires on any key change under an owner, not under a different owner, and does not interfere with onChange', async () => {
    const store = createJobStore(dir);
    try {
      const anyChanges: Array<{ key: string; record: JobRecord }> = [];
      const exactChanges: JobRecord[] = [];

      const unsubscribeAny = store.onAnyChange('rin-takahashi', (phaseBindingKey, record) => {
        anyChanges.push({ key: phaseBindingKey, record });
      });
      const unsubscribeExact = store.onChange('rin-takahashi', 'refinement_cleanup', (record) => {
        exactChanges.push(record);
      });

      await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);
      await store.set('rin-takahashi', 'casting_batch', { ...SAMPLE, promptId: 'prompt-2' });
      await store.set('ailsa-macleod', 'refinement_cleanup', { ...SAMPLE, promptId: 'prompt-3' }); // different owner — no callback

      expect(anyChanges).to.have.length(2);
      expect(anyChanges[0]).to.deep.equal({ key: 'refinement_cleanup', record: SAMPLE });
      expect(anyChanges[1].key).to.equal('casting_batch');
      expect(exactChanges).to.have.length(1); // unaffected by the onAnyChange subscription
      expect(exactChanges[0]).to.deep.equal(SAMPLE);

      unsubscribeAny();
      await store.set('rin-takahashi', 'refinement_cleanup', { ...SAMPLE, status: 'done' });
      expect(anyChanges).to.have.length(2); // unsubscribed — no further callbacks
      expect(exactChanges).to.have.length(2); // onChange subscriber still active

      unsubscribeExact();
    } finally {
      await store.close();
    }
  });

  it('deletes a job', async () => {
    const store = createJobStore(dir);
    try {
      await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);
      await store.delete('rin-takahashi', 'refinement_cleanup');
      expect(store.get('rin-takahashi', 'refinement_cleanup')).to.equal(undefined);
    } finally {
      await store.close();
    }
  });

  it('listAll returns every stored job with its character/phase-binding key restored', async () => {
    const store = createJobStore(dir);
    try {
      await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);
      await store.set('ailsa-macleod', 'targeted_fix', { ...SAMPLE, promptId: 'prompt-2' });

      const all = store.listAll();
      expect(all).to.have.length(2);
      const rin = all.find((row) => row.characterSlug === 'rin-takahashi');
      expect(rin?.phaseBindingKey).to.equal('refinement_cleanup');
      expect((rin?.record as SingleJobRecord).promptId).to.equal('prompt-1');
    } finally {
      await store.close();
    }
  });

  it('survives a process restart — a new store instance over the same directory sees prior data', async () => {
    const store = createJobStore(dir);
    await store.set('rin-takahashi', 'refinement_cleanup', SAMPLE);
    await store.close();

    const reopened = createJobStore(dir);
    try {
      expect(reopened.get('rin-takahashi', 'refinement_cleanup')).to.deep.equal(SAMPLE);
    } finally {
      await reopened.close();
    }
  });
});
