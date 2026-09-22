import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLog, buildReview } from '../server/analysis.mjs';
import { buildOperatingReview } from '../server/operating-review.mjs';

const goal = { id: 'g-delivery', title: 'Improve on-time delivery', description: 'Shipment inspection packing QA release and dispatch',
  metricName: 'On-time shipment', target: 95, unit: '%', direction: 'at_least', scope: 'Plant A', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
const cases = [1, 2, 3, 4].map(number => ({ id: `c-${number}`, title: `Order DEMO-${number}`, reference: `DEMO-${number}` }));

function record(text, { id = 'l-1', caseId = 'c-1', occurredAt = '2026-09-20T09:00:00Z', authorId = 'u-1', authorName = 'Casey', ...rest } = {}) {
  const log = { id, caseId, text, occurredAt, authorId, authorName, createdAt: '2026-09-22T09:00:00Z', ...rest };
  log.analysis = analyzeLog(log, { goals: [goal], cases });
  return log;
}
function inspect(logs, extra = {}) {
  const state = { goals: [goal], cases, logs, tasks: [], requirements: [], measurements: [], ...extra };
  return { state, review: buildReview(state), operating: buildOperatingReview(state, buildReview(state)) };
}
const wait = extra => record('Order DEMO-1 shipment is waiting for QA release.', extra);
const release = extra => record('QA release approved for order DEMO-1 shipment.', { id: 'release', occurredAt: '2026-09-20T10:00:00Z', ...extra });
const current = output => output.operating.cases.find(item => item.caseId === 'c-1');

test('three authors become one sourced case statement, independent measured result and proposed action', () => {
  const logs = [record('Order DEMO-1 shipment: inspection completed. Colleague Pat will help.', { id: 'inspection', authorId: 'u-1', authorName: 'Lee' }),
    record('Packing completed for order DEMO-1 shipment.', { id: 'packing', authorId: 'u-2', authorName: 'Morgan' }),
    wait({ id: 'wait', authorId: 'u-3', authorName: 'Jamie' })];
  const result = inspect(logs, { measurements: [{ id: 'm-1', goalId: goal.id, value: 89, unit: '%', scope: 'Plant A', observedAt: '2026-09-20', source: 'Dispatch register: 89 of 100 shipments' }] });
  assert.deepEqual(current(result).participants, [{ id: 'u-1', name: 'Lee' }, { id: 'u-2', name: 'Morgan' }, { id: 'u-3', name: 'Jamie' }]);
  assert.match(current(result).statement, /inspection, packing/);
  assert.match(current(result).statement, /Waiting reported: QA release approval/);
  assert.equal(current(result).readiness, 'needs_attention');
  assert.deepEqual(current(result).goalIds, [goal.id]);
  const attention = result.operating.attention.find(item => item.kind === 'waiting');
  assert.equal(attention.evidence[0].quote, logs[2].text);
  assert.equal(attention.evidence[0].authorName, 'Jamie');
  assert.equal(attention.suggestedTask.caseId, 'c-1');
  assert.equal(attention.suggestedTask.goalId, goal.id);
  assert.equal(result.operating.attention.find(item => item.kind === 'measurement_gap').caseId, null);
  assert.equal(result.state.tasks.length, 0);
});

test('strictly later matching occurrence resolves a wait, preserving both sources and readiness limit', () => {
  const result = inspect([wait(), release()]);
  const blocker = current(result).blockers[0];
  assert.equal(blocker.status, 'resolved');
  assert.equal(blocker.openedBy.logId, 'l-1');
  assert.equal(blocker.resolvedBy.logId, 'release');
  assert.match(current(result).statement, /overall case readiness is not established/);
  assert.equal(result.operating.attention.filter(item => item.kind === 'waiting').length, 0);
  assert.deepEqual(result.operating.goalSummaries[0].needsAttentionCaseIds, []);
});

test('completed team follow-up never clears a wait', () => {
  const result = inspect([wait()], { tasks: [{ id: 'open', caseId: 'c-1', goalId: goal.id, status: 'open' }, { id: 'done', caseId: 'c-1', goalId: goal.id, status: 'done' }] });
  assert.equal(current(result).blockers[0].status, 'open');
  assert.deepEqual(current(result).openTaskIds, ['open']);
  assert.deepEqual(result.operating.attention.find(item => item.kind === 'waiting').existingTaskIds, ['open']);
});

test('unrelated, negative, rejected, contextual and planned completion claims cannot clear QA waiting', () => {
  for (const text of ['Customer approval received for order DEMO-1 shipment.',
    'Budget approval granted for order DEMO-1 shipment.', 'QA release document submitted for order DEMO-1 shipment.',
    'QA release was not approved for order DEMO-1 shipment.', 'QA release approved request was rejected for order DEMO-1 shipment.',
    'QA release will be approved for order DEMO-1 shipment.', 'QA release approval planned for order DEMO-1 shipment.',
    'QA release failed for order DEMO-1 shipment.', 'Packing completed for order DEMO-1 shipment.',
    'QA approved the maintenance budget for order DEMO-1 shipment.',
    'QA released a new test method for order DEMO-1 shipment.',
    'QA release approved and then rejected for order DEMO-1 shipment.',
    'QA release approved if the inspection passes for order DEMO-1 shipment.',
    'QA release approved for order DEMO-1 shipment?',
    'QA released shipment report for order DEMO-1.',
    'Shipment report documented the QA release process for order DEMO-1.']) {
    const result = inspect([wait(), release({ text })]);
    assert.equal(current(result).blockers[0].status, 'open', text);
    assert.equal(current(result).blockers[0].resolvedBy, null, text);
  }
});

test('carrier booking confirmation is not collection; actual matching collection resolves it', () => {
  const waiting = record('Order DEMO-1 shipment waiting for carrier collection.');
  for (const text of ['Carrier collection confirmed for order DEMO-1 shipment.', 'Carrier collection booking confirmed for order DEMO-1 shipment.']) {
    const result = inspect([waiting, release({ text })]);
    assert.equal(current(result).blockers[0].status, 'open', text);
  }
  const result = inspect([waiting, release({ text: 'Carrier collection completed for order DEMO-1 shipment.' })]);
  assert.equal(current(result).blockers[0].key, 'carrier_collection');
  assert.equal(current(result).blockers[0].status, 'resolved');
});

test('literal material arrival and revised drawing receipt resolve their own explicit waits', () => {
  for (const [waiting, completion, key] of [
    ['Waiting for material arrival.', 'Materials arrived.', 'material_arrival'],
    ['Waiting for revised drawing.', 'Revised drawing received.', 'revised_drawing'],
    ['자재 입고 대기.', '자재 입고 완료.', 'material_arrival'],
    ['수정 도면 대기.', '수정 도면 수령 완료.', 'revised_drawing'],
  ]) {
    const result = inspect([record(`Order DEMO-1: ${waiting}`), release({ text: `Order DEMO-1: ${completion}` })]);
    assert.equal(current(result).blockers[0].key, key);
    assert.equal(current(result).blockers[0].status, 'resolved', completion);
  }
});

test('quality inspection is a performed activity and no-issues release is positive evidence', () => {
  const result = inspect([record('Completed quality inspection for order DEMO-1 shipment.'), wait({ id: 'wait' }),
    release({ text: 'QA release approved with no issues for order DEMO-1 shipment.' })]);
  assert.ok(current(result).milestones.some(item => item.key === 'inspection'));
  assert.equal(current(result).blockers[0].status, 'resolved');
  assert.match(current(result).statement, /QA release/);
  assert.doesNotMatch(current(result).statement, /qa release/);
});

test('explicit dispatch confirmation is reported evidence, while booking and planned confirmations are not dispatch', () => {
  const text = 'Dispatch confirmed for order DEMO-1 shipment.';
  const log = record(text);
  assert.equal(log.analysis.events[0].status, 'completed');
  const milestone = current(inspect([log])).milestones.find(item => item.key === 'dispatch');
  assert.equal(milestone.state, 'reported_complete');
  assert.equal(milestone.evidence[0].quote, text);
  for (const unsupported of ['Dispatch booking confirmed for order DEMO-1 shipment.',
    'Dispatch plan confirmed for order DEMO-1 shipment.', 'Dispatch confirmed as a booking for order DEMO-1 shipment.',
    'Dispatch confirmed for tomorrow for order DEMO-1 shipment.', 'Dispatch was not confirmed for order DEMO-1 shipment.']) {
    assert.equal(current(inspect([record(unsupported)])).milestones.some(item => item.key === 'dispatch'), false, unsupported);
  }
});

test('a next-dependency entry and completion on a different case do not resolve the source case', () => {
  const dependency = record('Order DEMO-1 shipment is being reviewed.', { id: 'next', nextDependency: 'QA release approved for order DEMO-1 shipment.', occurredAt: '2026-09-20T11:00:00Z' });
  const other = release({ id: 'other', caseId: 'c-2', text: 'QA release approved for order DEMO-2 shipment.' });
  const result = inspect([wait(), dependency, other]);
  assert.equal(current(result).blockers[0].status, 'open');
  assert.equal(current(result).milestones.filter(item => item.key === 'release').length, 0);
});

test('backdated completion entered later, tied times and undated evidence preserve uncertainty', () => {
  const earlier = inspect([wait(), release({ occurredAt: '2026-09-20T08:00:00Z', createdAt: '2026-09-23T00:00:00Z' })]);
  assert.equal(current(earlier).blockers[0].status, 'open');
  for (const occurredAt of ['2026-09-20T09:00:00Z', null]) {
    const result = inspect([wait(), release({ occurredAt })]);
    assert.equal(current(result).blockers[0].status, 'uncertain');
    assert.equal(current(result).blockers[0].resolvedBy, null);
  }
  const noTime = inspect([wait({ occurredAt: null }), release()]);
  assert.equal(current(noTime).blockers[0].status, 'uncertain');
  assert.equal(current(noTime).blockers[0].resolvedBy, null);
});

test('a later waiting report reopens the topic while retaining resolved history', () => {
  const result = inspect([wait(), release(), wait({ id: 'reopen', occurredAt: '2026-09-20T11:00:00Z' })]);
  assert.deepEqual(current(result).blockers.map(blocker => blocker.status), ['resolved', 'open']);
  assert.equal(current(result).blockers[1].openedBy.logId, 'reopen');
  assert.equal(result.operating.attention.filter(item => item.kind === 'waiting').length, 1);
});

test('same-time conflicting claims cannot be ordered by event or record IDs', () => {
  for (const logs of [[wait(), release({ occurredAt: '2026-09-20T09:00:00Z' })], [release({ occurredAt: '2026-09-20T09:00:00Z' }), wait()]]) {
    assert.equal(current(inspect(logs)).blockers[0].status, 'uncertain');
  }
});

test('unknown waiting text remains unresolved and source-backed without inventing a matching topic', () => {
  const result = inspect([record('Order DEMO-1 shipment is waiting for the special jig.'), release()]);
  const blocker = current(result).blockers[0];
  assert.match(blocker.key, /^unknown:/);
  assert.equal(blocker.status, 'open');
  assert.match(blocker.openedBy.quote, /special jig/);
  assert.equal(result.operating.patterns.length, 0);
});

test('suggested follow-up fields fit task limits without truncating original evidence', () => {
  const text = `Order DEMO-1 shipment is waiting for ${'a custom component detail '.repeat(120)}.`;
  const result = inspect([record(text)]);
  const attention = result.operating.attention.find(item => item.kind === 'waiting');
  assert.ok(attention.suggestedTask.title.length <= 200);
  assert.ok(attention.suggestedTask.description.length <= 2000);
  assert.equal(attention.evidence[0].quote, text);
  assert.equal(current(result).blockers[0].openedBy.quote, text);
});

test('bounded Korean topics resolve only explicit later matching completion', () => {
  const result = inspect([record('주문 DEMO-1 품질 승인 대기 중입니다.'),
    record('주문 DEMO-1 품질 승인 완료.', { id: 'korean-release', occurredAt: '2026-09-20T10:00:00Z' })]);
  assert.equal(current(result).blockers[0].key, 'qa_release');
  assert.equal(current(result).blockers[0].status, 'resolved');
  const rejected = inspect([record('주문 DEMO-1 품질 승인 대기.'), record('주문 DEMO-1 품질 승인 반려.', { id: 'rejected', occurredAt: '2026-09-20T10:00:00Z' })]);
  assert.equal(current(rejected).blockers[0].status, 'open');
});

test('contextual nouns do not become completed activities', () => {
  const result = inspect([record('Order DEMO-1 shipment: submitted a report about inspection, rework and packing.')]);
  assert.deepEqual(current(result).milestones, []);
  const future = inspect([record('Order DEMO-1 shipment: packing will be completed tomorrow.')]);
  assert.deepEqual(current(future).milestones, []);
});

test('historical patterns count distinct cases with explicit current goal denominator including resolved waits', () => {
  const logs = [wait(), release(), wait({ id: 'repeat', occurredAt: '2026-09-20T08:50:00Z' }),
    record('Order DEMO-2 shipment waiting for QA release.', { id: 'w-2', caseId: 'c-2' }),
    record('Order DEMO-3 shipment: packing completed.', { id: 'p-3', caseId: 'c-3' }),
    record('Order DEMO-4 shipment: inspection completed.', { id: 'i-4', caseId: 'c-4' })];
  const result = inspect(logs);
  const pattern = result.operating.patterns.find(item => item.goalId === goal.id);
  assert.equal(pattern.count, 2); assert.equal(pattern.total, 4);
  assert.deepEqual(pattern.caseIds, ['c-1', 'c-2']);
  assert.deepEqual(pattern.cohortCaseIds, ['c-1', 'c-2', 'c-3', 'c-4']);
  assert.match(pattern.cohortLabel, /suggested relevance/);
  assert.equal(pattern.evidence.length, 2);
  const discovered = result.operating.processPatterns[0];
  assert.equal(discovered.caseCount, 4);
  assert.ok(discovered.activities.some(activity => activity.key === 'packing' && activity.count === 1));
  assert.ok(discovered.activities.every(activity => activity.evidence.length));
  assert.equal('sequence' in discovered, false);
});

test('unrelated goals do not create a company-wide recurring wait pattern', () => {
  const otherGoal = { ...goal, id: 'g-other', title: 'Equipment availability', description: 'Maintenance repair', metricName: 'Availability' };
  const state = { goals: [goal, otherGoal], cases, logs: [wait(), record('Order DEMO-2 waiting for QA release.', { id: 'second', caseId: 'c-2' })] };
  const review = buildReview(state);
  review.cases[0].goalLinks = [{ goalId: goal.id }];
  review.cases[1].goalLinks = [{ goalId: otherGoal.id }];
  const result = buildOperatingReview(state, review);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.processPatterns, []);
});

test('unlinked work and absent measurements remain separate kinds of attention', () => {
  const result = inspect([record('Order DEMO-1: special jig awaiting technical advice.')]);
  assert.ok(result.operating.attention.some(item => item.kind === 'unlinked_work' && item.caseId === 'c-1'));
  const missing = result.operating.attention.find(item => item.kind === 'measurement_gap');
  assert.equal(missing.caseId, null); assert.deepEqual(missing.evidence, []);
  assert.match(missing.detail, /No sourced measurement/);
});

test('invalid raw analysis evidence excluded by buildReview cannot enter operating interpretation', () => {
  const log = wait();
  log.analysis.events.push({ id: `${log.id}:forged`, sourceQuote: 'QA release approved.', sourceField: 'text', caseId: 'c-1', status: 'completed' });
  const result = inspect([log]);
  assert.equal(current(result).blockers[0].status, 'open');
  assert.ok(current(result).milestones.every(item => item.key !== 'release'));
});

test('projection is pure, repeatable and returns contract arrays with missing input', () => {
  const state = { goals: [goal], cases, logs: [wait(), release()] };
  const review = buildReview(state);
  const before = JSON.stringify({ state, review });
  assert.deepEqual(buildOperatingReview(state, review), buildOperatingReview(state, review));
  assert.equal(JSON.stringify({ state, review }), before);
  const empty = buildOperatingReview(null, null);
  assert.equal(empty.version, 1);
  for (const field of ['cases', 'goalSummaries', 'attention', 'patterns', 'processPatterns', 'warnings']) assert.ok(Array.isArray(empty[field]));
});
