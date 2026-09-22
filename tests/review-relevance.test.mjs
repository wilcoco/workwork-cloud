import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLog, buildReview } from '../server/analysis.mjs';

test('a new objective can relate to existing evidence without rewriting the source extraction', () => {
  const log = { id: 'log-1', text: 'Order QA-1: Completed quality inspection.', authorName: 'Inspector', authorId: 'user-1', createdAt: '2026-09-22T09:00:00Z', occurredAt: '2026-09-22T08:00:00Z' };
  log.analysis = analyzeLog(log);
  for (const event of log.analysis.events) event.caseId = 'case-1';
  const original = JSON.stringify(log);
  const state = { cases: [{ id: 'case-1', title: 'QA-1', reference: 'QA-1' }], logs: [log] };
  assert.equal(buildReview(state).cases[0].goalLinks.length, 0);
  const goal = { id: 'goal-1', title: 'Improve quality', description: 'Reduce quality defects', metricName: 'Defect rate', unit: '%', scope: 'Company', target: 2, direction: 'at_most', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
  const updated = buildReview({ ...state, goals: [goal] });
  assert.equal(updated.cases[0].goalLinks[0].goalId, goal.id);
  assert.equal(updated.cases[0].goalLinks[0].confidence, 'suggested');
  assert.deepEqual(updated.cases[0].goalLinks[0].evidence, [{ logId: log.id, eventId: `${log.id}:1`, quote: log.analysis.events[0].sourceQuote, sourceField: 'text', revision: 1 }]);
  assert.equal(updated.metrics[0].actual, null);
  assert.equal(JSON.stringify(log), original);
});

test('live relevance never uses fabricated event quotes or removed objective IDs', () => {
  const goal = { id: 'current', title: 'Improve quality' };
  const log = { id: 'l', text: 'Updated the phone directory.', analysis: { events: [{ id: 'l:1', sourceQuote: 'Completed quality inspection.', status: 'completed', caseId: 'c' }], associations: [{ eventId: 'l:1', goalId: 'removed', sourceQuote: 'Completed quality inspection.' }] } };
  const result = buildReview({ goals: [goal], cases: [{ id: 'c' }], logs: [log] });
  assert.deepEqual(result.cases, [], 'A case without current valid evidence cannot become a live finding.');
  assert.equal(result.summary.caseCount, 0);
});

test('re-attributed current evidence removes the former case from live review', () => {
  const log = { id: 'corrected', revision: 2, text: 'Inspected order NEW-2.', authorId: 'u', authorName: 'Inspector', occurredAt: '2026-09-22T09:00:00Z' };
  log.analysis = analyzeLog(log);
  for (const event of log.analysis.events) event.caseId = 'new-case';
  const state = { logs: [log], cases: [{ id: 'old-case', title: 'OLD-1' }, { id: 'new-case', title: 'NEW-2' }], goals: [{ id: 'goal', title: 'Improve inspection quality' }] };
  const review = buildReview(state);
  assert.deepEqual(review.cases.map(item => item.id), ['new-case']);
  assert.equal(review.cases[0].goalLinks[0].evidence[0].revision, 2);
  assert.equal(review.summary.caseCount, 1);
});
