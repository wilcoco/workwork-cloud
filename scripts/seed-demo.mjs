import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';

if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_ID) {
  throw new Error('Demo seeding is local-only. Use normal company registration on Railway.');
}

const password = process.env.DEMO_PASSWORD || randomBytes(18).toString('base64url');
if (password.length < 12) throw new Error('DEMO_PASSWORD must contain at least 12 characters.');
const app = createApp({ databasePath: process.env.DATABASE_PATH || './local-data/workwork.sqlite', secureCookies: false });
await app.listen(0, '127.0.0.1');
const url = `http://127.0.0.1:${app.server.address().port}`;
let cookie = '';
let csrf = '';
async function api(path, data) {
  const response = await fetch(url + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: url, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Demo creation failed');
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  if (result.csrfToken) csrf = result.csrfToken;
  return result;
}
const now = new Date();
const year = now.getUTCFullYear();
const month = now.getUTCMonth();
const day = (date) => date.toISOString().slice(0, 10);
const periodStart = day(new Date(Date.UTC(year, month, 1)));
const periodEnd = day(new Date(Date.UTC(year, month + 1, 0)));
const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();

try {
  await api('/api/signup', { companyName: 'Northline Manufacturing · Demo', name: 'Alex Kim', email: 'manager@demo.workwork.test', password });
  await api('/api/session');
  const { goal: delivery } = await api('/api/goals', { title: 'Improve on-time delivery', description: 'Complete inspection, packing and dispatch before each customer commitment.', metricName: 'On-time delivery', unit: '%', scope: 'All shipments', target: 98, baseline: 91, direction: 'at_least', periodStart, periodEnd });
  const { goal: quality } = await api('/api/goals', { title: 'Reduce quality defects', description: 'Improve inspection quality and investigate failed samples.', metricName: 'Defect rate', unit: '%', scope: 'Line A', target: 2, baseline: 4.1, direction: 'at_most', periodStart, periodEnd });
  await api('/api/goals', { title: 'Reduce production lead time', description: 'Shorten production lead time without bypassing quality checks.', metricName: 'Median production lead time', unit: 'days', scope: 'Line A', target: 5, direction: 'at_most', periodStart, periodEnd });
  await api('/api/requirements', { title: 'Shipment release standard', scope: 'All shipments', trigger: 'shipment', steps: ['Quality inspection', 'Packing completed', 'Dispatch confirmed'], effectiveFrom: periodStart });
  const first = await api('/api/logs', { text: 'Order DEMO-204: Completed quality inspection for the customer shipment.', result: 'Inspection checklist signed. No defects found in the sample.', occurredAt: at(5) });
  const caseId = first.log.caseId || first.cases?.[0]?.id;
  await api('/api/logs', { text: 'Packing completed for order DEMO-204. Dispatch is blocked while we wait for a collection slot.', result: '12 cartons are ready in the dispatch area.', nextDependency: 'Carrier must confirm collection before dispatch.', caseId, occurredAt: at(3) });
  await api('/api/logs', { text: 'Lot DEMO-318: Completed quality inspection. Two samples failed the surface finish check.', result: 'A quality issue remains open.', nextDependency: 'Process engineering needs to review the coating settings.', occurredAt: at(2) });
  await api('/api/logs', { text: 'Lot DEMO-318: We plan to run a new coating trial tomorrow.', occurredAt: at(1) });
  await api('/api/logs', { text: 'Updated the team handbook with the new visitor contact number.', result: 'The shared handbook has been updated.' });
  await api('/api/tasks', { title: 'Confirm carrier collection for DEMO-204', description: 'Call the carrier and record the agreed collection time.', goalId: delivery.id, caseId, dueDate: day(now) });
  await api('/api/tasks', { title: 'Investigate surface finish failures', description: 'Review coating settings and record the trial result.', goalId: quality.id, dueDate: day(new Date(now.getTime() + 86400000)) });
  await api('/api/measurements', { goalId: delivery.id, value: 94, unit: '%', scope: 'All shipments', observedAt: now.toISOString(), source: 'Synthetic shipping register: 47 of 50 shipments on time.' });
  await api('/api/measurements', { goalId: quality.id, value: 2.8, unit: '%', scope: 'Line A', observedAt: now.toISOString(), source: 'Synthetic quality register: 28 defects across 1,000 units.' });
  console.log('Synthetic demo company created. No existing company records were changed.');
  console.log('Email: manager@demo.workwork.test');
  console.log(`Password: ${password}`);
  console.log('Start the application with npm start, then sign in locally.');
} finally {
  await app.close();
}
