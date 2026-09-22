/**
 * A deliberately conservative, deterministic extraction baseline.
 * Every event is a quote from the saved narrative. Associations are suggestions;
 * neither narrative numbers nor completed tasks become measured KPI actuals.
 * This module is pure and does not create authority, identity, or persistence.
 */
const STATUSES = new Set(['completed', 'in_progress', 'planned', 'blocked', 'recorded']);
const STOP = new Set('a an the and or of to for from in on at by with as is are was were be been being it this that these those we i our their company work worked working task activity result results goal objective improve improvement reduce increase process team today yesterday tomorrow completed complete finish finished started start done all every before after only then have has had daily current'.split(' '));
const CONCEPTS = {
  quality: /\b(?:quality|defects?|rejects?|inspection|inspect(?:ed|ing)?|rework)\b|품질|불량|검사|검수|재작업/iu,
  delivery: /\b(?:deliver(?:y|ies|ed)?|ship(?:ment|ping|ped)?|dispatch(?:ed)?|on[ -]time|late|lateness)\b|납기|배송|출하|발송|납품/iu,
  production: /\b(?:produc(?:e|ed|ing|tion|tivity)|assembl(?:e|ed|y)|manufactur(?:e|ed|ing)|output)\b|생산|조립|제조/iu,
  maintenance: /\b(?:maint(?:enance|ain)|repair(?:ed|s)?|breakdown|downtime|equipment)\b|정비|수리|고장|설비|가동중단/iu,
  inventory: /\b(?:inventory|stock|warehouse|materials?|shortage)\b|재고|자재|창고|부족/iu,
  safety: /\b(?:safety|incident|injury|hazard)\b|안전|재해|위험/iu,
  documentation: /\b(?:documents?|documentation|reports?|records?|recorded)\b|문서|보고|기록/iu,
  approval: /\b(?:approv(?:e|ed|al)|sign[ -]off|signed|authoriz(?:e|ed|ation))\b|승인|결재|서명/iu,
};
const ACTIONS = {
  inspect: /\b(?:inspect(?:ed|ing|ion)?|check(?:ed|ing)?)\b|검사|검수|점검/iu,
  test: /\b(?:test(?:ed|ing)?|validat(?:e|ed|ion)|verif(?:y|ied|ication))\b|시험|테스트|검증/iu,
  approve: /\b(?:approv(?:e|ed|al)|sign[ -]off|signed)\b|승인|결재|서명/iu,
  ship: /\b(?:ship(?:ped|ping|ment)?|dispatch(?:ed)?|deliver(?:ed|y)?)\b|출하|발송|배송|납품/iu,
  pack: /\b(?:pack(?:ed|ing|age|aging)?)\b|포장/iu,
  document: /\b(?:document(?:ed|s|ation)?|report(?:ed|s)?|record(?:ed|s)?)\b|기록|보고|문서/iu,
  produce: /\b(?:produc(?:e|ed|tion)|assembl(?:e|ed|y))\b|생산|조립/iu,
  repair: /\b(?:repair(?:ed)?|maint(?:enance|ain))\b|수리|정비/iu,
};
const COMPLETED_ACTIONS = {
  inspect: /\b(?:inspected|(?:inspection|check)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished|passed|failed)|(?:completed|finished|passed|failed)\s+(?:\w+\s+){0,3}(?:inspection|check))\b|(?:검사|검수|점검)(?:를|가)?\s*(?:완료|함|했|통과|불합격)/iu,
  test: /\b(?:tested|verified|validated|(?:test(?:ing)?|validation|verification)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished|passed|failed)|(?:completed|finished|passed|failed)\s+(?:\w+\s+){0,3}(?:test|testing|validation|verification))\b|(?:시험|테스트|검증)(?:을|를|이|가)?\s*(?:완료|함|했|통과|불합격)/iu,
  approve: /\b(?:approved|signed off|approval\s+(?:(?:was|is|has been)\s+)?(?:completed|granted|confirmed)|(?:completed|confirmed)\s+(?:\w+\s+){0,2}approval)\b|(?:승인|결재|서명)(?:을|를|이|가)?\s*(?:완료|함|했)/iu,
  ship: /\b(?:shipped|dispatched|delivered|(?:dispatch|shipment|shipping|delivery)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished|confirmed)|(?:completed|confirmed)\s+(?:\w+\s+){0,2}(?:dispatch|shipment|shipping|delivery))\b|(?:출하|배송|발송|납품)(?:을|를|이|가)?\s*(?:완료|함|했)/iu,
  pack: /\b(?:packed|packing\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|completed\s+(?:\w+\s+){0,2}packing)\b|포장(?:을|이)?\s*(?:완료|함|했)/iu,
  document: /\b(?:documented|reported|recorded|submitted|(?:report|document|record)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|completed\s+(?:\w+\s+){0,2}(?:report|document|record))\b|(?:기록|보고|문서)(?:을|를|이|가)?\s*(?:완료|함|했)|제출(?:함|했|\s*완료)/iu,
  produce: /\b(?:produced|assembled|(?:production|assembly)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|completed\s+(?:\w+\s+){0,2}(?:production|assembly))\b|(?:생산|조립)(?:을|이)?\s*(?:완료|함|했)/iu,
  repair: /\b(?:repaired|maintained|(?:repair|maintenance)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|completed\s+(?:\w+\s+){0,2}(?:repair|maintenance))\b|(?:수리|정비)(?:를|가)?\s*(?:완료|함|했)/iu,
};
const SOURCE_FIELDS = ['text', 'result', 'nextDependency'];

const string = value => typeof value === 'string' ? value : '';
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values)];
const validId = value => typeof value === 'string' && value.length > 0;
const normalizeReference = value => string(value).trim().toUpperCase();

function tokens(value) {
  return new Set((string(value).toLowerCase().match(/[a-z]{3,}|[가-힣]{2,}/gu) || [])
    .map(word => word.replace(/(?:ing|ed|s)$/u, ''))
    .filter(word => !STOP.has(word) && word.length > 2));
}

function sharedContext(left, right) {
  const concepts = Object.entries(CONCEPTS).filter(([, regex]) => regex.test(left) && regex.test(right)).map(([name]) => name);
  const a = tokens(left), b = tokens(right);
  const words = [...a].filter(word => b.has(word));
  return { matches: concepts.length > 0 || words.length >= 2, concepts, words };
}

function statusOf(value) {
  const text = string(value);
  if (/\b(?:not yet|did not|didn't|has not|hasn't|have not|haven't|not\s+(?:completed|finished|started|approved|inspected|tested|shipped|dispatched|confirmed|collected|delivered|packed|passed|performed)|never completed|unable to|could not|couldn't|failed to)\b|미완료|미실시|미진행|미승인|미검사|하지\s*못|하지\s*않|완료되지\s*않|안\s*(?:됨|했|함)/iu.test(text)) {
    return /\b(?:blocked|unable|could not|couldn't|failed to|waiting|awaiting)\b|대기|보류|중단|지연|못/iu.test(text) ? 'blocked' : 'recorded';
  }
  if (/\b(?:will|would|plan(?:ned)? to|planning to|scheduled|intend to|tomorrow|next week|to be completed)\b|예정|계획|내일|다음\s*주/iu.test(text)) return 'planned';
  if (/\b(?:blocked|waiting|awaiting|on hold|delayed|pending)\b|대기|보류|중단|지연/iu.test(text)) return 'blocked';
  if (/\b(?:in progress|started|working on|underway|ongoing)\b|진행\s*중|시작|착수/iu.test(text)) return 'in_progress';
  if (/\b(?:completed|finished|delivered|shipped|dispatched|confirmed|collected|submitted|approved|rejected|inspected|tested|packed|repaired|verified|released|received|sent|closed|resolved|assembled|produced|measured|recorded|failed|passed|signed)\b|완료|검사(?:함|했)|확인(?:함|했)|발송(?:함|했)|배송(?:함|했)|출하(?:함|했)|제출(?:함|했)|승인(?:함|했)|측정(?:함|했)|수리(?:함|했)|생산(?:함|했)|통과|불합격/iu.test(text)) return 'completed';
  return 'recorded';
}

function splitNarrative(value) {
  // Delimiters are excluded, but every retained segment is still a verbatim quote.
  return string(value).split(/\r?\n+|[;；]+|(?<=[.!?。！？])\s+|,\s*(?:and\s+then|then|but)\s+|\s+but\s+|\s+그리고\s+/iu)
    .flatMap(part => part.split(/\s+and\s+(?=(?:(?:I|we|they)\s+)?(?:will\b|plan to\b|completed\b|finished\b|started\b|shipped\b|submitted\b|tested\b|packed\b))/iu))
    .flatMap(part => {
      const pieces = part.split(/\s+and\s+|,\s+/iu);
      return pieces.length > 1 && pieces.every(piece => statusOf(piece) !== 'recorded') ? pieces : [part];
    })
    .map(part => part.trim())
    .filter(Boolean);
}

function referencesIn(text) {
  const found = [];
  const labelled = /(?:\b(?:work\s*order|purchase\s*order|order|lot|batch|job|ticket|case|shipment)\b|주문|로트|배치|작업\s*지시|출하)\s*(?:(?:id|no\.?|number|번호)\s*)?[:#]?\s*([a-z0-9][a-z0-9._/-]{1,39})/giu;
  for (const match of text.matchAll(labelled)) {
    const candidate = match[1].replace(/[.,!?]+$/u, '');
    if (/\d/u.test(candidate) && /^[a-z0-9][a-z0-9._/-]*$/iu.test(candidate)) found.push(normalizeReference(candidate));
  }
  for (const match of text.matchAll(/\b(?:PO|WO|LOT|BATCH|JOB|CASE|ORD)-[A-Z0-9]*\d[A-Z0-9-]*\b/giu)) found.push(normalizeReference(match[0]));
  return unique(found);
}

function paragraphContext(paragraph) {
  if (!/^\s*(?:(?:work\s*order|purchase\s*order|order|lot|batch|job|ticket|case|shipment)\b|주문|로트|배치|작업\s*지시|출하)/iu.test(paragraph)) return null;
  const prefix = paragraph.match(/^.{1,80}?:/u)?.[0];
  const references = prefix ? referencesIn(prefix) : [];
  return references.length === 1 ? references[0] : null;
}

function sourceSegments(log) {
  const output = [];
  for (const sourceField of SOURCE_FIELDS) {
    for (const paragraph of string(log[sourceField]).split(/\r?\n+/u)) {
      let context = paragraphContext(paragraph);
      for (const text of splitNarrative(paragraph)) {
        const references = referencesIn(text);
        if (references.some(reference => reference !== context)) context = null;
        output.push({ text, sourceField, references, context: references.length ? null : context });
      }
    }
  }
  return output;
}

function evidenceField(log, event) {
  if (SOURCE_FIELDS.includes(event.sourceField)) return string(log[event.sourceField]).includes(event.sourceQuote) ? event.sourceField : null;
  return SOURCE_FIELDS.find(field => string(log[field]).includes(event.sourceQuote)) || null;
}

function sameCase(left, right) {
  if (left.caseId && right.caseId) return left.caseId === right.caseId;
  if (left.caseReference && right.caseReference) return left.caseReference === right.caseReference;
  return !left.caseId && !right.caseId && !left.caseReference && !right.caseReference;
}

function actionsIn(text) {
  return Object.entries(ACTIONS).filter(([, regex]) => regex.test(text)).map(([key]) => key);
}

function explicitDependencies(events) {
  const dependencies = [];
  for (let index = 1; index < events.length; index++) {
    const event = events[index];
    if (!['completed', 'in_progress'].includes(event.status)) continue;
    if (/\bnot\s+only\s+after\b/iu.test(event.sourceQuote)) continue;
    const prerequisite = event.sourceQuote.match(/\bonly\s+after\s+(.+)/iu)?.[1]
      || event.sourceQuote.match(/(.+?)\s*후에만/u)?.[1];
    if (!prerequisite) continue;
    const requiredActions = actionsIn(prerequisite);
    if (!requiredActions.length) continue;
    const candidates = events.slice(0, index).filter(previous => previous.status === 'completed'
      && sameCase(previous, event) && requiredActions.every(action => COMPLETED_ACTIONS[action].test(previous.sourceQuote)));
    // Repeated inspections are ambiguous; chronology alone cannot pick one.
    if (candidates.length === 1) dependencies.push({ fromEventId: candidates[0].id, toEventId: event.id,
      reason: `An explicit prerequisite is stated: “${event.sourceQuote}”`, confidence: 'explicit' });
  }
  return dependencies;
}

export function analyzeLog(log, { goals = [], cases = [] } = {}) {
  const warnings = [];
  const availableCases = list(cases).filter(item => item && validId(item.id));
  const continuation = availableCases.find(item => item.id === log.caseId);
  if (log.caseId && !continuation) warnings.push('The supplied continuation is not an available company case; it was not used.');
  const segments = sourceSegments(log);
  const narrative = segments.filter(segment => segment.sourceField === 'text');
  const narrativeReferences = narrative.map(segment => segment.references.length === 1 ? segment.references[0]
    : segment.references.length === 0 ? segment.context : null);
  const entryReference = narrative.length && narrativeReferences.every(Boolean) && unique(narrativeReferences).length === 1
    ? narrativeReferences[0] : null;
  const events = segments.map(({ text, sourceField, references, context }, index) => {
    const optionalContext = sourceField !== 'text' && references.length === 0 && !context
      && (entryReference || continuation);
    if (optionalContext) context = entryReference || normalizeReference(continuation?.reference) || null;
    const caseReference = references.length === 1 ? references[0] : context;
    let caseBasis = references.length === 1 ? 'explicit_reference' : context || optionalContext ? 'entry_context' : continuation ? 'continuation' : null;
    let caseId = continuation?.id || null;
    if (references.length > 1) {
      caseId = null;
      caseBasis = null;
      warnings.push(`Event ${index + 1} mentions multiple references; its case identity needs more context.`);
    } else if (caseReference) {
      const matching = availableCases.filter(item => normalizeReference(item.reference) === caseReference);
      caseId = matching.length === 1 ? matching[0].id : null;
      if (matching.length > 1) warnings.push(`Reference ${caseReference} matches several available cases; no case was selected.`);
      if (continuation && normalizeReference(continuation.reference) !== caseReference) {
        warnings.push(`Event ${index + 1} has a different explicit reference from the continuation; the cases were kept separate.`);
      }
    }
    let status = statusOf(text);
    if (sourceField === 'nextDependency' && ['completed', 'in_progress'].includes(status)) status = 'recorded';
    if (optionalContext) warnings.push(`Event ${index + 1} inherits ${context ? `reference ${context}` : 'the continued case'} from the entry context; this is a suggested association.`);
    else if (context) warnings.push(`Event ${index + 1} inherits reference ${context} from its paragraph label; this is suggested entry context.`);
    return { id: `${log.id}:${index + 1}`, text, action: text, status, caseId, caseReference,
      sourceQuote: text, sourceField, caseBasis, ...(references.length > 1 ? { caseAmbiguous: true } : {}) };
  });
  const associations = [];
  for (const event of events) for (const goal of list(goals)) {
    if (!goal || !validId(goal.id)) continue;
    const context = sharedContext(event.sourceQuote, `${string(goal.title)} ${string(goal.description)} ${string(goal.metricName)}`);
    if (context.matches) associations.push({ goalId: goal.id, eventId: event.id, confidence: 'suggested', sourceQuote: event.sourceQuote, sourceField: event.sourceField,
      reason: `Shared context: ${unique([...context.concepts, ...context.words]).slice(0, 4).join(', ')}. Suggested relevance, not proof of contribution.` });
  }
  if (events.some(event => event.status === 'recorded')) warnings.push('Some descriptions do not establish whether work was completed; their state remains recorded.');
  if (!log.occurredAt) warnings.push('Occurrence time was not supplied. Record time is not evidence of when the work happened.');
  return { events, associations, dependencies: explicitDependencies(events), warnings: unique(warnings) };
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value)) return null;
  const date = value.slice(0, 10), parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  return parsed;
}

function measuredMetrics(goals, measurements, warnings) {
  return goals.filter(goal => goal && validId(goal.id)).map(goal => {
    const start = timestamp(goal.periodStart), endDate = timestamp(goal.periodEnd);
    const end = endDate === null ? null : endDate + (/^\d{4}-\d{2}-\d{2}$/u.test(goal.periodEnd) ? 86_399_999 : 0);
    const validGoal = typeof goal.target === 'number' && Number.isFinite(goal.target) && start !== null && end !== null && start <= end
      && ['at_least', 'at_most'].includes(goal.direction) && string(goal.unit).trim() && string(goal.scope).trim();
    if (!validGoal) warnings.push(`Goal ${string(goal.title) || goal.id} has incomplete measurement context; no actual was calculated.`);
    const comparable = validGoal ? measurements.filter(measurement => measurement && measurement.goalId === goal.id
      && typeof measurement.value === 'number' && Number.isFinite(measurement.value)
      && string(measurement.unit).trim() === goal.unit.trim() && string(measurement.scope).trim() === goal.scope.trim()
      && string(measurement.source).trim() && timestamp(measurement.observedAt) !== null
      && timestamp(measurement.observedAt) >= start && timestamp(measurement.observedAt) <= end) : [];
    comparable.sort((left, right) => timestamp(right.observedAt) - timestamp(left.observedAt)
      || (timestamp(right.createdAt) || 0) - (timestamp(left.createdAt) || 0) || string(right.id).localeCompare(string(left.id)));
    const latest = comparable[0];
    const actual = latest?.value ?? null;
    let gap = latest ? actual - goal.target : null;
    if (gap !== null && !Number.isFinite(gap)) { gap = null; warnings.push(`Goal ${goal.title} has a delta outside the supported numeric range.`); }
    else if (gap !== null) gap = Number(gap.toPrecision(12));
    return { goalId: goal.id, title: goal.title, metricName: goal.metricName, unit: goal.unit, scope: goal.scope, target: goal.target,
      actual, gap, status: !latest ? 'no_data' : (goal.direction === 'at_most' ? actual <= goal.target : actual >= goal.target) ? 'met' : 'gap',
      measurementId: latest?.id || null, source: latest?.source || null };
  });
}

function matchesStep(step, quote) {
  const actions = actionsIn(step);
  if (actions.length ? !actions.every(action => ACTIONS[action].test(quote)) : !sharedContext(step, quote).matches) return false;
  if (actions.some(action => !COMPLETED_ACTIONS[action].test(quote))) return false;
  if (actions.includes('approve') && /\b(?:reject(?:ed)?|denied|declined|approval\s+(?:was\s+)?failed)\b|불승인|반려|거부/iu.test(quote)) return false;
  if (/\bconfirm(?:ed|ation)?\b|확인/iu.test(step) && !/\bconfirmed\b|확인(?:함|했|\s*완료)/iu.test(quote)) return false;
  if (/\b(?:pass(?:ed)?|acceptable|success(?:ful)?)\b|합격|통과|성공/iu.test(step)
    && (!/\b(?:pass(?:ed)?|acceptable|success(?:ful)?)\b|합격|통과|성공/iu.test(quote) || /\b(?:fail(?:ed)?|reject(?:ed)?)\b|불합격|실패/iu.test(quote))) return false;
  const numbers = step.match(/\d+(?:\.\d+)?/gu) || [];
  return numbers.every(number => (quote.match(/\d+(?:\.\d+)?/gu) || []).includes(number));
}

function requirementReview(item, events, requirements, warnings) {
  const output = [];
  for (const requirement of requirements) {
    if (!requirement || !validId(requirement.id)) continue;
    const effective = timestamp(requirement.effectiveFrom);
    if (effective === null) continue;
    const dated = events.filter(event => timestamp(event.occurredAt) !== null && timestamp(event.occurredAt) >= effective);
    const context = `${string(item.title)} ${string(item.reference)} ${dated.map(event => event.sourceQuote).join(' ')}`;
    const referenceMatch = !!item.reference && referencesIn(`${string(requirement.scope)} ${string(requirement.trigger)}`).includes(normalizeReference(item.reference));
    const matches = referenceMatch || sharedContext(context, `${string(requirement.scope)} ${string(requirement.trigger)}`).matches;
    if (!dated.length || !matches) continue;
    output.push({ requirementId: requirement.id, title: requirement.title, version: requirement.version || 1, applicability: 'suggested',
      steps: list(requirement.steps).filter(step => typeof step === 'string').map(title => {
        const evidence = dated.filter(event => event.status === 'completed' && matchesStep(title, event.sourceQuote))
          .map(event => ({ logId: event.logId, eventId: event.id, quote: event.sourceQuote, sourceField: event.sourceField }));
        return { title, status: evidence.length ? 'evidence_found' : 'not_evidenced', evidence };
      }) });
  }
  if (requirements.length && events.some(event => timestamp(event.occurredAt) === null)) {
    warnings.push(`Case ${string(item.title) || item.id} has undated evidence; requirement applicability and step evidence exclude those records.`);
  }
  return output;
}

export function buildReview({ goals = [], requirements = [], tasks = [], logs = [], cases = [], measurements = [] } = {}) {
  goals = list(goals); requirements = list(requirements); tasks = list(tasks); logs = list(logs); cases = list(cases); measurements = list(measurements);
  const warnings = ['Goal links and requirement applicability are suggestions. Missing evidence does not prove work was not performed.',
    'Measured actuals use explicit measurements with matching unit, scope, and period. Work completion does not establish business success.'];
  const goalIds = new Set(goals.filter(Boolean).map(goal => goal.id));
  const caseIds = new Set(cases.filter(Boolean).map(item => item.id));
  const events = [], links = [], dependencies = [], usedIds = new Set();
  for (const log of logs) {
    if (!log || !validId(log.id)) continue;
    const validEventIds = new Set();
    for (const event of list(log.analysis?.events)) {
      const sourceField = event && string(event.sourceQuote).trim() ? evidenceField(log, event) : null;
      if (!event || !validId(event.id) || !event.id.startsWith(`${log.id}:`) || usedIds.has(event.id)
        || !string(event.sourceQuote).trim() || !sourceField) {
        warnings.push('An event without valid source evidence was excluded from review.'); continue;
      }
      usedIds.add(event.id); validEventIds.add(event.id);
      const derivedStatus = statusOf(event.sourceQuote);
      let safeStatus = STATUSES.has(event.status) && (event.status !== 'completed' || derivedStatus === 'completed') ? event.status : derivedStatus;
      if (sourceField === 'nextDependency' && ['completed', 'in_progress'].includes(safeStatus)) safeStatus = 'recorded';
      events.push({ ...event, sourceField, status: safeStatus, caseId: !event.caseAmbiguous && caseIds.has(event.caseId) ? event.caseId : null, logId: log.id,
        occurredAt: log.occurredAt || null, recordedAt: log.createdAt, authorName: log.authorName,
        revision: Number.isInteger(log.revision) && log.revision > 0 ? log.revision : 1 });
    }
    for (const link of list(log.analysis?.associations)) {
      const sourceEvent = events.find(event => event.id === link?.eventId && validEventIds.has(event.id));
      if (link && goalIds.has(link.goalId) && sourceEvent
        && string(link.sourceQuote).trim() && sourceEvent.sourceQuote.includes(link.sourceQuote)) {
        links.push({ ...link, confidence: 'suggested' });
      }
    }
    // Current direction can make earlier evidence relevant. Re-evaluate validated
    // source events against current goals without rewriting the saved extraction.
    for (const event of events.filter(item => validEventIds.has(item.id))) {
      for (const goal of goals) {
        if (!goal || !goalIds.has(goal.id) || links.some(link => link.eventId === event.id && link.goalId === goal.id)) continue;
        const context = sharedContext(event.sourceQuote, `${string(goal.title)} ${string(goal.description)} ${string(goal.metricName)}`);
        if (!context.matches) continue;
        links.push({ goalId: goal.id, eventId: event.id, confidence: 'suggested', sourceQuote: event.sourceQuote, sourceField: event.sourceField,
          reason: `Current objective shares ${unique([...context.concepts, ...context.words]).slice(0, 4).join(', ')} context with this evidence. Suggested relevance, not proof of contribution.` });
      }
    }
    // Re-derive prerequisites from source-backed events, not untrusted supplied IDs.
    dependencies.push(...explicitDependencies(events.filter(event => validEventIds.has(event.id))));
  }
  const reviewedCases = cases.filter(item => item && validId(item.id)).map(item => {
    const caseEvents = events.filter(event => event.caseId === item.id).sort((left, right) => {
      const a = timestamp(left.occurredAt), b = timestamp(right.occurredAt);
      if (a === null && b !== null) return 1;
      if (a !== null && b === null) return -1;
      return (a ?? timestamp(left.recordedAt) ?? 0) - (b ?? timestamp(right.recordedAt) ?? 0) || left.id.localeCompare(right.id);
    });
    const ids = new Set(caseEvents.map(event => event.id));
    const goalLinks = [];
    for (const link of links.filter(link => ids.has(link.eventId))) {
      let grouped = goalLinks.find(existing => existing.goalId === link.goalId);
      if (!grouped) {
        grouped = { goalId: link.goalId, reason: link.reason, confidence: 'suggested', evidence: [] };
        goalLinks.push(grouped);
      }
      const event = caseEvents.find(item => item.id === link.eventId);
      if (!grouped.evidence.some(item => item.eventId === event.id)) grouped.evidence.push({
        logId: event.logId, eventId: event.id, quote: link.sourceQuote, sourceField: event.sourceField,
        revision: event.revision,
      });
    }
    return { id: item.id, title: item.title, reference: item.reference || null, events: caseEvents, goalLinks,
      dependencies: dependencies.filter(link => ids.has(link.fromEventId) && ids.has(link.toEventId)),
      requirements: requirementReview(item, caseEvents, requirements, warnings) };
  }).filter(item => item.events.length > 0);
  return { metrics: measuredMetrics(goals, measurements, warnings), cases: reviewedCases,
    tasks: { open: tasks.filter(task => task?.status === 'open').length, done: tasks.filter(task => task?.status === 'done').length },
    summary: { logCount: logs.length, eventCount: events.length, caseCount: reviewedCases.length,
      unlinkedEventCount: events.filter(event => !links.some(link => link.eventId === event.id)).length }, warnings: unique(warnings) };
}
