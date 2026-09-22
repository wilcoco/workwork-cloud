import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { tokenHash, INVITE_LIFETIME, SESSION_LIFETIME } from '../server/auth.mjs';
import { analyzeLog } from '../server/analysis.mjs';

const PASSWORD = 'Correct Horse Workwork 47!';
const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const goalInput = { title: 'Improve timely delivery', description: 'Reduce delayed shipments', metricName: 'On-time delivery', unit: '%', target: 95, baseline: 80, direction: 'at_least', periodStart: '2026-09-01', periodEnd: '2026-09-30', scope: 'Plant A' };

async function setup(t, options = {}) {
  const app = createApp({ databasePath: ':memory:', now: () => NOW, production: false, authRateLimit: 1000, identityRateLimit: 1000, ...options });
  const address = await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await app.close(); });
  function client() {
    const state = { cookie: '', csrf: '' };
    return {
      state,
      async request(path, { method = 'GET', body, headers = {}, csrf = true } = {}) {
        const response = await fetch(url + path, { method, headers: { ...(state.cookie ? { Cookie: state.cookie } : {}), ...(method !== 'GET' ? { Origin: url, 'Content-Type': 'application/json' } : {}), ...(csrf && state.csrf ? { 'X-CSRF-Token': state.csrf } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const cookie = response.headers.get('set-cookie'); if (cookie) state.cookie = cookie.split(';')[0];
        const data = await response.json(); if (data.csrfToken) state.csrf = data.csrfToken;
        return { status: response.status, data, response };
      },
      signup(suffix) { return this.request('/api/signup', { method: 'POST', body: { companyName: `Factory ${suffix}`, name: `Manager ${suffix}`, email: `${suffix}@example.test`, password: PASSWORD } }); },
      post(path, body, extra = {}) { return this.request(path, { method: 'POST', body, ...extra }); },
    };
  }
  return { app, url, client };
}

test('registration creates isolated company manager, persistent hashed credentials and real session', async t => {
  const { app, client } = await setup(t);
  const alice = client();
  const signup = await alice.signup('alpha');
  assert.equal(signup.status, 201); assert.equal(signup.data.user.role, 'manager'); assert.equal(signup.data.company.name, 'Factory alpha');
  assert.equal(signup.data.user.passwordHash, undefined); assert.equal(signup.data.user.companyId, undefined);
  assert.match(signup.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.match(app.store.userByEmail('alpha@example.test').passwordHash, /^scrypt:/);
  assert.notEqual(app.store.userByEmail('alpha@example.test').passwordHash, PASSWORD);
  const rawToken = alice.state.cookie.split('=')[1];
  assert.equal(app.store.db.prepare('SELECT token_hash FROM sessions').get().token_hash, tokenHash(rawToken));
  const state = await alice.request('/api/state');
  assert.equal(state.status, 200); assert.deepEqual(state.data.logs, []); assert.deepEqual(state.data.goals, []);
  assert.equal((await alice.post('/api/logout', {})).status, 200);
  assert.equal((await alice.request('/api/state')).status, 401);
  assert.deepEqual((await alice.request('/api/session')).data, { user: null });
  assert.equal((await alice.post('/api/login', { email: 'ALPHA@example.test', password: PASSWORD })).status, 200);
  assert.equal((await client().post('/api/login', { email: 'alpha@example.test', password: 'wrong password' })).status, 401);
  assert.equal((await client().signup('alpha')).status, 409);
});

test('tenant boundary protects reads, foreign goal/case/task IDs and client-assigned identity', async t => {
  const { client } = await setup(t); const a = client(), b = client();
  const signupA = await a.signup('a'), signupB = await b.signup('b');
  const goal = (await a.post('/api/goals', goalInput)).data.goal;
  const work = await a.post('/api/logs', { text: 'Order DEMO-101: completed inspection and prepared delivery.' });
  assert.equal(work.status, 201); assert.ok(work.data.cases.length);
  const caseId = work.data.cases[0].id;
  const task = (await a.post('/api/tasks', { title: 'Dispatch order', goalId: goal.id, caseId })).data.task;
  const stateB = (await b.request('/api/state')).data;
  for (const type of ['goals', 'logs', 'cases', 'tasks', 'measurements']) assert.deepEqual(stateB[type], []);
  assert.notEqual(signupA.data.company.id, signupB.data.company.id);
  assert.equal((await b.post('/api/logs', { text: 'Attempt foreign continuation', caseId })).status, 404);
  assert.equal((await b.post('/api/tasks', { title: 'Attempt foreign goal', goalId: goal.id })).status, 404);
  assert.equal((await b.post('/api/measurements', { goalId: goal.id, value: 99, unit: '%', scope: 'Plant A', observedAt: '2026-09-22', source: 'Test' })).status, 404);
  assert.equal((await b.request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } })).status, 404);
  assert.equal((await b.post('/api/logs', { text: 'Forged tenant', companyId: signupA.data.company.id })).status, 400);
  assert.equal((await b.post('/api/logs', { text: 'Forged author', authorId: signupA.data.user.id })).status, 400);
  assert.equal((await b.post('/api/logs', { text: 'Malformed id', caseId: "' OR 1=1 --" })).status, 400);
  assert.equal((await a.request('/api/state')).data.tasks[0].status, 'open');
});

test('manager invites yield scoped member account, one-use hashed token and role enforcement', async t => {
  const { app, client } = await setup(t); const manager = client(), member = client();
  const signup = await manager.signup('roles');
  const inviteResponse = await manager.post('/api/invites', { email: 'member@example.test' });
  assert.equal(inviteResponse.status, 201);
  const token = inviteResponse.data.invite.token;
  const stored = app.store.db.prepare('SELECT token_hash FROM invites').get().token_hash;
  assert.equal(stored, tokenHash(token)); assert.notEqual(stored, token);
  const joined = await member.post('/api/join', { token, name: 'Operator', password: PASSWORD });
  assert.equal(joined.status, 201); assert.equal(joined.data.user.role, 'member'); assert.equal(joined.data.company.id, signup.data.company.id);
  assert.equal((await client().post('/api/join', { token, name: 'Replay', password: PASSWORD })).status, 400);
  for (const path of ['/api/goals', '/api/requirements', '/api/tasks', '/api/measurements', '/api/invites']) assert.equal((await member.post(path, {})).status, 403);
  const task = (await manager.post('/api/tasks', { title: 'Prepare delivery evidence' })).data.task;
  const changed = await member.request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } });
  assert.equal(changed.status, 200); assert.equal(changed.data.task.completedBy, joined.data.user.id);
  const work = await member.post('/api/logs', { text: 'Completed the inspection of order DEMO-33.' });
  assert.equal(work.status, 201); assert.equal(work.data.log.authorId, joined.data.user.id);
  assert.equal((await manager.request('/api/state')).data.logs.length, 1);
  assert.equal((await member.request('/api/state')).data.logs.length, 1);
});

test('requests reject foreign origins, absent CSRF, invalid JSON types and unsupported fields', async t => {
  const { client } = await setup(t); const c = client();
  assert.equal((await c.post('/api/signup', { companyName: 'Bad', name: 'Bad', email: 'bad@example.test', password: PASSWORD }, { headers: { Origin: 'https://attacker.test' } })).status, 403);
  await c.signup('validation');
  assert.equal((await c.post('/api/logs', { text: 'CSRF test' }, { csrf: false })).status, 403);
  assert.equal((await c.post('/api/logs', { text: 'CSRF test' }, { headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  assert.equal((await c.post('/api/logs', { text: 'Origin test' }, { headers: { Origin: 'https://attacker.test' } })).status, 403);
  assert.equal((await c.post('/api/logs', { text: 'Fetch-site test' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await c.post('/api/logs', { text: ['not a string'] })).status, 400);
  assert.equal((await c.post('/api/logs', { text: 'x'.repeat(12001) })).status, 400);
  assert.equal((await c.post('/api/logs', { text: 'x'.repeat(70000) })).status, 413);
  assert.equal((await c.post('/api/logs', { text: 'Wrong content type' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await c.post('/api/goals', { ...goalInput, target: '95' })).status, 400);
  assert.equal((await c.post('/api/goals', { ...goalInput, periodStart: '2026-02-30' })).status, 400);
  assert.equal((await c.post('/api/goals', { ...goalInput, periodEnd: '2026-08-01' })).status, 400);
  assert.equal((await c.post('/api/requirements', { title: 'Rule', scope: 'Plant A', trigger: 'Order', steps: [], effectiveFrom: '2026-09-01' })).status, 400);
  assert.equal((await c.post('/api/logs', { text: 'Fake prepared associations', analysis: { events: [] } })).status, 400);
});

test('logs generate evidence, continue known cases, preserve unknown time and compute measured gaps only', async t => {
  const { client } = await setup(t); const c = client(); await c.signup('flow');
  const goal = (await c.post('/api/goals', goalInput)).data.goal;
  const first = await c.post('/api/logs', { text: 'Order DEMO-17: completed delivery inspection.', result: 'Inspection sheet saved', nextDependency: 'Waiting for dispatch approval' });
  assert.equal(first.status, 201); assert.equal(first.data.log.occurredAt, null);
  assert.equal(first.data.log.result, 'Inspection sheet saved');
  assert.ok(first.data.analysis.events.length > 0);
  const caseId = first.data.cases[0].id;
  const second = await c.post('/api/logs', { text: 'Completed dispatch handover.', caseId, occurredAt: '2026-09-22T10:00:00Z' });
  assert.equal(second.status, 201); assert.equal(second.data.log.caseId, caseId);
  assert.ok(second.data.analysis.events.every(event => event.caseId === caseId));
  assert.equal((await c.request('/api/state')).data.review.metrics[0].status, 'no_data');
  const measurement = await c.post('/api/measurements', { goalId: goal.id, value: 89, unit: '%', scope: 'Plant A', observedAt: '2026-09-22', source: 'Dispatch register, 89 of 100 shipments' });
  assert.equal(measurement.status, 201); assert.equal(measurement.data.measurement.entrySource, 'manual');
  const review = (await c.request('/api/state')).data.review;
  assert.equal(review.metrics[0].actual, 89); assert.equal(review.metrics[0].gap, -6); assert.equal(review.metrics[0].status, 'gap');
  assert.equal(review.metrics[0].measurementId, measurement.data.measurement.id);
  assert.equal((await c.post('/api/measurements', { goalId: goal.id, value: 100, unit: 'items', scope: 'Plant A', observedAt: '2026-09-22T11:00:00Z', source: 'Wrong unit' })).status, 201);
  assert.equal((await c.post('/api/measurements', { goalId: goal.id, value: 100, unit: '%', scope: 'Plant B', observedAt: '2026-09-22T11:00:00Z', source: 'Wrong scope' })).status, 201);
  assert.equal((await c.post('/api/measurements', { goalId: goal.id, value: 100, unit: '%', scope: 'Plant A', observedAt: '2026-08-31', source: 'Outside period' })).status, 201);
  assert.equal((await c.request('/api/state')).data.review.metrics[0].actual, 89);
});

test('process requirements remain versioned, manager-authorized evidence comparisons', async t => {
  const { client } = await setup(t); const c = client(); await c.signup('process');
  const response = await c.post('/api/requirements', { title: 'Dispatch checks', scope: 'delivery', trigger: 'delivery', steps: ['Inspection', 'Dispatch'], effectiveFrom: '2026-09-01' });
  assert.equal(response.status, 201); assert.equal(response.data.requirement.version, 1); assert.equal(response.data.requirement.authority, 'manager');
  await c.post('/api/logs', { text: 'Order DEMO-50 delivery: inspection completed.', occurredAt: '2026-09-22T09:00:00Z' });
  const state = (await c.request('/api/state')).data;
  assert.equal(state.requirements.length, 1);
  for (const caseReview of state.review.cases) for (const requirement of caseReview.requirements) assert.equal(requirement.applicability, 'suggested');
});

test('persistent database survives restart without mixing tenant records', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'workwork-api-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'pilot.sqlite');
  let app = createApp({ databasePath, production: false });
  let address = await app.listen(0, '127.0.0.1');
  let base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(base + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ companyName: 'Persistent pilot', name: 'Manager', email: 'persist@example.test', password: PASSWORD }) });
  const account = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
  const saved = await fetch(base + '/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, 'X-CSRF-Token': account.csrfToken }, body: JSON.stringify({ text: 'Order DEMO-91: completed inspection.' }) });
  assert.equal(saved.status, 201); await saved.json(); await app.close();
  app = createApp({ databasePath, production: false }); t.after(() => app.close());
  address = await app.listen(0, '127.0.0.1'); base = `http://127.0.0.1:${address.port}`;
  const state = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
  const data = await state.json(); assert.equal(state.status, 200); assert.equal(data.logs.length, 1); assert.equal(data.company.name, 'Persistent pilot');
});

test('expired invitation/session are rejected and replaced invitation revokes prior link', async t => {
  let clock = NOW;
  const { client } = await setup(t, { now: () => clock }); const c = client(); await c.signup('expiry');
  const old = (await c.post('/api/invites', { email: 'waiting@example.test' })).data.invite;
  const current = (await c.post('/api/invites', { email: 'waiting@example.test' })).data.invite;
  assert.equal((await client().post('/api/join', { token: old.token, name: 'Member', password: PASSWORD })).status, 400);
  clock += INVITE_LIFETIME + 1;
  assert.equal((await client().post('/api/join', { token: current.token, name: 'Member', password: PASSWORD })).status, 400);
  clock += SESSION_LIFETIME;
  assert.equal((await c.request('/api/state')).status, 401);
});

test('authentication is rate limited and production requires explicit HTTPS origin', async t => {
  const { client } = await setup(t, { authRateLimit: 2 }); const c = client();
  assert.equal((await c.post('/api/login', { email: 'missing@example.test', password: PASSWORD })).status, 401);
  assert.equal((await c.post('/api/login', { email: 'missing@example.test', password: PASSWORD })).status, 401);
  assert.equal((await c.post('/api/login', { email: 'missing@example.test', password: PASSWORD })).status, 429);
  assert.throws(() => createApp({ production: true, appOrigin: '' }), /APP_ORIGIN/);
  assert.throws(() => createApp({ production: true, appOrigin: 'http://public.example.test' }), /HTTPS/);
  const production = createApp({ production: true, databasePath: ':memory:', appOrigin: 'https://public.example.test' });
  const address = await production.listen(0, '127.0.0.1'); t.after(() => production.close());
  const response = await fetch(`http://127.0.0.1:${address.port}/api/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://public.example.test' }, body: JSON.stringify({ companyName: 'Secure Factory', name: 'Owner', email: 'secure@example.test', password: PASSWORD }) });
  assert.equal(response.status, 201); assert.match(response.headers.get('set-cookie'), /; Secure/);
});

test('forwarded client addresses are ignored unless the proxy hop count is explicitly trusted', async t => {
  const untrusted = await setup(t, { authRateLimit: 1 });
  const c = untrusted.client();
  assert.equal((await c.post('/api/login', { email: 'one@example.test', password: PASSWORD }, { headers: { 'X-Forwarded-For': '192.0.2.1' } })).status, 401);
  assert.equal((await c.post('/api/login', { email: 'two@example.test', password: PASSWORD }, { headers: { 'X-Forwarded-For': '192.0.2.2' } })).status, 429);
  const trusted = await setup(t, { authRateLimit: 1, trustProxyHops: 1 });
  const d = trusted.client();
  assert.equal((await d.post('/api/login', { email: 'three@example.test', password: PASSWORD }, { headers: { 'X-Forwarded-For': 'spoofed-leftmost, 192.0.2.3' } })).status, 401);
  assert.equal((await d.post('/api/login', { email: 'four@example.test', password: PASSWORD }, { headers: { 'X-Forwarded-For': 'different-spoof, 192.0.2.3' } })).status, 429);
  assert.equal((await d.post('/api/login', { email: 'five@example.test', password: PASSWORD }, { headers: { 'X-Forwarded-For': '192.0.2.4' } })).status, 401);
  assert.throws(() => createApp({ production: false, trustProxyHops: 'NaN' }), /TRUST_PROXY_HOPS/);
});

test('company log limits and extraction concurrency are bounded without blocking other tenants', async t => {
  const pending = [];
  const { client } = await setup(t, {
    companyLogLimit: 2,
    analyzeLog: (log, context) => new Promise(resolve => { pending.push(() => resolve(analyzeLog(log, context))); }),
  });
  const a = client(), b = client(); await a.signup('budget-a'); await b.signup('budget-b');
  const one = a.post('/api/logs', { text: 'Completed inspection.' });
  const two = a.post('/api/logs', { text: 'Completed packing.' });
  for (let attempt = 0; pending.length < 2 && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(pending.length, 2);
  assert.equal((await a.post('/api/logs', { text: 'Too many concurrent entries.' })).status, 429);
  const anotherTenant = b.post('/api/logs', { text: 'Completed independent work.' });
  for (let attempt = 0; pending.length < 3 && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(pending.length, 3);
  for (const resolve of pending) resolve();
  assert.equal((await one).status, 201); assert.equal((await two).status, 201); assert.equal((await anotherTenant).status, 201);
  assert.equal((await a.post('/api/logs', { text: 'Hourly quota reached.' })).status, 429);
});

test('ambiguous reference events are retained without asserting a continuation case', async t => {
  const { client } = await setup(t); const c = client(); await c.signup('ambiguity');
  const first = await c.post('/api/logs', { text: 'Order DEMO-11: inspection completed.' });
  const continued = await c.post('/api/logs', { text: 'Compared order DEMO-11 with order DEMO-12.', caseId: first.data.cases[0].id });
  assert.equal(continued.status, 201);
  assert.equal(continued.data.analysis.events[0].caseId, null);
  assert.deepEqual(continued.data.cases, []);
  assert.equal((await c.post('/api/logs', { text: 'Invalid time', occurredAt: '2026-02-30T08:00:00+09:00' })).status, 400);
  assert.equal((await c.post('/api/logs', { text: 'Future time', occurredAt: '2026-10-01T08:00:00Z' })).status, 400);
  const goal = (await c.post('/api/goals', goalInput)).data.goal;
  assert.equal((await c.post('/api/measurements', { goalId: goal.id, value: 99, unit: '%', scope: 'Plant A', observedAt: '2026-10-01', source: 'Forecast presented as actual' })).status, 400);
});
