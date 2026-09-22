import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { openStore } from './store.mjs';
import { extractLog, getExtractionInfo } from './extractor.mjs';
import { buildReview as defaultBuildReview } from './analysis.mjs';
import { buildOperatingReview } from './operating-review.mjs';
import { buildProcessMaps } from './process-map.mjs';
import { hashPassword, verifyPassword, newToken, tokenHash, publicUser, sessionCookie, readSessionToken, createRateLimiter, equalSecret, SESSION_LIFETIME, INVITE_LIFETIME } from './auth.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD_TYPES = ['goals', 'requirements', 'tasks', 'logs', 'cases', 'measurements'];
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const logRevision = log => Number.isSafeInteger(log.revision) && log.revision > 0 ? log.revision : 1;
function historyEntry(log) {
  return { revision: logRevision(log), log, changedAt: log.updatedAt || log.createdAt,
    changedBy: { id: log.updatedBy || log.authorId, name: log.updatedByName || log.authorName || 'Team member' },
    reason: log.correctionReason || 'Original record' };
}

function text(value, field, { required = true, max = 500 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, `${field} is required.`);
    return '';
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, `${field} must be text${required ? ' and cannot be empty' : ''} (maximum ${max} characters).`);
  return value.trim();
}
function identifier(value, field, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const id = text(value, field, { max: 36 });
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) fail(400, `${field} is invalid.`);
  return id;
}
function date(value, field, { dateOnly = false, optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const input = text(value, field, { max: 35 });
  if (dateOnly ? !/^\d{4}-\d{2}-\d{2}$/.test(input) : !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(input)) fail(400, `${field} must be an ISO ${dateOnly ? 'date' : 'date or timestamp'}.`);
  const timestamp = Date.parse(input);
  const calendarDate = Date.parse(`${input.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || !Number.isFinite(calendarDate) || new Date(calendarDate).toISOString().slice(0, 10) !== input.slice(0, 10) || /T(?:2[4-9]|[3-9]\d):/.test(input)) fail(400, `${field} is not a valid date.`);
  return dateOnly ? input : new Date(timestamp).toISOString();
}
function number(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) fail(400, `${field} must be a finite number within ±1 quadrillion.`);
  return value;
}
function email(value) {
  const normalized = text(value, 'Email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) fail(400, 'Enter a valid email address.');
  return normalized;
}
function password(value) {
  // Do not trim passwords: spaces are part of the user's chosen secret.
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) fail(400, 'Password must be between 12 and 256 characters.');
  return value;
}
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'A JSON object is required.');
  const unknown = Object.keys(body).find(key => !allowed.includes(key));
  if (unknown) fail(400, `Unsupported field: ${unknown.slice(0, 60)}.`);
}
async function bodyOf(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) fail(415, 'Use application/json.');
  const chunks = []; let bytes = 0;
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 64 * 1024) fail(413, 'Request is too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Request body must be valid JSON.'); }
}

export function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const secureCookies = options.secureCookies ?? production;
  const originValue = options.appOrigin ?? process.env.APP_ORIGIN;
  let appOrigin = null;
  if (originValue) {
    const parsed = new URL(originValue);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('APP_ORIGIN must be a bare HTTP(S) origin, such as https://your-service.up.railway.app.');
    appOrigin = parsed.origin;
    if (production && parsed.protocol !== 'https:') throw new Error('Production APP_ORIGIN must use HTTPS.');
  }
  if (production && !appOrigin) throw new Error('Set APP_ORIGIN to the public HTTPS origin before starting in production.');
  const now = options.now ?? Date.now;
  const analyze = options.analyzeLog ?? extractLog;
  const review = options.buildReview ?? defaultBuildReview;
  const trustProxyHops = Number(options.trustProxyHops ?? process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5. Only trust verified proxy infrastructure.');
  const store = openStore(options.databasePath ?? process.env.DATABASE_PATH ?? resolve(ROOT, 'local-data/workwork.sqlite'));
  const limiter = createRateLimiter({ limit: options.authRateLimit ?? 120 });
  const identityLimiter = createRateLimiter({ limit: options.identityRateLimit ?? 10 });
  const logLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: options.companyLogLimit ?? 100 });
  const activeExtractions = new Map();
  let dummyPasswordHash;
  function json(response, status, payload, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(payload)); }
  function guardOrigin(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site requests are not allowed.');
    const origin = request.headers.origin;
    if (origin) {
      const expected = appOrigin || `${secureCookies ? 'https' : 'http'}://${request.headers.host}`;
      if (origin !== expected) fail(403, 'Request origin does not match this application.');
    }
  }
  function rateLimit(request, identity = null) {
    // Forwarding headers are ignored unless an operator explicitly trusts a bounded proxy chain.
    let address = request.socket.remoteAddress || 'unknown';
    if (trustProxyHops > 0) {
      const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map(value => value.trim());
      if (forwarded.length >= trustProxyHops) {
        const candidate = forwarded[forwarded.length - trustProxyHops];
        if (isIP(candidate)) address = candidate;
      }
    }
    if (!limiter.allow(address, now()) || identity && !identityLimiter.allow(identity.toLowerCase(), now())) fail(429, 'Too many authentication attempts. Please try again in 15 minutes.');
  }
  function requireRecord(user, type, id) { const record = store.get(user.companyId, type, id); if (!record) fail(404, `${type.slice(0, -1)} not found.`); return record; }
  function currentSession(request) {
    const token = readSessionToken(request);
    if (!token) return null;
    const session = store.session(tokenHash(token), now());
    if (!session) return null;
    const user = store.user(session.userId);
    return user ? { ...session, token, user } : null;
  }
  function startSession(request, response, user, status = 200) {
    const previousToken = readSessionToken(request);
    if (previousToken) store.deleteSession(tokenHash(previousToken));
    store.pruneSessions(now());
    const token = newToken(), csrfToken = newToken();
    store.saveSession({ tokenHash: tokenHash(token), userId: user.id, csrfToken, expiresAt: now() + SESSION_LIFETIME });
    json(response, status, { user: publicUser(user), company: store.company(user.companyId), csrfToken }, { 'Set-Cookie': sessionCookie(token, secureCookies) });
  }
  function stateFor(user) {
    return Object.fromEntries(RECORD_TYPES.map(type => [type, store.all(user.companyId, type)
      .map(record => type === 'logs' ? { ...record, revision: logRevision(record) } : record)]));
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader('Cache-Control', 'no-store');
    if (production) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method;
      if (method === 'GET' && path === '/api/health') return json(response, 200, { status: 'ok' });
      if (!path.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') fail(405, 'Method not allowed.');
        const asset = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] }[path];
        if (!asset) fail(404, 'Not found.');
        let content; try { content = await readFile(resolve(ROOT, 'public', asset[0])); } catch { fail(404, 'Application asset not found.'); }
        response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); return response.end(method === 'HEAD' ? undefined : content);
      }
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      if (unsafe) guardOrigin(request);
      const session = currentSession(request);
      if (method === 'GET' && path === '/api/session') return json(response, 200, session ? { user: publicUser(session.user), company: store.company(session.user.companyId), csrfToken: session.csrfToken } : { user: null });

      if (method === 'POST' && ['/api/signup', '/api/login', '/api/join'].includes(path)) {
        // Limit before parsing or hashing to bound expensive requests.
        rateLimit(request);
        const body = await bodyOf(request);
        if (path === '/api/signup') {
          fields(body, ['companyName', 'name', 'email', 'password']);
          const companyName = text(body.companyName, 'Company name', { max: 120 });
          const name = text(body.name, 'Name', { max: 120 }), address = email(body.email), secret = password(body.password);
          if (!identityLimiter.allow(address, now())) fail(429, 'Too many authentication attempts. Please try again in 15 minutes.');
          if (store.userByEmail(address)) fail(409, 'This email is already registered. Sign in instead.');
          const passwordHash = await hashPassword(secret);
          const user = store.transaction(() => {
            if (store.userByEmail(address)) fail(409, 'This email is already registered. Sign in instead.');
            const company = store.createCompany({ name: companyName, createdAt: new Date(now()).toISOString() });
            return store.createUser({ companyId: company.id, name, email: address, passwordHash, role: 'manager', createdAt: new Date(now()).toISOString() });
          });
          return startSession(request, response, user, 201);
        }
        if (path === '/api/login') {
          fields(body, ['email', 'password']);
          const address = email(body.email), secret = text(body.password, 'Password', { max: 256 });
          if (!identityLimiter.allow(address, now())) fail(429, 'Too many authentication attempts. Please try again in 15 minutes.');
          const user = store.userByEmail(address);
          dummyPasswordHash ??= hashPassword(newToken());
          const valid = await verifyPassword(typeof body.password === 'string' ? body.password : secret, user?.passwordHash || await dummyPasswordHash);
          if (!user || !valid) fail(401, 'Email or password is incorrect.');
          identityLimiter.clear(address);
          return startSession(request, response, user);
        }
        fields(body, ['token', 'name', 'password']);
        const token = text(body.token, 'Invitation token', { max: 100 });
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(400, 'Invitation is invalid or expired.');
        const name = text(body.name, 'Name', { max: 120 }), secret = password(body.password);
        const invitation = store.invitation(tokenHash(token), now());
        if (!invitation) fail(400, 'Invitation is invalid or expired.');
        if (store.userByEmail(invitation.email)) fail(409, 'This email is already registered. Sign in instead.');
        const passwordHash = await hashPassword(secret);
        const user = store.transaction(() => {
          const current = store.invitation(tokenHash(token), now());
          if (!current || !store.consumeInvite(tokenHash(token), now())) fail(400, 'Invitation is invalid or expired.');
          if (store.userByEmail(current.email)) fail(409, 'This email is already registered. Sign in instead.');
          return store.createUser({ companyId: current.companyId, name, email: current.email, passwordHash, role: 'member', createdAt: new Date(now()).toISOString() });
        });
        return startSession(request, response, user, 201);
      }
      if (!session) fail(401, 'Please sign in to continue.');
      const user = session.user;
      if (unsafe && !equalSecret(request.headers['x-csrf-token'], session.csrfToken)) fail(403, 'Your session token is missing or invalid. Refresh and try again.');
      if (method === 'POST' && path === '/api/logout') { store.deleteSession(tokenHash(session.token)); return json(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', secureCookies, true) }); }
      if (method === 'GET' && path === '/api/state') {
        const state = stateFor(user);
        const currentReview = review(state);
        const operating = buildOperatingReview(state, currentReview);
        return json(response, 200, { user: publicUser(user), company: store.company(user.companyId), csrfToken: session.csrfToken, ...state,
          review: currentReview, operating, processMaps: buildProcessMaps(state, currentReview, operating), extraction: getExtractionInfo() });
      }
      const historyMatch = path.match(/^\/api\/logs\/([^/]+)\/history$/);
      if (method === 'GET' && historyMatch) {
        const id = identifier(historyMatch[1], 'Work record ID');
        const current = requireRecord(user, 'logs', id);
        return json(response, 200, { logId: id, currentRevision: logRevision(current), revisions: [historyEntry(current), ...store.logHistory(user.companyId, id)] });
      }
      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      const logMatch = path.match(/^\/api\/logs\/([^/]+)$/);
      const routes = ['/api/goals', '/api/requirements', '/api/tasks', '/api/logs', '/api/measurements', '/api/invites'];
      if (!(method === 'POST' && routes.includes(path)) && !(method === 'PATCH' && (taskMatch || logMatch))) fail(404, 'API endpoint not found.');
      const managerOnly = method === 'POST' && path !== '/api/logs';
      if (managerOnly && user.role !== 'manager') fail(403, 'Only company managers can perform this action.');
      const body = await bodyOf(request);
      const stamp = new Date(now()).toISOString();
      const base = () => ({ id: randomUUID(), createdAt: stamp, authorId: user.id });
      if (path === '/api/invites') {
        fields(body, ['email']);
        const address = email(body.email);
        if (store.userByEmail(address)) fail(409, 'This email is already registered. Each account belongs to one company in this pilot.');
        const token = newToken(), expiresAt = now() + INVITE_LIFETIME;
        store.invite({ tokenHash: tokenHash(token), companyId: user.companyId, email: address, createdBy: user.id, expiresAt });
        return json(response, 201, { invite: { email: address, token, expiresAt: new Date(expiresAt).toISOString() } });
      }
      if (path === '/api/goals') {
        fields(body, ['title', 'description', 'metricName', 'unit', 'target', 'baseline', 'direction', 'periodStart', 'periodEnd', 'scope']);
        const goal = { ...base(), title: text(body.title, 'Title', { max: 200 }), description: text(body.description, 'Description', { required: false, max: 2000 }), metricName: text(body.metricName, 'Metric name', { max: 150 }), unit: text(body.unit, 'Unit', { max: 40 }), target: number(body.target, 'Target'), baseline: body.baseline === undefined || body.baseline === null ? null : number(body.baseline, 'Baseline'), direction: body.direction, periodStart: date(body.periodStart, 'Period start', { dateOnly: true }), periodEnd: date(body.periodEnd, 'Period end', { dateOnly: true }), scope: text(body.scope, 'Scope', { required: false, max: 300 }) || 'Company' };
        if (!['at_least', 'at_most'].includes(goal.direction)) fail(400, 'Direction must be at_least or at_most.');
        if (goal.periodEnd < goal.periodStart) fail(400, 'Period end must be on or after period start.');
        store.insert(user.companyId, 'goals', goal); return json(response, 201, { goal });
      }
      if (path === '/api/requirements') {
        fields(body, ['title', 'scope', 'trigger', 'steps', 'effectiveFrom']);
        if (!Array.isArray(body.steps) || body.steps.length < 1 || body.steps.length > 20) fail(400, 'Provide 1 to 20 required process steps.');
        const requirement = { ...base(), title: text(body.title, 'Title', { max: 200 }), scope: text(body.scope, 'Scope', { max: 300 }), trigger: text(body.trigger, 'Trigger', { max: 500 }), steps: body.steps.map(step => text(step, 'Step', { max: 300 })), effectiveFrom: date(body.effectiveFrom, 'Effective from', { dateOnly: true }), version: 1, authority: 'manager' };
        store.insert(user.companyId, 'requirements', requirement); return json(response, 201, { requirement });
      }
      if (path === '/api/tasks') {
        fields(body, ['title', 'description', 'goalId', 'caseId', 'dueDate']);
        const goalId = identifier(body.goalId, 'Goal ID', true), caseId = identifier(body.caseId, 'Case ID', true);
        if (goalId) requireRecord(user, 'goals', goalId); if (caseId) requireRecord(user, 'cases', caseId);
        const task = { ...base(), title: text(body.title, 'Title', { max: 200 }), description: text(body.description, 'Description', { required: false, max: 2000 }), goalId, caseId, dueDate: date(body.dueDate, 'Due date', { dateOnly: true, optional: true }), status: 'open', completedAt: null, completedBy: null };
        store.insert(user.companyId, 'tasks', task); return json(response, 201, { task });
      }
      if (taskMatch) {
        fields(body, ['status']);
        const id = identifier(taskMatch[1], 'Task ID'), task = requireRecord(user, 'tasks', id);
        if (!['open', 'done'].includes(body.status)) fail(400, 'Task status must be open or done.');
        const updated = { ...task, status: body.status, completedAt: body.status === 'done' ? stamp : null, completedBy: body.status === 'done' ? user.id : null, updatedAt: stamp };
        store.replace(user.companyId, 'tasks', updated); return json(response, 200, { task: updated });
      }
      if (path === '/api/measurements') {
        fields(body, ['goalId', 'value', 'unit', 'scope', 'observedAt', 'source']);
        const goalId = identifier(body.goalId, 'Goal ID'); requireRecord(user, 'goals', goalId);
        const measurement = { ...base(), goalId, value: number(body.value, 'Value'), unit: text(body.unit, 'Unit', { max: 40 }), scope: text(body.scope, 'Scope', { max: 300 }), observedAt: date(body.observedAt, 'Observed at'), source: text(body.source, 'Source', { max: 1000 }), entrySource: 'manual', authorName: user.name };
        if (Date.parse(measurement.observedAt) > now() + 60000) fail(400, 'An actual measurement cannot have a future observation time.');
        store.insert(user.companyId, 'measurements', measurement); return json(response, 201, { measurement });
      }
      let previous = null, expectedRevision = null, correctionReason = null;
      if (logMatch) {
        const id = identifier(logMatch[1], 'Work record ID');
        previous = requireRecord(user, 'logs', id);
        if (previous.authorId !== user.id && user.role !== 'manager') fail(403, 'Only the author or a company manager can correct this work record.');
        fields(body, ['expectedRevision', 'text', 'result', 'nextDependency', 'occurredAt', 'reason']);
        if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || body.expectedRevision >= Number.MAX_SAFE_INTEGER) fail(400, 'expectedRevision must be a positive integer.');
        expectedRevision = body.expectedRevision;
        if (logRevision(previous) !== expectedRevision) fail(409, 'This work record has changed. Refresh its current revision before saving your correction.');
        correctionReason = text(body.reason, 'Correction reason', { max: 500 });
      } else fields(body, ['text', 'result', 'nextDependency', 'caseId', 'occurredAt']);
      // An automatically inferred case ID is not an employee's continuation choice.
      // Older records can retain a continuation only when their extraction explicitly records that basis.
      const legacyContinuation = previous?.analysis?.events?.some(event => event.caseBasis === 'continuation' && event.caseId === previous.caseId) ? previous.caseId : null;
      const caseId = previous
        ? (Object.hasOwn(previous, 'continuationCaseId') ? previous.continuationCaseId : legacyContinuation)
        : identifier(body.caseId, 'Case ID', true);
      if (caseId) requireRecord(user, 'cases', caseId);
      const log = { ...(previous || base()), text: text(body.text, 'Work description', { max: 12000 }), result: text(body.result, 'Result/output', { required: false, max: 4000 }), nextDependency: text(body.nextDependency, 'Next dependency', { required: false, max: 2000 }),
        caseId: caseId || null, continuationCaseId: caseId || null, occurredAt: date(body.occurredAt, 'Occurrence time', { optional: true }),
        authorName: previous ? previous.authorName : user.name, revision: previous ? expectedRevision + 1 : 1 };
      // Extraction must see the corrected source, never the previous interpretation.
      delete log.analysis;
      if (log.occurredAt && Date.parse(log.occurredAt) > now() + 60000) fail(400, 'Actual occurrence time cannot be in the future. Describe future plans in the work entry instead.');
      if ((activeExtractions.get(user.companyId) || 0) >= 2) fail(429, 'Two work entries are already being processed for this company. Please try again shortly.');
      if (!logLimiter.allow(user.companyId, now())) fail(429, 'The pilot limit is 100 work entries per company per hour. Please try again later.');
      const context = { goals: store.all(user.companyId, 'goals'), cases: store.all(user.companyId, 'cases'), requirements: store.all(user.companyId, 'requirements') };
      activeExtractions.set(user.companyId, (activeExtractions.get(user.companyId) || 0) + 1);
      let analysis;
      try { analysis = await analyze(log, context); }
      finally { const count = (activeExtractions.get(user.companyId) || 1) - 1; if (count) activeExtractions.set(user.companyId, count); else activeExtractions.delete(user.companyId); }
      const saved = store.transaction(() => {
        if (previous) {
          const current = requireRecord(user, 'logs', previous.id);
          if (logRevision(current) !== expectedRevision) fail(409, 'This work record changed while the correction was being processed. Refresh its current revision before saving.');
          store.saveLogRevision(user.companyId, historyEntry(current));
          log.updatedAt = new Date(now()).toISOString();
          log.updatedBy = user.id;
          log.updatedByName = user.name;
          log.correctionReason = correctionReason;
        }
        const existingCases = store.all(user.companyId, 'cases');
        const byReference = new Map(existingCases.filter(item => item.reference).map(item => [item.reference.trim().toLocaleUpperCase('en-US'), item]));
        let unreferencedCase = caseId ? requireRecord(user, 'cases', caseId) : null;
        // Keep the same anonymous case for a correction to an anonymous record, but never
        // carry an inferred explicit reference forward as if it were user-supplied context.
        if (previous && !unreferencedCase && previous.caseId) {
          const oldCase = existingCases.find(item => item.id === previous.caseId);
          if (oldCase && !oldCase.reference) unreferencedCase = oldCase;
        }
        const touched = new Map();
        for (const event of analysis.events) {
          if (event.caseAmbiguous === true) { event.caseId = null; continue; }
          const reference = typeof event.caseReference === 'string' && event.caseReference.trim() ? event.caseReference.trim().slice(0, 120) : null;
          let assigned;
          if (reference) {
            const normalized = reference.toLocaleUpperCase('en-US');
            assigned = byReference.get(normalized);
            if (!assigned && unreferencedCase && !unreferencedCase.reference && !previous) {
              assigned = { ...unreferencedCase, reference };
              store.replace(user.companyId, 'cases', assigned);
              unreferencedCase = assigned; byReference.set(normalized, assigned);
            }
            if (!assigned) {
              assigned = { id: randomUUID(), title: reference, reference, createdAt: stamp };
              store.insert(user.companyId, 'cases', assigned); byReference.set(normalized, assigned);
            }
          } else {
            if (!unreferencedCase) {
              unreferencedCase = { id: randomUUID(), title: log.text.slice(0, 90), reference: null, createdAt: stamp };
              store.insert(user.companyId, 'cases', unreferencedCase);
            }
            assigned = unreferencedCase;
          }
          event.caseId = assigned.id;
          touched.set(assigned.id, assigned);
        }
        log.caseId = touched.size === 1 ? [...touched.keys()][0] : null;
        log.analysis = analysis;
        if (previous) {
          if (!store.replace(user.companyId, 'logs', log)) fail(409, 'This work record is no longer available for correction.');
        } else store.insert(user.companyId, 'logs', log);
        return [...touched.values()];
      });
      return json(response, previous ? 200 : 201, { log, cases: saved, analysis });
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'The request could not be completed. Please try again.' });
      if (!error.status) console.error('Request failed:', error.name, error.code || 'internal error');
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return {
    server, store,
    listen(port = options.port ?? Number(process.env.PORT || 3000), host = options.host ?? process.env.HOST ?? '127.0.0.1') {
      return new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolveListen(server.address()); }); });
    },
    async close() { if (server.listening) await new Promise((resolveClose, reject) => { server.close(error => error ? reject(error) : resolveClose()); server.closeIdleConnections(); }); store.close(); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const address = await app.listen();
  console.log(`Workwork Cloud listening on ${address.address}:${address.port}`);
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
