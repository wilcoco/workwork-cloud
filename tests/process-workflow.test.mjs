import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { analyzeLog } from '../server/analysis.mjs';

async function setup(t) {
  const app = createApp({ databasePath: ':memory:', production: false, secureCookies: false, appOrigin: '', analyzeLog,
    authRateLimit: 1000, identityRateLimit: 1000, now: () => Date.parse('2026-09-22T12:00:00Z') });
  t.after(() => app.close());
  const address = await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
  function client() {
    let cookie = '', csrf = '';
    return async (path, body, method = body === undefined ? 'GET' : 'POST') => {
      const response = await fetch(origin + path, { method,
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...(csrf && { 'X-CSRF-Token': csrf }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json();
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: response.status, ...data };
    };
  }
  const manager = client();
  assert.equal((await manager('/api/signup', { companyName: 'Synthetic process pilot', name: 'Pilot Manager', email: 'process@pilot.test', password: 'Synthetic pilot password 73!' })).status, 201);
  return { manager, client };
}

test('source correction refreshes process edges, required evidence and waiting findings while retaining prior versions', async t => {
  const { manager, client } = await setup(t);
  const { goal } = await manager('/api/goals', { title: 'Improve shipment delivery', description: 'Complete inspection and packing before shipment.', metricName: 'On-time shipments', unit: '%', scope: 'All shipments', target: 98, direction: 'at_least', periodStart: '2026-09-01', periodEnd: '2026-09-30' });
  await manager('/api/requirements', { title: 'Shipment release', scope: 'All shipments', trigger: 'shipment', steps: ['Inspection completed', 'Packing completed', 'QA release approved'], effectiveFrom: '2026-09-01' });
  await manager('/api/measurements', { goalId: goal.id, value: 94, unit: '%', scope: 'All shipments', observedAt: '2026-09-22T10:00:00Z', source: 'Synthetic shipment register, 47 of 50 on time.' });
  const work = await manager('/api/logs', { text: 'Inspected order FLOW-101 shipment. Packed order FLOW-101 only after inspection.', occurredAt: '2026-09-22T07:00:00Z' });
  assert.equal(work.status, 201);
  const caseId = work.log.caseId;
  await manager('/api/logs', { text: 'Order FLOW-101 shipment is waiting for QA release.', caseId, occurredAt: '2026-09-22T08:00:00Z' });
  const approval = await manager('/api/logs', { text: 'QA release approved for order FLOW-101 shipment.', caseId, occurredAt: '2026-09-22T09:00:00Z' });
  const before = await manager('/api/state');
  const map = before.processMaps.cases.find(item => item.caseId === caseId);
  assert.ok(map.edges.some(edge => edge.kind === 'explicit_dependency'));
  assert.ok(map.edges.some(edge => edge.kind === 'resolution'));
  assert.ok(map.requirements[0].steps.find(step => /QA/.test(step.title)).nodeIds.length);
  assert.ok(map.objectiveLinks.some(link => link.goalId === goal.id && link.evidence.length));
  assert.ok(before.operating.cases.find(item => item.caseId === caseId).blockers.some(item => item.status === 'resolved'));

  const correction = { expectedRevision: 1, text: 'QA release is pending for order FLOW-101 shipment.', result: '', nextDependency: '', occurredAt: '2026-09-22T09:00:00Z', reason: 'The request was acknowledged; release was not approved.' };
  assert.equal((await manager(`/api/logs/${approval.log.id}`, correction, 'PATCH')).status, 200);
  const after = await manager('/api/state');
  const updated = after.processMaps.cases.find(item => item.caseId === caseId);
  assert.equal(updated.edges.some(edge => edge.kind === 'resolution'), false);
  assert.ok(updated.edges.some(edge => edge.kind === 'explicit_dependency'));
  assert.equal(updated.requirements[0].steps.find(step => /QA/.test(step.title)).status, 'not_evidenced');
  assert.ok(after.operating.attention.some(item => item.kind === 'waiting' && item.caseId === caseId));
  assert.equal(after.review.metrics[0].actual, 94);
  assert.equal(JSON.stringify(updated).includes('QA release approved'), true, 'The prescribed requirement title remains distinct from observed evidence.');
  const correctedEvidence = updated.nodes.flatMap(node => node.evidence).filter(evidence => evidence.logId === approval.log.id);
  assert.ok(correctedEvidence.length);
  assert.ok(correctedEvidence.every(evidence => evidence.revision === 2 && evidence.quote.includes('pending')));
  const history = await manager(`/api/logs/${approval.log.id}/history`);
  assert.equal(history.currentRevision, 2);
  assert.deepEqual(history.revisions.map(item => item.revision), [2, 1]);
  assert.equal(history.revisions[0].reason, correction.reason);
  assert.equal(history.revisions[1].log.text, approval.log.text);
  assert.equal(history.revisions[0].log.authorId, approval.log.authorId);
  assert.equal((await manager(`/api/logs/${approval.log.id}`, correction, 'PATCH')).status, 409);

  const other = client();
  await other('/api/signup', { companyName: 'Isolated company', name: 'Other manager', email: 'other@pilot.test', password: 'Another synthetic password 64!' });
  assert.deepEqual((await other('/api/state')).processMaps.cases, []);
  assert.equal((await other(`/api/logs/${approval.log.id}/history`)).status, 404);
  assert.equal((await other(`/api/logs/${approval.log.id}`, { ...correction, expectedRevision: 2 }, 'PATCH')).status, 404);
});

test('correcting the only reference removes a former case from live maps and pattern denominators', async t => {
  const { manager } = await setup(t);
  const first = await manager('/api/logs', { text: 'Inspected order OLD-101 shipment.', occurredAt: '2026-09-22T07:00:00Z' });
  const oldCaseId = first.log.caseId;
  assert.equal((await manager(`/api/logs/${first.log.id}`, { expectedRevision: 1, text: 'Inspected order NEW-202 shipment.', result: '', nextDependency: '', occurredAt: '2026-09-22T07:00:00Z', reason: 'Corrected the order reference.' }, 'PATCH')).status, 200);
  const state = await manager('/api/state');
  assert.equal(state.cases.find(item => item.id === oldCaseId).reference, 'OLD-101', 'Historical case identity is preserved.');
  for (const cases of [state.review.cases, state.operating.cases, state.processMaps.cases]) assert.equal(cases.some(item => (item.caseId || item.id) === oldCaseId), false);
  assert.equal(state.processMaps.cases.length, 1);
  assert.equal(state.logs[0].revision, 2);
  assert.equal((await manager(`/api/logs/${first.log.id}/history`)).revisions[1].log.caseId, oldCaseId);
});
