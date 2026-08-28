import { expect } from 'chai';
import { createTestApp, TestApp } from './support/characters-test-app';

describe('characters.views JSON branches (image viewer modal)', () => {
  let app: TestApp;
  let slug: string;

  beforeEach(async () => {
    app = await createTestApp();
    slug = app.charactersService.create({ name: 'Ada Test' }).slug;
  });

  afterEach(() => app.close());

  it('POST /casting/preflight returns { checklist } as JSON when Accept: application/json, and persists it', async () => {
    const res = await fetch(`${app.baseUrl}/characters/${slug}/casting/preflight`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'checklist[no_feature_lines]=on&heroPath=hero.png',
    });

    expect(res.status).to.equal(200);
    expect(res.headers.get('content-type')).to.include('application/json');
    const body = (await res.json()) as { checklist: Record<string, boolean> };
    expect(body.checklist['preflight.no_feature_lines']).to.equal(true);
    expect(body.checklist['preflight.bg_clean']).to.equal(false);
    expect(app.charactersService.get(slug)?.checklist['preflight.no_feature_lines']).to.equal(true);
  });

  it('POST /refinement returns { checklist } as JSON when Accept: application/json, and persists it', async () => {
    const res = await fetch(`${app.baseUrl}/characters/${slug}/refinement`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'checklist[hands_checked]=on',
    });

    expect(res.status).to.equal(200);
    const body = (await res.json()) as { checklist: Record<string, boolean> };
    expect(body.checklist['refinement.hands_checked']).to.equal(true);
    expect(app.charactersService.get(slug)?.checklist['refinement.hands_checked']).to.equal(true);
  });

  it('POST /casting/audit-rows/:index/toggle returns { rowHtml } as JSON and flips the row', async () => {
    const first = await fetch(`${app.baseUrl}/characters/${slug}/casting/audit-rows/0/toggle`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    expect(first.status).to.equal(200);
    const firstBody = (await first.json()) as { rowHtml: string };
    expect(typeof firstBody.rowHtml).to.equal('string');
    const firstFlagged = firstBody.rowHtml.includes('Mark as OK');

    const second = await fetch(`${app.baseUrl}/characters/${slug}/casting/audit-rows/0/toggle`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const secondBody = (await second.json()) as { rowHtml: string };
    const secondFlagged = secondBody.rowHtml.includes('Mark as OK');

    expect(secondFlagged).to.equal(!firstFlagged);
  });

  it('POST /casting/audit-rows/:index/amend returns { rowHtml } as JSON reflecting the new spec value', async () => {
    const res = await fetch(`${app.baseUrl}/characters/${slug}/casting/audit-rows/0/amend`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `specValue=${encodeURIComponent('Deep brown')}`,
    });

    expect(res.status).to.equal(200);
    const body = (await res.json()) as { rowHtml: string };
    expect(body.rowHtml).to.include('Deep brown');
    expect(body.rowHtml).to.include('Flag mismatch'); // amend marks the row ok again
    expect(app.charactersService.get(slug)?.auditRows[0]?.specValue).to.equal('Deep brown');
  });

  it('an out-of-range audit-row index responds with an empty JSON body rather than an error', async () => {
    const res = await fetch(`${app.baseUrl}/characters/${slug}/casting/audit-rows/99/toggle`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });

    expect(res.status).to.equal(200);
    expect(await res.json()).to.deep.equal({});
  });

  it('a plain HTML-accept submit still redirects, unaffected by the new JSON branch', async () => {
    const res = await fetch(`${app.baseUrl}/characters/${slug}/casting/preflight`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'checklist[no_feature_lines]=on',
    });

    expect(res.status).to.equal(302);
    expect(res.headers.get('location')).to.equal(`/characters/${slug}/casting/preflight`);
  });
});
