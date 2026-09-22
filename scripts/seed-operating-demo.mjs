import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { analyzeLog } from '../server/analysis.mjs';

if (process.env.NODE_ENV === 'production' || Object.keys(process.env).some(key => key.startsWith('RAILWAY_') && process.env[key])) {
  throw new Error('Connected demo seeding is local-only. Use normal company registration on Railway.');
}

const email = process.env.DEMO_EMAIL || 'manager@connected-demo.workwork.test';
const password = process.env.DEMO_PASSWORD || randomBytes(18).toString('base64url');
if (password.length < 12 || password.length > 256) throw new Error('DEMO_PASSWORD must contain between 12 and 256 characters.');
const app = createApp({
  databasePath: process.env.DATABASE_PATH || './local-data/workwork.sqlite',
  production: false, secureCookies: false, appOrigin: '', analyzeLog,
});
await app.listen(0, '127.0.0.1');
const origin = `http://127.0.0.1:${app.server.address().port}`;

function client() {
  let cookie = '', csrf = '';
  return async (path, body) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${path}: ${result.error || 'Demo creation failed'}`);
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    if (result.csrfToken) csrf = result.csrfToken;
    return result;
  };
}

const now = new Date();
const day = value => value.toISOString().slice(0, 10);
const periodStart = day(new Date(now.getTime() - 7 * 86_400_000));
const periodEnd = day(new Date(now.getTime() + 30 * 86_400_000));
const at = hoursAgo => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
const manager = client();

try {
  await manager('/api/signup', { companyName: 'Harbor Works · Connected Demo', name: 'Morgan Lee', email, password });
  const suffix = randomBytes(6).toString('hex');
  const members = [];
  for (const [role, name] of [['quality', 'Casey Chen'], ['operations', 'Riley Park'], ['shipping', 'Sam Taylor']]) {
    const memberEmail = `${role}-${suffix}@connected-demo.workwork.test`;
    const { invite } = await manager('/api/invites', { email: memberEmail });
    const member = client();
    await member('/api/join', { token: invite.token, name, password: randomBytes(18).toString('base64url') });
    members.push(member);
  }
  const [quality, operations, shipping] = members;
  const { goal } = await manager('/api/goals', {
    title: 'Improve on-time delivery',
    description: 'Complete shipment inspection, packing, QA release and dispatch before customer commitments.',
    metricName: 'On-time delivery', unit: '%', scope: 'All shipments',
    target: 98, baseline: 91, direction: 'at_least', periodStart, periodEnd,
  });
  await manager('/api/requirements', {
    title: 'QA release before shipment', scope: 'All shipments', trigger: 'shipment',
    steps: ['Inspection completed', 'QA release approved', 'Packing completed', 'Dispatch confirmed'],
    effectiveFrom: day(new Date(now.getTime() - 30 * 86_400_000)),
  });

  for (let index = 0; index < 4; index++) {
    const reference = `HARBOR-${101 + index}`;
    const hoursAgo = 30 - index * 6;
    const first = await quality('/api/logs', {
      text: `Order ${reference} shipment: inspection completed.`,
      result: 'The synthetic inspection sheet records a passing sample.', occurredAt: at(hoursAgo),
    });
    const caseId = first.log.caseId || first.cases?.[0]?.id;
    if (!caseId) throw new Error(`No case was created for ${reference}.`);
    await operations('/api/logs', {
      text: `Packing completed for order ${reference} shipment.`, caseId, occurredAt: at(hoursAgo - 1),
    });
    if (index < 3) {
      await shipping('/api/logs', {
        text: `Order ${reference} shipment is waiting for QA release.`, caseId, occurredAt: at(hoursAgo - 2),
      });
    }
    if (index === 2 || index === 3) {
      await quality('/api/logs', {
        text: `QA release approved for order ${reference} shipment.`, caseId, occurredAt: at(hoursAgo - 3),
      });
      await shipping('/api/logs', {
        text: `Dispatch confirmed for order ${reference} shipment.`, caseId, occurredAt: at(hoursAgo - 4),
      });
    }
  }
  await manager('/api/measurements', {
    goalId: goal.id, value: 94, unit: '%', scope: 'All shipments', observedAt: now.toISOString(),
    source: 'Synthetic monthly shipping register: 47 of 50 shipments on time. This register is separate from the four demonstration cases.',
  });
  console.log('Synthetic connected demo created. Existing company records were not changed.');
  console.log('Company: Harbor Works · Connected Demo');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log('Three members authored four shared shipment cases. Three cases report a QA-release wait; one wait later resolves.');
  console.log('Sign in locally as the manager and open Review. HARBOR-101 remains open for the follow-up / release demonstration.');
  console.log('To record a later release, choose Continue this work and enter "QA release approved for order HARBOR-101 shipment." with an occurrence time after the recorded wait.');
} finally {
  await app.close();
}
