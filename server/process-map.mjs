/**
 * A source-backed projection, not a workflow designer or execution engine.
 * Activity nodes retain event identity; no timestamp, author order or required
 * step order is allowed to manufacture an observed relationship.
 */
const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const unique = values => [...new Set(values)];
const SOURCE_FIELDS = new Set(['text', 'result', 'nextDependency']);
const SOURCE_STATES = new Set(['completed', 'in_progress', 'planned', 'blocked', 'recorded']);
const revisionOf = log => Number.isSafeInteger(log?.revision) && log.revision > 0 ? log.revision : 1;
const short = (value, size = 160) => text(value).length <= size ? text(value) : `${text(value).slice(0, size - 1).trimEnd()}…`;

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10) ? parsed : null;
}

function dedupeEvidence(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = `${value.logId}:${value.eventId}:${value.revision}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** All arguments must come from the same authenticated company state. */
export function buildProcessMaps(state = {}, review = {}, operating = {}) {
  const result = { version: 1, cases: [] };
  const logs = new Map(array(state?.logs).filter(log => log?.id).map(log => [log.id, log]));
  const caseIds = new Set(array(state?.cases).map(item => item?.id).filter(Boolean));
  const goalIds = new Set(array(state?.goals).map(item => item?.id).filter(Boolean));
  const requirementIds = new Set(array(state?.requirements).map(item => item?.id).filter(Boolean));
  const operations = new Map(array(operating?.cases).filter(item => item?.caseId).map(item => [item.caseId, item]));

  for (const reviewed of array(review?.cases)) {
    if (!reviewed || !caseIds.has(reviewed.id)) continue;
    const warnings = [
      'Nodes describe source records. Arrows show only an explicitly stated prerequisite or a supported later resolution, never timing alone.',
      'Required-step matches are potential evidence, not a compliance determination. Objective links suggest relevance, not business impact.',
    ];
    const events = new Map();
    for (const event of array(reviewed.events)) {
      const log = logs.get(event?.logId);
      if (!log || !event?.id || !event.id.startsWith(`${log.id}:`) || event.caseId !== reviewed.id
        || !SOURCE_FIELDS.has(event.sourceField) || !text(event.sourceQuote).trim()
        || !text(log[event.sourceField]).includes(event.sourceQuote)
        || (event.revision !== undefined && event.revision !== revisionOf(log))) {
        warnings.push('A record without matching current source evidence was excluded from this map.');
        continue;
      }
      if (!events.has(event.id)) events.set(event.id, event);
    }
    // Corrected references can leave an empty historical case. It is not an
    // active process and must not become a live finding or cohort member.
    if (!events.size) continue;
    const nodes = [], edges = [], eventNodes = new Map(), covered = new Set();
    const operation = operations.get(reviewed.id);
    const source = event => {
      const log = logs.get(event.logId);
      return { logId: event.logId, eventId: event.id, quote: event.sourceQuote, sourceField: event.sourceField,
        authorName: log.authorName || null, occurredAt: log.occurredAt || null,
        recordedAt: log.createdAt || null, revision: revisionOf(log) };
    };
    const resolve = reference => {
      const event = events.get(reference?.eventId);
      if (!event || reference.logId !== event.logId || !text(reference.quote).trim()
        || !event.sourceQuote.includes(reference.quote)
        || (reference.sourceField && reference.sourceField !== event.sourceField)
        || (reference.revision !== undefined && reference.revision !== revisionOf(logs.get(event.logId)))) return null;
      return source(event);
    };
    const participants = evidence => {
      const found = new Map();
      for (const item of evidence) {
        const log = logs.get(item.logId);
        if (!log?.authorName) continue;
        const id = log.authorId || `record-author:${log.id}`;
        if (!found.has(id)) found.set(id, { id, name: log.authorName });
      }
      return [...found.values()];
    };
    const addNode = node => {
      node.evidence = dedupeEvidence(node.evidence);
      node.participants = participants(node.evidence);
      nodes.push(node);
      for (const item of node.evidence) {
        covered.add(item.eventId);
        if (!eventNodes.has(item.eventId)) eventNodes.set(item.eventId, []);
        eventNodes.get(item.eventId).push(node.id);
      }
    };

    const resolutions = [];
    for (const [index, blocker] of array(operation?.blockers).entries()) {
      if (!blocker) continue;
      const opened = resolve(blocker.openedBy);
      if (!opened) { warnings.push('A waiting interpretation lacked matching current evidence and was omitted.'); continue; }
      const resolved = blocker.status === 'resolved' ? resolve(blocker.resolvedBy) : null;
      const start = timestamp(opened.occurredAt), end = timestamp(resolved?.occurredAt);
      const validResolution = resolved && resolved.sourceField !== 'nextDependency' && start !== null && end !== null && end > start;
      const status = blocker.status === 'resolved' ? validResolution ? 'resolved' : 'uncertain'
        : blocker.status === 'uncertain' ? 'uncertain' : 'blocked';
      const id = `waiting:${reviewed.id}:${index + 1}`;
      addNode({ id, label: short(blocker.label || opened.quote), kind: 'waiting', status, evidence: [opened] });
      if (validResolution) resolutions.push({ from: id, resolved, opened, reason: blocker.reason });
      else if (blocker.status === 'resolved') warnings.push('A proposed resolution lacked a matching later current source; no resolution arrow was drawn.');
    }

    // Do not collapse repeated activities into one pseudo step. A correction or
    // another execution of an activity can affect different relationships.
    const activities = new Map();
    for (const milestone of array(operation?.milestones)) {
      if (milestone?.state !== 'reported_complete') continue;
      for (const reference of array(milestone.evidence)) {
        const item = resolve(reference), event = events.get(item?.eventId);
        if (!item || event.status !== 'completed' || item.sourceField === 'nextDependency') continue;
        if (!activities.has(item.eventId)) activities.set(item.eventId, { item, labels: [] });
        activities.get(item.eventId).labels.push(milestone.label);
      }
    }
    for (const [eventId, activity] of activities) addNode({ id: `activity:${eventId}`,
      label: unique(activity.labels.filter(Boolean)).join(' · ') || 'Reported activity', kind: 'activity', status: 'completed', evidence: [activity.item] });
    for (const event of events.values()) if (!covered.has(event.id)) addNode({ id: `record:${event.id}`,
      label: short(event.sourceQuote), kind: 'record', status: SOURCE_STATES.has(event.status) ? event.status : 'recorded', evidence: [source(event)] });

    const singleNode = eventId => {
      const ids = unique(eventNodes.get(eventId) || []);
      return ids.length === 1 ? ids[0] : null;
    };
    for (const dependency of array(reviewed.dependencies)) {
      const fromEvent = events.get(dependency?.fromEventId), toEvent = events.get(dependency?.toEventId);
      const from = singleNode(fromEvent?.id), to = singleNode(toEvent?.id);
      if (!fromEvent || !toEvent || !from || !to || from === to || dependency.confidence !== 'explicit'
        || fromEvent.status !== 'completed' || !['completed', 'in_progress'].includes(toEvent.status)
        || fromEvent.sourceField === 'nextDependency' || toEvent.sourceField === 'nextDependency'
        || !/\bonly\s+after\b|후에만/iu.test(toEvent.sourceQuote)) {
        warnings.push('A dependency could not be attached unambiguously to current source nodes; no arrow was drawn.');
        continue;
      }
      const id = `dependency:${fromEvent.id}:${toEvent.id}`;
      if (edges.some(edge => edge.id === id)) continue;
      edges.push({ id, from, to, kind: 'explicit_dependency', label: 'Explicit prerequisite',
        reason: text(dependency.reason) || 'The source explicitly states a prerequisite.',
        evidence: [source(fromEvent), source(toEvent)] });
    }
    for (const resolution of resolutions) {
      const to = singleNode(resolution.resolved.eventId);
      if (!to || to === resolution.from) { warnings.push('A resolution has ambiguous source nodes; no arrow was drawn.'); continue; }
      edges.push({ id: `resolution:${resolution.from}:${resolution.resolved.eventId}`, from: resolution.from, to,
        kind: 'resolution', label: 'Later matching resolution',
        reason: text(resolution.reason) || 'A matching completion is reported later than the waiting record.',
        evidence: [resolution.opened, resolution.resolved] });
    }

    const requirements = array(reviewed.requirements).filter(requirement => requirementIds.has(requirement?.requirementId)).map(requirement => ({
      requirementId: requirement.requirementId, title: requirement.title, version: requirement.version || 1,
      steps: array(requirement.steps).filter(Boolean).map((step, index) => {
        const evidence = dedupeEvidence(array(step.evidence).map(resolve).filter(Boolean));
        return { id: `required:${requirement.requirementId}:${requirement.version || 1}:${index + 1}`, title: step.title,
          status: step.status === 'evidence_found' && evidence.length ? 'evidence_found' : 'not_evidenced',
          nodeIds: unique(evidence.flatMap(item => eventNodes.get(item.eventId) || [])), evidence };
      }),
    }));
    const objectiveLinks = [];
    for (const link of array(reviewed.goalLinks)) {
      if (!goalIds.has(link?.goalId)) continue;
      const evidence = dedupeEvidence(array(link.evidence).map(resolve).filter(Boolean));
      if (!evidence.length) { warnings.push('A suggested objective relationship has no matching event sources and is not connected to a map node.'); continue; }
      objectiveLinks.push({ goalId: link.goalId, nodeIds: unique(evidence.flatMap(item => eventNodes.get(item.eventId) || [])),
        reason: text(link.reason) || 'Suggested relevance from shared source context; business impact is not established.', evidence });
    }
    if (!edges.length) warnings.push('These records do not establish an explicit dependency or later resolution. Activities remain unconnected instead of being ordered by their timestamps.');
    if (nodes.some(node => node.kind === 'record')) warnings.push('Some records do not support a recognized completed activity. They remain visible with their source state.');
    result.cases.push({ caseId: reviewed.id, nodes, edges, requirements, objectiveLinks, warnings: unique(warnings) });
  }
  return result;
}
