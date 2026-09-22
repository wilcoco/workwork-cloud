import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLog, buildReview } from '../server/analysis.mjs';
import { buildOperatingReview } from '../server/operating-review.mjs';
import { buildProcessMaps } from '../server/process-map.mjs';

const cases = [{ id: 'case-1', title: 'Order MAP-1', reference: 'MAP-1' }, { id: 'case-2', title: 'Order MAP-2', reference: 'MAP-2' }];
const goal = { id: 'goal-delivery', title: 'Improve on-time delivery', description: 'Shipment packing and QA release', metricName: 'On-time shipment',
  unit: '%', scope: 'Plant A', target: 95, direction: 'at_least', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
const requirement = { id: 'requirement-1', title: 'Shipment preparation', scope: 'All shipments', trigger: 'shipment', version: 2,
  effectiveFrom: '2026-09-01', steps: ['Inspection completed', 'Packing completed', 'QA approval confirmed', 'Dispatch confirmed'] };

function log(text, extra = {}) {
  const item = { id: 'log-1', text, caseId: 'case-1', occurredAt: '2026-09-21T08:00:00Z', createdAt: '2026-09-21T09:00:00Z',
    authorId: 'member-1', authorName: 'Alex', ...extra };
  item.analysis = analyzeLog(item, { goals: [goal], cases });
  return item;
}
function project(logs, extra = {}) {
  const state = { logs, goals: [goal], cases, requirements: [], tasks: [], measurements: [], ...extra };
  const review = buildReview(state), operating = buildOperatingReview(state, review);
  return { state, review, operating, processMaps: buildProcessMaps(state, review, operating) };
}
const mapFor = (result, id = 'case-1') => result.processMaps.cases.find(item => item.caseId === id);

test('an explicit prerequisite produces an exact two-source arrow between meaningful activity nodes', () => {
  const source = log('Inspected order MAP-1 shipment. Packed order MAP-1 shipment only after inspection.');
  const result = project([source]), map = mapFor(result);
  assert.deepEqual(map.nodes.map(node => node.label), ['Inspection', 'Packing']);
  assert.equal(map.edges.length, 1);
  const edge = map.edges[0];
  assert.equal(edge.kind, 'explicit_dependency');
  assert.equal(edge.from, map.nodes[0].id); assert.equal(edge.to, map.nodes[1].id);
  assert.deepEqual(edge.evidence.map(item => item.quote), source.analysis.events.map(event => event.sourceQuote));
  assert.ok(edge.evidence.every(item => item.logId === source.id && item.revision === 1 && item.authorName === 'Alex'));
  assert.match(edge.reason, /explicit prerequisite/i);
});

test('timestamps, entry order, authors, tasks and prescribed step order do not create observed arrows', () => {
  const result = project([
    log('Inspected order MAP-1 shipment.'),
    log('Packed order MAP-1 shipment.', { id: 'log-2', authorId: 'member-2', authorName: 'Robin', occurredAt: '2026-09-21T10:00:00Z' }),
    log('QA release approved for order MAP-1 shipment.', { id: 'log-3', occurredAt: '2026-09-21T11:00:00Z' }),
  ], { requirements: [requirement], tasks: [{ id: 'task-1', caseId: 'case-1', status: 'done' }] });
  const map = mapFor(result);
  assert.equal(map.nodes.filter(node => node.kind === 'activity').length, 3);
  assert.deepEqual(map.edges, []);
  assert.match(map.warnings.join(' '), /unconnected/);
  assert.equal(map.requirements[0].steps.length, 4);
});

test('planned and negated work stays accessible as source records, without completion or dependency arrows', () => {
  for (const description of ['Will pack order MAP-1 shipment only after inspection.', 'Did not pack order MAP-1 shipment only after inspection.']) {
    const result = project([log(`Inspected order MAP-1 shipment. ${description}`)]);
    const map = mapFor(result), node = map.nodes.find(item => item.evidence[0].quote === description);
    assert.equal(node.kind, 'record');
    assert.notEqual(node.status, 'completed');
    assert.deepEqual(map.edges, []);
  }
});

test('a completed inspection report is not performed inspection prerequisite evidence', () => {
  const result = project([log('Submitted an inspection report for order MAP-1 shipment. Packed order MAP-1 shipment only after inspection.')]);
  assert.deepEqual(mapFor(result).edges, []);
});

test('a later matching QA release produces a distinct resolution arrow with original and result revisions', () => {
  const result = project([
    log('Order MAP-1 shipment waiting for QA release.', { revision: 2 }),
    log('QA release approved for order MAP-1 shipment.', { id: 'approval', revision: 3, occurredAt: '2026-09-21T10:00:00Z', authorId: 'qa', authorName: 'Taylor' }),
  ]);
  const map = mapFor(result), edge = map.edges[0];
  assert.equal(map.edges.length, 1); assert.equal(edge.kind, 'resolution');
  assert.equal(map.nodes.find(node => node.id === edge.from).kind, 'waiting');
  assert.equal(map.nodes.find(node => node.id === edge.from).status, 'resolved');
  assert.equal(map.nodes.find(node => node.id === edge.to).label, 'QA release');
  assert.deepEqual(edge.evidence.map(item => item.revision), [2, 3]);
  assert.deepEqual(map.nodes.find(node => node.id === edge.to).participants, [{ id: 'qa', name: 'Taylor' }]);
});

test('unrelated approvals, undated claims and team completion do not create resolution arrows', () => {
  for (const completion of [
    log('Customer approval received for order MAP-1 shipment.', { id: 'later', occurredAt: '2026-09-21T10:00:00Z' }),
    log('QA release approved for order MAP-1 shipment.', { id: 'later', occurredAt: null }),
    log('QA release will be approved for order MAP-1 shipment.', { id: 'later', occurredAt: '2026-09-21T10:00:00Z' }),
  ]) {
    const result = project([log('Order MAP-1 shipment waiting for QA release.'), completion], { tasks: [{ id: 'task', caseId: 'case-1', status: 'done' }] });
    assert.deepEqual(mapFor(result).edges, []);
  }
});

test('correcting approved to pending removes the resolution and active completed node; current sources carry new revisions', () => {
  const waiting = log('Order MAP-1 shipment waiting for QA release.');
  const approved = log('QA release approved for order MAP-1 shipment.', { id: 'approval', revision: 1, occurredAt: '2026-09-21T10:00:00Z' });
  const before = project([waiting, approved]);
  assert.equal(mapFor(before).edges[0].kind, 'resolution');
  const corrected = log('Order MAP-1 shipment QA release still pending.', { ...approved, text: 'Order MAP-1 shipment QA release still pending.', revision: 2 });
  const after = project([waiting, corrected], { history: [{ revision: 1, log: approved }] });
  assert.deepEqual(mapFor(after).edges, []);
  assert.ok(mapFor(after).nodes.some(node => node.kind === 'waiting' && node.status === 'blocked'));
  assert.ok(mapFor(after).nodes.every(node => node.label !== 'QA release'));
  const current = mapFor(after).nodes.flatMap(node => node.evidence).filter(item => item.logId === 'approval');
  assert.equal(current.length, 1); assert.equal(current[0].revision, 2);
  assert.match(current[0].quote, /pending/);
  assert.ok(mapFor(after).nodes.flatMap(node => node.evidence).every(item => !item.quote.includes('QA release approved')));
});

test('required steps remain distinct from observations and carry only potential source matches', () => {
  const result = project([log('Order MAP-1 shipment: inspection completed. Packing completed.')], { requirements: [requirement] });
  const map = mapFor(result), required = map.requirements[0];
  assert.equal(required.version, 2); assert.equal(required.requirementId, requirement.id);
  assert.deepEqual(required.steps.map(step => step.status), ['evidence_found', 'evidence_found', 'not_evidenced', 'not_evidenced']);
  assert.ok(required.steps.slice(0, 2).every(step => step.nodeIds.length === 1 && step.evidence.length === 1));
  assert.ok(required.steps.slice(2).every(step => !step.nodeIds.length && !step.evidence.length));
  assert.ok(map.nodes.every(node => ['activity', 'waiting', 'record'].includes(node.kind)));
  assert.deepEqual(map.edges, []);
  assert.match(map.warnings.join(' '), /not a compliance determination/);
});

test('suggested objective links use only their exact validated source events, including newly relevant goals', () => {
  const mixed = log('Packed order MAP-1 shipment. Order MAP-1: calibrated an unrelated microscope.');
  mixed.analysis.associations = [];
  const result = project([mixed]);
  const map = mapFor(result), link = map.objectiveLinks.find(item => item.goalId === goal.id);
  assert.ok(link); assert.equal(link.evidence.length, 1);
  assert.match(link.evidence[0].quote, /Packed/);
  assert.equal(link.nodeIds.length, 1);
  assert.equal(map.nodes.find(node => node.id === link.nodeIds[0]).label, 'Packing');
  assert.match(link.reason, /not proof of contribution/);
});

test('unsupported objective, requirement and activity references cannot acquire convenient node evidence', () => {
  const result = project([log('Packed order MAP-1 shipment.')], { requirements: [requirement] });
  result.operating.cases[0].milestones.push({ key: 'made-up', label: 'Fake approval', state: 'reported_complete', evidence: [
    { logId: 'log-1', eventId: 'log-1:1', quote: 'QA release approved.', sourceField: 'text' },
  ] });
  result.review.cases[0].goalLinks[0].evidence = [{ logId: 'log-1', eventId: 'log-1:1', quote: 'Packed', sourceField: 'result' }];
  result.review.cases[0].requirements[0].steps[0].evidence = [{ logId: 'log-1', eventId: 'log-1:1', quote: 'Inspection completed.', sourceField: 'text' }];
  result.processMaps = buildProcessMaps(result.state, result.review, result.operating);
  const map = mapFor(result);
  assert.ok(map.nodes.every(node => !node.label.includes('Fake approval')));
  assert.deepEqual(map.objectiveLinks, []);
  assert.deepEqual(map.requirements[0].steps[0].evidence, []);
  assert.deepEqual(map.requirements[0].steps[0].nodeIds, []);
});

test('participants come from source authors, not colleague mentions or a generated author name', () => {
  const source = log('Packed order MAP-1 shipment with Morgan mentioned in a note.');
  const result = project([source]);
  result.review.cases[0].events[0].authorName = 'Invented author';
  const map = buildProcessMaps(result.state, result.review, result.operating).cases[0];
  assert.deepEqual(map.nodes[0].participants, [{ id: 'member-1', name: 'Alex' }]);
  assert.equal(map.nodes[0].evidence[0].authorName, 'Alex');
});

test('repeated activities retain event identity so source-specific edges do not become all-to-all arrows', () => {
  const result = project([
    log('Inspected order MAP-1 shipment. Packed order MAP-1 shipment only after inspection.'),
    log('Inspected order MAP-1 shipment.', { id: 'repeat-inspection', occurredAt: '2026-09-21T11:00:00Z' }),
  ]);
  const map = mapFor(result), inspections = map.nodes.filter(node => node.label === 'Inspection');
  assert.equal(inspections.length, 2);
  assert.equal(map.edges.length, 1);
  assert.equal(map.nodes.find(node => node.id === map.edges[0].from).evidence[0].logId, 'log-1');
});

test('current case identity, revision and source text guard against stale derived maps', () => {
  const old = project([log('Packed order MAP-1 shipment.', { revision: 1 })]);
  const correctedSameText = { ...old.state, logs: [log('Packed order MAP-1 shipment.', { revision: 2 })] };
  assert.deepEqual(buildProcessMaps(correctedSameText, old.review, old.operating).cases, []);
  const moved = project([log('Packed order MAP-2 shipment.', { caseId: 'case-2', revision: 2 })]);
  assert.equal(mapFor(moved), undefined);
  assert.equal(mapFor(moved, 'case-2').nodes.length, 1);
  const foreignState = { logs: [], cases: [], goals: [], requirements: [] };
  assert.deepEqual(buildProcessMaps(foreignState, old.review, old.operating).cases, []);
});

test('uncovered records remain readable and pure repeated projection returns stable IDs', () => {
  const result = project([log('Order MAP-1: investigated a new fixture option.')]);
  const before = JSON.stringify({ state: result.state, review: result.review, operating: result.operating });
  const map = mapFor(result);
  assert.equal(map.nodes.length, 1); assert.equal(map.nodes[0].kind, 'record');
  assert.equal(map.nodes[0].evidence[0].quote, result.state.logs[0].text);
  assert.deepEqual(buildProcessMaps(result.state, result.review, result.operating), result.processMaps);
  assert.equal(JSON.stringify({ state: result.state, review: result.review, operating: result.operating }), before);
  assert.deepEqual(buildProcessMaps(null, null, null), { version: 1, cases: [] });
});
