import { expect } from 'chai';
import {
  CHECKLIST_DEFINITIONS,
  CHECKLIST_PHASES,
  emptyChecklist,
  isPhaseComplete,
} from '../src/checklist/definitions';

describe('checklist definitions', () => {
  it('produces an all-false checklist covering every defined item', () => {
    const checklist = emptyChecklist();

    for (const phase of CHECKLIST_PHASES) {
      for (const item of CHECKLIST_DEFINITIONS[phase]) {
        expect(checklist[`${phase}.${item.id}`]).to.equal(false);
      }
    }
  });

  it('reports a phase incomplete when any item is false', () => {
    const checklist = emptyChecklist();
    const items = CHECKLIST_DEFINITIONS.specification;
    for (let i = 0; i < items.length - 1; i++) {
      checklist[`specification.${items[i].id}`] = true;
    }

    expect(isPhaseComplete('specification', checklist)).to.equal(false);
  });

  it('reports a phase complete only once every item is true', () => {
    const checklist = emptyChecklist();
    for (const item of CHECKLIST_DEFINITIONS.dataset) {
      checklist[`dataset.${item.id}`] = true;
    }

    expect(isPhaseComplete('dataset', checklist)).to.equal(true);
  });

  it('treats a missing key as incomplete rather than throwing', () => {
    expect(isPhaseComplete('preflight', {})).to.equal(false);
  });
});
