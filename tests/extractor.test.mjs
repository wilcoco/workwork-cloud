import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLog, getExtractionInfo } from '../server/extractor.mjs';

const log = { id: 'log-1', text: 'Completed quality inspection.', result: '', nextDependency: '' };
const env = { WORKWORK_AI_MODE: 'openai', OPENAI_API_KEY: 'test-key-not-real' };
const successful = (events) => async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ events }) }] }] }) });
const event = { sourceQuote: log.text, sourceField: 'text', action: 'Quality inspection', status: 'completed', caseReference: null, goalIds: [] };

test('baseline mode never calls an external provider', async () => {
  assert.equal(getExtractionInfo({}).mode, 'rules');
  const result = await extractLog(log, {}, { env: {}, fetchImpl: () => { throw new Error('must not be called'); } });
  assert.equal(result.engine, 'rules');
  assert.ok(result.events.length);
});
test('provider request uses structured schema, scoped goals and disabled response storage', async () => {
  const result = await extractLog(log, { goals: [{ id: 'g1', title: 'Quality' }] }, { env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(JSON.parse(body.input).goals[0].id, 'g1');
    return successful([{ ...event, goalIds: ['g1'] }])();
  } });
  assert.equal(result.engine, 'openai');
  assert.equal(result.associations[0].confidence, 'suggested');
});
test('fabricated evidence and unknown goal IDs fall back without losing log extraction', async () => {
  for (const invalid of [{ ...event, sourceQuote: 'Revenue increased by 25%.' }, { ...event, goalIds: ['other-company-goal'] }, { ...event, caseReference: 'invented' }]) {
    const result = await extractLog(log, {}, { env, fetchImpl: successful([invalid]) });
    assert.equal(result.engine, 'rules');
    assert.match(result.warnings.join(' '), /could not be validated/);
  }
});
test('provider failures return useful baseline, without echoing API keys or response bodies', async () => {
  const result = await extractLog(log, {}, { env, fetchImpl: async () => { throw new Error('secret provider response'); } });
  assert.equal(result.engine, 'rules');
  assert.doesNotMatch(JSON.stringify(result), /secret provider|test-key/);
});

test('missing and whitespace-only provider keys never trigger external requests', async () => {
  for (const key of [undefined, '', '   ', null]) {
    const settings = { WORKWORK_AI_MODE: 'openai', OPENAI_API_KEY: key };
    assert.equal(getExtractionInfo(settings).mode, 'rules');
    const result = await extractLog(log, {}, { env: settings, fetchImpl: () => { assert.fail('No external call without a key'); } });
    assert.equal(result.engine, 'rules');
  }
});

test('malformed provider event structures and duplicate evidence safely fall back', async () => {
  for (const events of [[null], [[]], [{ ...event, sourceField: undefined }], [{ ...event, sourceField: 'companyId' }], [{ ...event, goalIds: 'g1' }], [{ ...event, status: 'approved' }], [{ ...event, companyId: 'foreign-company' }], Array(31).fill(event), [event, event], []]) {
    const result = await extractLog(log, {}, { env, fetchImpl: successful(events) });
    assert.equal(result.engine, 'rules');
    assert.ok(result.events.length > 0);
  }
});

test('provider timeout, non-OK, incomplete and malformed response envelopes preserve baseline evidence', async () => {
  for (const provider of [
    async () => { throw new DOMException('Timeout', 'TimeoutError'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) }),
    async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No output' }] }] }) }),
    async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'not JSON' }] }] }) }),
    async () => ({ ok: true, json: async () => ({ status: 'completed', output: {} }) }),
  ]) {
    const result = await extractLog(log, {}, { env, fetchImpl: provider });
    assert.equal(result.engine, 'rules');
    assert.match(result.warnings.join(' '), /baseline extraction/);
  }
});

test('provider cannot promote future, negative, or dependency evidence to completed work', async () => {
  for (const [text, quote, expected] of [
    ['We will complete quality inspection tomorrow.', 'quality inspection', 'planned'],
    ['We did not complete quality inspection.', 'quality inspection', 'recorded'],
    ['Waiting for quality inspection.', 'quality inspection', 'blocked'],
  ]) {
    const result = await extractLog({ ...log, text }, {}, { env, fetchImpl: successful([{ ...event, sourceQuote: quote }]) });
    assert.equal(result.engine, 'openai'); assert.equal(result.events[0].status, expected);
  }
  const duplicate = { ...log, nextDependency: log.text };
  const next = await extractLog(duplicate, {}, { env, fetchImpl: successful([{ ...event, sourceField: 'nextDependency' }]) });
  assert.equal(next.events[0].sourceField, 'nextDependency'); assert.equal(next.events[0].status, 'recorded');
  const result = await extractLog({ ...log, result: 'Inspection report submitted.' }, { goals: [{ id: 'g1' }] }, { env, fetchImpl: successful([{ ...event, sourceField: 'result', sourceQuote: 'Inspection report submitted.', goalIds: ['g1'] }]) });
  assert.equal(result.events[0].sourceField, 'result'); assert.equal(result.associations[0].sourceField, 'result');
});

test('ambiguous provider events cannot be attached to a continuation or a chosen reference', async () => {
  const mixed = { ...log, text: 'Compared order DEMO-11 with order DEMO-12.', caseId: 'case-11' };
  const context = { cases: [{ id: 'case-11', reference: 'DEMO-11' }] };
  const result = await extractLog(mixed, context, { env, fetchImpl: successful([{ ...event, sourceQuote: mixed.text }]) });
  assert.equal(result.engine, 'openai'); assert.equal(result.events[0].caseAmbiguous, true);
  assert.equal(result.events[0].caseId, null); assert.equal(result.events[0].caseReference, null);
  const selected = await extractLog(mixed, context, { env, fetchImpl: successful([{ ...event, sourceQuote: mixed.text, caseReference: 'DEMO-11' }]) });
  assert.equal(selected.engine, 'rules'); assert.equal(selected.events[0].caseAmbiguous, true);
});

test('provider omission retains source reference, case-insensitive IDs and paragraph scope', async () => {
  const referenced = { ...log, text: 'Order demo-17: inspection completed.', caseId: 'other-case' };
  const context = { cases: [{ id: 'known-case', reference: 'DEMO-17' }, { id: 'other-case', reference: 'DEMO-99' }] };
  const result = await extractLog(referenced, context, { env, fetchImpl: successful([{ ...event, sourceQuote: referenced.text, caseReference: 'DEMO-17' }]) });
  assert.equal(result.engine, 'openai'); assert.equal(result.events[0].caseId, 'known-case'); assert.equal(result.events[0].caseReference, 'DEMO-17');
  const omitted = await extractLog(referenced, context, { env, fetchImpl: successful([{ ...event, sourceQuote: referenced.text }]) });
  assert.equal(omitted.events[0].caseReference, 'DEMO-17'); assert.equal(omitted.events[0].caseId, 'known-case');
  const paragraph = { ...log, text: 'Lot DEMO-17: inspection completed; packing completed.' };
  const inherited = await extractLog(paragraph, context, { env, fetchImpl: successful([{ ...event, sourceQuote: 'packing completed.' }]) });
  assert.equal(inherited.engine, 'openai'); assert.equal(inherited.events[0].caseReference, 'DEMO-17'); assert.equal(inherited.events[0].caseBasis, 'entry_context');
});

test('provider associations are limited to the 50 goal definitions actually sent', async () => {
  const goals = Array.from({ length: 51 }, (_, index) => ({ id: `goal-${index}`, title: 'Quality' }));
  const result = await extractLog(log, { goals }, { env, fetchImpl: successful([{ ...event, goalIds: ['goal-50'] }]) });
  assert.equal(result.engine, 'rules');
});

test('optional-field provider events preserve a single clearly scoped narrative case', async () => {
  const input = { ...log, text: 'Order DEMO-81: inspection completed.', result: 'Inspection report submitted.', nextDependency: 'Waiting for dispatch approval.' };
  const context = { cases: [{ id: 'known-case', reference: 'DEMO-81' }] };
  const result = await extractLog(input, context, { env, fetchImpl: successful([
    { ...event, sourceQuote: input.result, sourceField: 'result' },
    { ...event, sourceQuote: input.nextDependency, sourceField: 'nextDependency', status: 'blocked' },
  ]) });
  assert.equal(result.engine, 'openai');
  assert.ok(result.events.every(item => item.caseReference === 'DEMO-81' && item.caseId === 'known-case'));
});
