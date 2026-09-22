import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { analyzeLog } from '../server/analysis.mjs';

const PASSWORD = 'Synthetic Revision Pilot 73!';
const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const correction = (source, overrides = {}) => ({ expectedRevision: source.revision || 1, text: source.text,
  result: source.result || '', nextDependency: source.nextDependency || '', occurredAt: source.occurredAt || null,
  reason: 'Correct the reported source facts.', ...overrides });

async function setup(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'workwork-revisions-'));
  const databasePath = join(directory, 'test.sqlite');
  let clock = NOW;
  const appOptions = { databasePath, now: () => clock, production: false, secureCookies: false, appOrigin: '',
    analyzeLog, authRateLimit: 1000, identityRateLimit: 1000, ...options };
  let app = createApp(appOptions), origin;
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  async function listen() { const address = await app.listen(0, '127.0.0.1'); origin = `http://127.0.0.1:${address.port}`; }
  await listen();
  function client() {
    let cookie = '', csrfToken = '';
    return {
      async request(path, { method = 'GET', body, csrf = true, headers = {} } = {}) {
        const response = await fetch(origin + path, { method,
          headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
            ...(csrf && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const data = await response.json();
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        if (data.csrfToken) csrfToken = data.csrfToken;
        return { status: response.status, data };
      },
      post(path, body) { return this.request(path, { method: 'POST', body }); },
      patch(id, body, extra = {}) { return this.request(`/api/logs/${id}`, { method: 'PATCH', body, ...extra }); },
      signup(suffix) { return this.post('/api/signup', { companyName: `Synthetic ${suffix}`, name: `Manager ${suffix}`,
        email: `${suffix}@revision.example.test`, password: PASSWORD }); },
      async state() { const response = await this.request('/api/state'); assert.equal(response.status, 200); return response.data; },
      async history(id) { const response = await this.request(`/api/logs/${id}/history`); assert.equal(response.status, 200); return response.data; },
    };
  }
  const manager = client();
  const registered = await manager.signup('company-a'); assert.equal(registered.status, 201);
  const members = [];
  for (const [index, name] of ['Casey Author', 'Riley Colleague'].entries()) {
    const invited = await manager.post('/api/invites', { email: `member-${index}@revision.example.test` }); assert.equal(invited.status, 201);
    const member = client(); const joined = await member.post('/api/join', { token: invited.data.invite.token, name, password: PASSWORD });
    assert.equal(joined.status, 201); members.push({ client: member, user: joined.data.user });
  }
  async function save(body, owner = members[0].client) {
    const response = await owner.post('/api/logs', body); assert.equal(response.status, 201); return response.data.log;
  }
  return { manager, managerUser: registered.data.user, companyId: registered.data.company.id, members, client, save,
    get app() { return app; }, advance(ms = 1000) { clock += ms; },
    async restart() { await app.close(); app = createApp(appOptions); await listen(); },
  };
}

test('authors and managers correct full sources while history preserves exact snapshots and original authorship', async t => {
  const env = await setup(t);
  const original = await env.save({ text: 'Order REV-101 shipment: inspection completed.', result: 'No defects found.',
    nextDependency: 'Waiting for QA release.', occurredAt: '2026-09-22T08:00:00Z' });
  assert.equal(original.revision, 1);
  env.advance();
  const updatedResponse = await env.members[0].client.patch(original.id, correction(original, {
    text: 'Order REV-101 shipment: inspection completed. Two samples failed.', result: 'Two defects found.',
    nextDependency: 'Waiting for rework.', occurredAt: '2026-09-22T08:30:00Z', reason: 'Correct the sample result and time.',
  }));
  assert.equal(updatedResponse.status, 200); const updated = updatedResponse.data.log;
  assert.equal(updated.revision, 2); assert.equal(updated.authorId, original.authorId); assert.equal(updated.authorName, original.authorName);
  assert.equal(updated.createdAt, original.createdAt); assert.equal(updated.updatedBy, env.members[0].user.id);
  assert.equal(updated.updatedAt, new Date(NOW + 1000).toISOString());
  assert.equal(updated.occurredAt, '2026-09-22T08:30:00.000Z'); assert.equal(updated.result, 'Two defects found.');
  assert.ok(updated.analysis.events.some(event => event.sourceQuote === 'Two defects found.'));
  assert.equal(updated.analysis.events.some(event => event.sourceQuote === 'No defects found.'), false);
  env.advance();
  const managed = await env.manager.patch(original.id, correction(updated, { result: '', nextDependency: '', occurredAt: null,
    reason: 'The result requires verification; remove unsupported optional claims.' }));
  assert.equal(managed.status, 200); assert.equal(managed.data.log.revision, 3);
  assert.equal(managed.data.log.authorId, original.authorId); assert.equal(managed.data.log.authorName, original.authorName);
  assert.equal(managed.data.log.updatedBy, env.managerUser.id); assert.equal(managed.data.log.createdAt, original.createdAt);
  assert.equal(managed.data.log.result, ''); assert.equal(managed.data.log.nextDependency, ''); assert.equal(managed.data.log.occurredAt, null);
  const history = await env.manager.history(original.id);
  assert.equal(history.currentRevision, 3); assert.deepEqual(history.revisions.map(entry => entry.revision), [3, 2, 1]);
  assert.deepEqual(history.revisions[2].log, original); assert.deepEqual(history.revisions[1].log, updated);
  assert.deepEqual(history.revisions[0].log, managed.data.log);
  assert.deepEqual(history.revisions[0].changedBy, { id: env.managerUser.id, name: env.managerUser.name });
  assert.equal(history.revisions[1].reason, 'Correct the sample result and time.'); assert.equal(history.revisions[2].reason, 'Original record');
  const state = await env.manager.state(); assert.equal(state.logs.length, 1); assert.equal(state.logs[0].revision, 3);
  assert.equal(JSON.stringify(state.review).includes('No defects found.'), false);
});

test('revision and history routes enforce company scope, author role, session, origin and CSRF boundaries', async t => {
  const env = await setup(t); const original = await env.save({ text: 'Order REV-202: inspection completed.' });
  assert.equal((await env.members[1].client.patch(original.id, correction(original))).status, 403);
  assert.equal((await env.members[1].client.history(original.id)).currentRevision, 1, 'Company members may inspect shared evidence history.');
  const outsider = env.client(); await outsider.signup('company-b');
  assert.equal((await outsider.patch(original.id, correction(original))).status, 404);
  assert.equal((await outsider.request(`/api/logs/${original.id}/history`)).status, 404);
  const anonymous = env.client(); assert.equal((await anonymous.request(`/api/logs/${original.id}/history`)).status, 401);
  assert.equal((await anonymous.patch(original.id, correction(original))).status, 401);
  assert.equal((await env.members[0].client.patch(original.id, correction(original), { csrf: false })).status, 403);
  assert.equal((await env.members[0].client.patch(original.id, correction(original), { headers: { Origin: 'https://foreign.example.test' } })).status, 403);
  assert.equal((await env.manager.patch(original.id, { ...correction(original), authorId: env.managerUser.id })).status, 400);
  assert.equal((await env.manager.patch(original.id, { ...correction(original), caseId: original.caseId })).status, 400);
  assert.deepEqual((await env.manager.history(original.id)).revisions[0].log, original);
  assert.equal(JSON.stringify((await outsider.state()).logs).includes(original.id), false);
});

test('invalid or stale corrections do not extract, save history or change current work', async t => {
  let extractions = 0;
  const env = await setup(t, { analyzeLog(log, context) { extractions++; return analyzeLog(log, context); } });
  const original = await env.save({ text: 'Order REV-303: packing completed.' });
  for (const changes of [{ expectedRevision: 0 }, { expectedRevision: 1.5 }, { expectedRevision: '1' }, { expectedRevision: null },
    { reason: '' }, { reason: 'x'.repeat(501) }, { text: '' }, { text: 'x'.repeat(12001) }, { result: [] },
    { occurredAt: '2026-02-30T08:00:00Z' }, { occurredAt: '2027-01-01T08:00:00Z' }]) {
    assert.equal((await env.manager.patch(original.id, correction(original, changes))).status, 400);
  }
  assert.equal(extractions, 1);
  const first = await env.manager.patch(original.id, correction(original, { result: 'Packing sheet saved.' })); assert.equal(first.status, 200);
  assert.equal((await env.manager.patch(original.id, correction(original, { text: 'Stale overwrite.' }))).status, 409);
  assert.equal(extractions, 2);
  const history = await env.manager.history(original.id); assert.equal(history.revisions.length, 2);
  assert.deepEqual(history.revisions[0].log, first.data.log); assert.deepEqual(history.revisions[1].log, original);
});

test('simultaneous corrections recheck the revision after extraction and preserve only the winning snapshot', async t => {
  const pending = [];
  const env = await setup(t, { analyzeLog(log, context) {
    if (log.revision > 1) return new Promise(resolve => pending.push(() => resolve(analyzeLog(log, context))));
    return analyzeLog(log, context);
  } });
  const original = await env.save({ text: 'Order REV-404: inspection completed.' });
  const first = env.members[0].client.patch(original.id, correction(original, { text: 'Order WIN-405: inspection completed.' }));
  const second = env.manager.patch(original.id, correction(original, { text: 'Order LOSE-406: packing completed.' }));
  for (let i = 0; pending.length < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(pending.length, 2);
  assert.equal((await env.manager.patch(original.id, correction(original))).status, 429);
  assert.equal((await env.manager.history(original.id)).currentRevision, 1);
  pending[0](); assert.equal((await first).status, 200);
  pending[1](); assert.equal((await second).status, 409);
  const history = await env.manager.history(original.id); assert.deepEqual(history.revisions.map(entry => entry.revision), [2, 1]);
  assert.deepEqual(history.revisions[1].log, original); assert.match(history.revisions[0].log.text, /WIN-405/);
  assert.equal((await env.manager.state()).cases.some(item => item.reference === 'LOSE-406'), false);
});

test('extraction and transactional write failures leave the current source, snapshots and case identities untouched', async t => {
  let failExtraction = false;
  const env = await setup(t, { analyzeLog(log, context) { if (failExtraction) throw new Error('Synthetic extraction failure'); return analyzeLog(log, context); } });
  const original = await env.save({ text: 'Order REV-505: inspection completed.' });
  const before = await env.manager.state(); failExtraction = true;
  assert.equal((await env.manager.patch(original.id, correction(original))).status, 500);
  assert.deepEqual((await env.manager.history(original.id)).revisions[0].log, original);
  failExtraction = false;
  const replace = env.app.store.replace;
  env.app.store.replace = (companyId, type, record) => { if (type === 'logs') throw new Error('Synthetic transactional failure'); return replace(companyId, type, record); };
  assert.equal((await env.manager.patch(original.id, correction(original, { text: 'Order ROLLBACK-506: packing completed.' }))).status, 500);
  env.app.store.replace = replace;
  const history = await env.manager.history(original.id); assert.equal(history.revisions.length, 1); assert.deepEqual(history.revisions[0].log, original);
  assert.deepEqual((await env.manager.state()).cases, before.cases);
  assert.equal((await env.manager.patch(original.id, correction(original, { result: 'A valid retry.' }))).status, 200);
});

test('corrected references reassign evidence without retaining inferred identity or renaming a shared anonymous case', async t => {
  const env = await setup(t);
  const source = await env.save({ text: 'Order REV-601: inspection completed.' });
  const target = await env.save({ text: 'Order REV-602: packing completed.' });
  const first = await env.manager.patch(source.id, correction(source, { text: 'Order REV-602: inspection completed.' }));
  assert.equal(first.status, 200); assert.equal(first.data.log.caseId, target.caseId);
  assert.ok(first.data.log.analysis.events.every(event => event.caseId === target.caseId));
  assert.equal((await env.manager.history(source.id)).revisions[1].log.caseId, source.caseId);
  const anonymous = await env.save({ text: 'Inspection completed.' });
  const shared = await env.save({ text: 'Packing completed.', caseId: anonymous.caseId }, env.members[1].client);
  const before = await env.manager.state(); const originalCase = before.cases.find(item => item.id === anonymous.caseId);
  const changed = await env.manager.patch(anonymous.id, correction(anonymous, { text: 'Order REV-603: inspection completed.' }));
  assert.equal(changed.status, 200); assert.notEqual(changed.data.log.caseId, anonymous.caseId);
  const after = await env.manager.state(); assert.deepEqual(after.cases.find(item => item.id === anonymous.caseId), originalCase);
  assert.equal(after.logs.find(item => item.id === shared.id).caseId, anonymous.caseId);
  const mixed = await env.manager.patch(changed.data.log.id, correction(changed.data.log, { text: 'Order REV-603: inspection completed. Order REV-602: packing completed.' }));
  assert.equal(mixed.status, 200); assert.equal(mixed.data.log.caseId, null);
  assert.equal(new Set(mixed.data.log.analysis.events.map(event => event.caseId)).size, 2);
});

test('revision history survives restart and legacy logs default to revision one without altering their saved snapshots', async t => {
  const env = await setup(t);
  const newLog = await env.save({ text: 'Order REV-707: inspection completed.' });
  const legacy = { ...newLog }; delete legacy.revision; delete legacy.continuationCaseId;
  env.app.store.replace(env.companyId, 'logs', legacy);
  assert.equal((await env.manager.state()).logs[0].revision, 1);
  assert.equal((await env.manager.history(legacy.id)).currentRevision, 1);
  const updated = await env.members[0].client.patch(legacy.id, correction(legacy, { text: 'Order REV-707: inspection is pending.' }));
  assert.equal(updated.status, 200); const history = await env.manager.history(legacy.id);
  assert.deepEqual(history.revisions[1].log, legacy); assert.equal(history.revisions[1].log.revision, undefined);
  await env.restart(); assert.deepEqual(await env.manager.history(legacy.id), history);
  const state = await env.manager.state(); assert.equal(state.logs.length, 1); assert.equal(state.logs[0].revision, 2);
  assert.equal(JSON.stringify(state.review).includes('inspection completed.'), false);
});

test('explicit continuation remains available for corrected and legacy continuation records', async t => {
  const env = await setup(t); const original = await env.save({ text: 'Order REV-808 shipment: inspection completed.' });
  const continued = await env.save({ text: 'Packing completed.', caseId: original.caseId });
  assert.equal(continued.continuationCaseId, original.caseId);
  const corrected = await env.members[0].client.patch(continued.id, correction(continued, { text: 'Packing is still in progress.' }));
  assert.equal(corrected.status, 200); assert.equal(corrected.data.log.caseId, original.caseId);
  const legacy = await env.save({ text: 'Dispatch confirmed.', caseId: original.caseId });
  delete legacy.continuationCaseId; delete legacy.revision; env.app.store.replace(env.companyId, 'logs', legacy);
  assert.ok(legacy.analysis.events.some(event => event.caseBasis === 'continuation'));
  const correctedLegacy = await env.members[0].client.patch(legacy.id, correction(legacy, { text: 'Dispatch is waiting for carrier collection.' }));
  assert.equal(correctedLegacy.status, 200); assert.equal(correctedLegacy.data.log.caseId, original.caseId);
});

test('correcting an approval back to pending refreshes active findings while old approval remains only in history', async t => {
  const env = await setup(t);
  const waiting = await env.save({ text: 'Order REV-909 shipment is waiting for QA release.', occurredAt: '2026-09-22T08:00:00Z' });
  const approval = await env.save({ text: 'QA release approved for order REV-909 shipment.', caseId: waiting.caseId, occurredAt: '2026-09-22T09:00:00Z' }, env.members[1].client);
  const before = await env.manager.state();
  assert.equal(before.operating.cases.find(item => item.caseId === waiting.caseId).blockers[0].status, 'resolved');
  const response = await env.manager.patch(approval.id, correction(approval, { text: 'Order REV-909 shipment is still waiting for QA release.', reason: 'Approval was reported prematurely.' }));
  assert.equal(response.status, 200);
  const after = await env.manager.state();
  assert.ok(after.operating.cases.find(item => item.caseId === waiting.caseId).blockers.some(item => item.status === 'open'));
  assert.equal(after.operating.cases.find(item => item.caseId === waiting.caseId).blockers.some(item => item.status === 'resolved'), false);
  assert.equal(JSON.stringify(after.operating).includes(approval.text), false);
  assert.equal((await env.manager.history(approval.id)).revisions[1].log.text, approval.text);
});

test('corrections share the company extraction budget with new entries', async t => {
  const env = await setup(t, { companyLogLimit: 2 });
  const original = await env.save({ text: 'Order REV-1001: inspection completed.' });
  const edited = await env.manager.patch(original.id, correction(original, { result: 'Inspection sheet saved.' })); assert.equal(edited.status, 200);
  assert.equal((await env.manager.patch(original.id, correction(edited.data.log, { result: 'Another correction.' }))).status, 429);
  assert.equal((await env.manager.history(original.id)).currentRevision, 2);
});
