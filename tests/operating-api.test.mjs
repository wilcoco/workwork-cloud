import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { analyzeLog } from '../server/analysis.mjs';

const PASSWORD = 'Synthetic Connected Pilot 52!';
const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const goalInput = {
  title: 'Improve on-time delivery', description: 'Complete shipment inspection, packing, QA release and dispatch before customer commitments.',
  metricName: 'On-time delivery', unit: '%', scope: 'All shipments', target: 98, direction: 'at_least',
  periodStart: '2026-09-01', periodEnd: '2026-09-30',
};

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'workwork-operating-api-'));
  const app = createApp({ databasePath: join(directory, 'test.sqlite'), now: () => NOW,
    production: false, secureCookies: false, appOrigin: '', analyzeLog, authRateLimit: 1000, identityRateLimit: 1000 });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const address = await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
  function client() {
    let cookie = '', csrf = '';
    return {
      async request(path, { method = 'GET', body } = {}) {
        const response = await fetch(origin + path, { method,
          headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const data = await response.json();
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        if (data.csrfToken) csrf = data.csrfToken;
        return { status: response.status, data };
      },
      post(path, body) { return this.request(path, { method: 'POST', body }); },
      signup(suffix) { return this.post('/api/signup', { companyName: `Synthetic ${suffix}`, name: `Manager ${suffix}`, email: `${suffix}@operating.example.test`, password: PASSWORD }); },
      async state() { const response = await this.request('/api/state'); assert.equal(response.status, 200); return response.data; },
    };
  }
  const manager = client();
  const registered = await manager.signup('company-a');
  assert.equal(registered.status, 201);
  const members = [];
  for (const [index, name] of ['Casey Inspection', 'Riley Packing', 'Sam Shipping'].entries()) {
    const invited = await manager.post('/api/invites', { email: `member-${index}@operating.example.test` });
    assert.equal(invited.status, 201);
    const member = client();
    const joined = await member.post('/api/join', { token: invited.data.invite.token, name, password: PASSWORD });
    assert.equal(joined.status, 201);
    members.push({ client: member, user: joined.data.user });
  }
  async function addGoal() {
    const response = await manager.post('/api/goals', goalInput); assert.equal(response.status, 201); return response.data.goal;
  }
  async function addRequirement() {
    const response = await manager.post('/api/requirements', { title: 'QA release before shipment', scope: 'All shipments', trigger: 'shipment',
      steps: ['Inspection completed', 'QA release approved', 'Packing completed', 'Dispatch confirmed'], effectiveFrom: '2026-09-01' });
    assert.equal(response.status, 201); return response.data.requirement;
  }
  async function save(client, body) {
    const response = await client.post('/api/logs', body); assert.equal(response.status, 201); return response.data;
  }
  async function addCase(reference = 'HARBOR-101', { wait = true, resolved = false } = {}) {
    const inspection = await save(members[0].client, { text: `Order ${reference} shipment: inspection completed.`, occurredAt: '2026-09-22T08:00:00Z' });
    const caseId = inspection.log.caseId || inspection.cases[0]?.id; assert.ok(caseId);
    const packing = await save(members[1].client, { text: `Packing completed for order ${reference} shipment.`, caseId, occurredAt: '2026-09-22T09:00:00Z' });
    const waiting = wait ? await save(members[2].client, { text: `Order ${reference} shipment is waiting for QA release.`, caseId, occurredAt: '2026-09-22T10:00:00Z' }) : null;
    const release = resolved ? await save(members[0].client, { text: `QA release approved for order ${reference} shipment.`, caseId, occurredAt: '2026-09-22T11:00:00Z' }) : null;
    return { caseId, inspection, packing, waiting, release, reference };
  }
  return { manager, members, client, addGoal, addRequirement, save, addCase };
}

test('connected case briefing joins authenticated authors, intent, wait evidence and an independent actual', async t => {
  const { manager, members, addGoal, addRequirement, addCase } = await setup(t);
  const goal = await addGoal(); await addRequirement(); const work = await addCase();
  const measured = await manager.post('/api/measurements', { goalId: goal.id, value: 94, unit: '%', scope: 'All shipments',
    observedAt: '2026-09-22T11:00:00Z', source: 'Synthetic register: 47 of 50 on time; distinct from this work case.' });
  assert.equal(measured.status, 201);
  const state = await manager.state(); assert.equal(state.operating.version, 1);
  const briefing = state.operating.cases.find(item => item.caseId === work.caseId); assert.ok(briefing);
  assert.deepEqual(new Set(briefing.participants.map(item => item.id)), new Set(members.map(item => item.user.id)));
  assert.ok(briefing.goalIds.includes(goal.id)); assert.equal(briefing.readiness, 'needs_attention');
  assert.match(briefing.statement, /QA release/i);
  const wait = briefing.blockers.find(item => item.status === 'open'); assert.ok(wait);
  assert.equal(wait.openedBy.logId, work.waiting.log.id); assert.equal(wait.openedBy.quote, work.waiting.log.text);
  assert.equal(wait.openedBy.authorName, members[2].user.name); assert.equal(wait.resolvedBy, null);
  const attention = state.operating.attention.find(item => item.kind === 'waiting' && item.caseId === work.caseId); assert.ok(attention);
  assert.equal(attention.suggestedTask.caseId, work.caseId); assert.equal(attention.suggestedTask.goalId, goal.id);
  assert.ok(attention.evidence.some(item => item.logId === work.waiting.log.id));
  assert.ok(state.operating.goalSummaries.find(item => item.goalId === goal.id).needsAttentionCaseIds.includes(work.caseId));
  const metric = state.review.metrics.find(item => item.goalId === goal.id);
  assert.equal(metric.actual, 94); assert.equal(metric.target, 98); assert.equal(metric.gap, -4);
  assert.equal(metric.measurementId, measured.data.measurement.id);
});

test('a strictly later reported QA release clears the active wait while retaining both source quotes', async t => {
  const { manager, members, addGoal, addCase, save } = await setup(t);
  await addGoal(); const work = await addCase();
  const before = await manager.state();
  assert.ok(before.operating.attention.some(item => item.kind === 'waiting' && item.caseId === work.caseId));
  const release = await save(members[0].client, { text: 'QA release approved for order HARBOR-101 shipment.', caseId: work.caseId, occurredAt: '2026-09-22T11:00:00Z' });
  const after = await manager.state();
  const briefing = after.operating.cases.find(item => item.caseId === work.caseId);
  assert.equal(briefing.blockers.filter(item => item.status === 'open').length, 0);
  const resolved = briefing.blockers.find(item => item.status === 'resolved'); assert.ok(resolved);
  assert.equal(resolved.openedBy.logId, work.waiting.log.id); assert.equal(resolved.openedBy.quote, work.waiting.log.text);
  assert.equal(resolved.resolvedBy.logId, release.log.id); assert.equal(resolved.resolvedBy.quote, release.log.text);
  assert.equal(after.operating.attention.some(item => item.kind === 'waiting' && item.caseId === work.caseId), false);
  assert.deepEqual(after.logs.find(log => log.id === work.waiting.log.id), before.logs.find(log => log.id === work.waiting.log.id));
  assert.equal(after.review.metrics[0].actual, null, 'A release report is not a company KPI observation.');
});

test('a manager-authorized follow-up appears in review but task completion does not clear a reported wait', async t => {
  const { manager, members, addGoal, addCase } = await setup(t);
  const goal = await addGoal(); const work = await addCase();
  const suggested = (await manager.state()).operating.attention.find(item => item.kind === 'waiting' && item.caseId === work.caseId).suggestedTask;
  assert.equal((await members[0].client.post('/api/tasks', suggested)).status, 403);
  const created = await manager.post('/api/tasks', { ...suggested, goalId: goal.id, caseId: work.caseId });
  assert.equal(created.status, 201);
  let state = await manager.state();
  assert.ok(state.operating.cases.find(item => item.caseId === work.caseId).openTaskIds.includes(created.data.task.id));
  assert.ok(state.operating.attention.find(item => item.kind === 'waiting' && item.caseId === work.caseId).existingTaskIds.includes(created.data.task.id));
  const completed = await members[1].client.request(`/api/tasks/${created.data.task.id}`, { method: 'PATCH', body: { status: 'done' } });
  assert.equal(completed.status, 200);
  state = await manager.state();
  assert.ok(state.operating.cases.find(item => item.caseId === work.caseId).blockers.some(item => item.status === 'open'));
  assert.ok(state.operating.attention.some(item => item.kind === 'waiting' && item.caseId === work.caseId));
  assert.equal(state.operating.cases.find(item => item.caseId === work.caseId).openTaskIds.includes(created.data.task.id), false);
});

test('an objective added after work is recorded connects to existing evidence without rewriting source extraction', async t => {
  const { manager, addGoal, addCase } = await setup(t);
  const work = await addCase(); const before = await manager.state();
  assert.deepEqual(before.operating.cases.find(item => item.caseId === work.caseId).goalIds, []);
  const goal = await addGoal(); const after = await manager.state();
  const briefing = after.operating.cases.find(item => item.caseId === work.caseId);
  assert.ok(briefing.goalIds.includes(goal.id));
  assert.ok(after.operating.goalSummaries.find(item => item.goalId === goal.id).caseIds.includes(work.caseId));
  assert.ok(after.review.cases.find(item => item.id === work.caseId).goalLinks.some(item => item.goalId === goal.id));
  for (const log of before.logs) assert.deepEqual(after.logs.find(item => item.id === log.id), log);
  assert.equal(after.review.metrics.find(item => item.goalId === goal.id).actual, null);
});

test('historical waits count distinct comparable cases after resolution and remain private to their company', async t => {
  const { manager, client, addGoal, addRequirement, addCase } = await setup(t);
  const goal = await addGoal(); const requirement = await addRequirement();
  const works = [];
  for (let index = 0; index < 4; index++) works.push(await addCase(`HARBOR-${101 + index}`, { wait: index < 3, resolved: index >= 2 }));
  const stateA = await manager.state();
  const pattern = stateA.operating.patterns.find(item => item.count === 3 && item.total === 4 && /QA release/i.test(item.label)); assert.ok(pattern);
  assert.deepEqual(new Set(pattern.caseIds), new Set(works.slice(0, 3).map(item => item.caseId)));
  assert.deepEqual(new Set(pattern.cohortCaseIds), new Set(works.map(item => item.caseId)));
  for (const work of works.slice(0, 3)) assert.ok(pattern.evidence.some(item => item.logId === work.waiting.log.id));
  assert.ok(stateA.operating.processPatterns.some(item => item.caseCount === 4 && item.activities.some(activity => /inspection/i.test(activity.label) && activity.count === 4)));
  const other = client(); assert.equal((await other.signup('company-b')).status, 201);
  const own = await other.post('/api/logs', { text: 'Order BETA-909: maintenance repair completed.', occurredAt: '2026-09-22T08:00:00Z' });
  assert.equal(own.status, 201);
  const stateB = await other.state();
  assert.deepEqual(stateB.operating.patterns, []); assert.deepEqual(stateB.operating.processPatterns, []); assert.deepEqual(stateB.operating.goalSummaries, []);
  const serialized = JSON.stringify(stateB.operating);
  for (const forbidden of [goal.id, requirement.id, ...works.map(item => item.caseId), ...stateA.logs.map(item => item.id), ...stateA.logs.map(item => item.authorId)]) assert.equal(serialized.includes(forbidden), false);
  assert.equal(serialized.includes('HARBOR-'), false);
  assert.equal((await other.post('/api/tasks', { title: 'Forbidden follow-up', caseId: works[0].caseId })).status, 404);
});

test('connected demo refuses production and Railway environments before creating its database', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'workwork-demo-guard-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'must-not-exist.sqlite');
  const script = fileURLToPath(new URL('../scripts/seed-operating-demo.mjs', import.meta.url));
  for (const environment of [{ NODE_ENV: 'production' }, { NODE_ENV: 'development', RAILWAY_ENVIRONMENT_ID: 'synthetic-railway-guard' }]) {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, ...environment, DATABASE_PATH: databasePath } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /demo seeding is local-only/i);
    await assert.rejects(access(databasePath), { code: 'ENOENT' });
  }
});
