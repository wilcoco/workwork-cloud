/**
 * A bounded operating projection of validated review evidence. This is not an
 * execution engine: it creates neither authority nor assignments, and it never
 * treats reporting, inferred relevance or a cleared wait as business success.
 */
const arr = value => Array.isArray(value) ? value : [];
const str = value => typeof value === 'string' ? value : '';
const unique = values => [...new Set(values)];

function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value)) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10) ? result : null;
}

const WAIT = /\b(?:waiting|awaiting|pending|blocked|on hold|held up)\b|대기|보류|기다리|미입고/iu;
const NO_WAIT = /\b(?:not|no longer|stopped)\s+(?:waiting|awaiting|blocked)|\b(?:no|without)\s+(?:pending|blockers?|delays?)\b|대기\s*(?:없|해제)|더\s*이상\s*기다리지/iu;
const NOT_COMPLETION = /[?？]|\b(?:not|never|no(?!\s+(?:issues?|problems?|defects?|objections?|delays?)\b)|didn't|hasn't|haven't|couldn't|cannot|can't|unable|failed to|reject(?:ed|ion)?|denied|declined|refused|revoked|retracted|unsuccessful|pending|awaiting|waiting|will|would|should|must|need(?:s|ed)? to|plan(?:ned|ning)?|scheduled|tomorrow|next week|to be|if|unless|whether|hypothetical|template|draft|unverified|disputed)\b|미완료|미승인|불승인|반려|거부|실패|불합격|예정|계획|대기|보류|아직|하지\s*않|하지\s*못|안\s*(?:했|함|됨)|완료되지/iu;
const INVALIDATED = /\b(?:rejected|denied|declined|refused|revoked|retracted|not approved|not released|approval failed)\b|불승인|반려|거부|승인\s*취소/iu;
const TOPICS = [
  {
    key: 'qa_release', label: 'QA release approval',
    topic: /\b(?:(?:QA|quality|inspection)\s+(?:release|approval|sign[ -]?off)|(?:release|approval|sign[ -]?off)\s+(?:by|from)\s+(?:QA|quality))\b|(?:품질|검사|검수)\s*(?:출하\s*)?승인|QA\s*(?:출하\s*)?승인/iu,
    completed: /\b(?:(?:QA|quality|inspection)\s+(?:release|approval|sign[ -]?off)\s+(?:(?:was|is|has been)\s+)?(?:approved|granted|confirmed|completed|received)|(?:QA|quality)\s+(?:approved|released|signed off)\s+(?:the\s+)?(?:shipment|release)(?!\s+(?:report|document|form|request|checklist)\b)\b|(?:received|obtained|granted|confirmed|completed)\s+(?:the\s+)?(?:QA|quality|inspection)\s+(?:release|approval|sign[ -]?off))|(?:품질|검사|검수|QA)\s*(?:출하\s*)?승인(?:을|이|을\s*받아)?\s*(?:완료|확인|받았|받음|되었|됐|함|했)/iu,
  },
  {
    key: 'carrier_collection', label: 'Carrier collection',
    topic: /\b(?:(?:carrier|courier|haulier)\s+(?:collection|pickup|pick[ -]up)|(?:collection|pickup|pick[ -]up)\s+(?:by|from)\s+(?:the\s+)?(?:carrier|courier))\b|(?:운송사|운송업체|택배)\s*(?:수거|집하|픽업)/iu,
    completed: /\b(?:(?:carrier|courier|haulier)\s+(?:collection|pickup|pick[ -]up)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|(?:carrier|courier|haulier)\s+(?:collected|picked up)|completed\s+(?:the\s+)?(?:carrier|courier)\s+(?:collection|pickup|pick[ -]up))\b|(?:운송사|운송업체|택배)\s*(?:수거|집하|픽업)(?:를|가|을|이)?\s*(?:완료|함|했)/iu,
  },
  {
    key: 'material_arrival', label: 'Material arrival',
    topic: /\b(?:materials?\s+(?:arrival|delivery|receipt)|(?:arrival|delivery|receipt)\s+of\s+(?:the\s+)?materials?|(?:waiting|awaiting)\s+(?:for\s+)?(?:the\s+)?materials?)\b|자재\s*(?:입고|도착|대기)|자재를?\s*기다리/iu,
    completed: /\b(?:materials?\s+(?:(?:has|have)\s+)?(?:arrived|received)|materials?\s+(?:arrival|delivery|receipt)\s+(?:(?:was|is|has been)\s+)?(?:completed|confirmed)|(?:received|unloaded)\s+(?:the\s+)?materials?)\b|자재\s*(?:입고|도착)(?:가|이)?\s*(?:완료|확인|함|했)|자재(?:를)?\s*받았/iu,
  },
  {
    key: 'revised_drawing', label: 'Revised drawing',
    topic: /\b(?:revised|updated|new revision of (?:the )?)\s+drawing\b|(?:수정|개정|변경)\s*도면/iu,
    completed: /\b(?:(?:revised|updated)\s+drawing\s+(?:(?:was|is|has been)\s+)?(?:received|issued|released|delivered)|(?:received|issued|released|delivered)\s+(?:the\s+)?(?:revised|updated)\s+drawing)\b|(?:수정|개정|변경)\s*도면(?:을|이)?\s*(?:수령|접수|전달|발행|받았)(?:\s*완료)?/iu,
  },
];

const ACTIVITIES = [
  { key: 'inspection', label: 'Inspection', performed: /\b(?:inspected|(?:inspection|inspection check)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished|passed|failed)|(?:completed|finished|passed|failed)\s+(?:the\s+)?(?:quality\s+)?inspection)\b|(?:검사|검수)(?:를|가)?\s*(?:완료|함|했|통과|불합격)/iu },
  { key: 'rework', label: 'Rework', performed: /\b(?:reworked|rework\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|(?:completed|finished)\s+(?:the\s+)?rework)\b|재작업(?:을|이)?\s*(?:완료|함|했)/iu },
  { key: 'packing', label: 'Packing', performed: /\b(?:packed|packing\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|(?:completed|finished)\s+(?:the\s+)?packing)\b|포장(?:을|이)?\s*(?:완료|함|했)/iu },
  { key: 'release', label: 'QA release', performed: TOPICS[0].completed },
  { key: 'dispatch', label: 'Dispatch', performed: /\b(?:shipped|dispatched|(?:dispatch|shipment)\s+(?:(?:was|is|has been)\s+)?(?:completed|finished)|dispatch\s+(?:(?:was|is|has been)\s+)?confirmed|(?:completed|finished)\s+(?:the\s+)?(?:dispatch|shipment))\b|(?:출하|발송)(?:를|가|을|이)?\s*(?:완료|함|했)/iu,
    excludes: /\b(?:booking|reservation|schedule|slot|appointment)\b|예약|배차\s*계획/iu },
];

function evidence(event) {
  return { logId: event.logId, eventId: event.id, quote: event.sourceQuote,
    sourceField: event.sourceField || null, authorName: event.authorName || null,
    occurredAt: event.occurredAt || null, recordedAt: event.recordedAt || null };
}

function dedupeEvidence(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.logId}:${item.eventId}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function clauses(quote) {
  return str(quote).split(/[;.!?。！？]\s*|\s+(?:but|and|그리고|그러나)\s+/iu).map(value => value.trim()).filter(Boolean);
}

function signalsFor(event) {
  const result = [];
  for (const clause of clauses(event.sourceQuote)) {
    const waiting = WAIT.test(clause) && !NO_WAIT.test(clause);
    const topics = TOPICS.filter(topic => topic.topic.test(clause) || topic.completed.test(clause));
    if (waiting) {
      if (topics.length === 1) result.push({ topic: topics[0], kind: 'wait', event });
      // Several topics in one unsplit clause do not establish separate dependencies.
      else result.push({ topic: { key: `unknown:${clause.toLocaleLowerCase()}`, label: clause }, kind: 'wait', event });
    } else if (['completed', 'recorded'].includes(event.status) && event.sourceField !== 'nextDependency'
      && !NOT_COMPLETION.test(event.sourceQuote)) {
      for (const topic of topics) if (topic.completed.test(clause)) result.push({ topic, kind: 'resolve', event });
    }
  }
  return result;
}

function blockersFor(events) {
  const signals = events.flatMap(signalsFor).filter(signal => signal.kind !== 'resolve'
    // Sentence splitting must not hide a rejection later in the same record.
    // These are validated events in the same case, not unrelated source text.
    || !events.some(other => other.logId === signal.event.logId && other.sourceField === signal.event.sourceField
      && INVALIDATED.test(other.sourceQuote)));
  const groups = new Map();
  for (const signal of signals) {
    if (!groups.has(signal.topic.key)) groups.set(signal.topic.key, []);
    if (!groups.get(signal.topic.key).some(item => item.kind === signal.kind && item.event.id === signal.event.id)) groups.get(signal.topic.key).push(signal);
  }
  const blockers = [];
  for (const [key, items] of groups) {
    if (!items.some(item => item.kind === 'wait')) continue;
    const dated = items.filter(item => time(item.event.occurredAt) !== null)
      .sort((a, b) => time(a.event.occurredAt) - time(b.event.occurredAt) || str(a.event.id).localeCompare(str(b.event.id)));
    let active = null;
    const open = (item, status = 'open') => {
      const blocker = { id: `${item.event.id}:${key}`, key, label: item.topic.label, status,
        openedBy: evidence(item.event), resolvedBy: null,
        reason: status === 'uncertain' ? 'The record does not establish the order of waiting and completion.' : 'Explicit waiting is reported; no later matching completion is evidenced.' };
      blockers.push(blocker); return blocker;
    };
    for (let i = 0; i < dated.length;) {
      const stamp = time(dated[i].event.occurredAt);
      const group = [];
      while (i < dated.length && time(dated[i].event.occurredAt) === stamp) group.push(dated[i++]);
      const waits = group.filter(item => item.kind === 'wait'), completions = group.filter(item => item.kind === 'resolve');
      if (waits.length && completions.length) {
        if (!active) active = open(waits[0], 'uncertain');
        active.status = 'uncertain';
        active.reason = 'Waiting and a matching completion have the same occurrence time; their order is unknown.';
      } else if (waits.length) {
        if (!active) active = open(waits[0]);
        else {
          active.status = 'open';
          active.reason = 'A later record still reports waiting; no later matching completion is evidenced.';
        }
      } else if (active && completions.length && time(active.openedBy.occurredAt) < stamp) {
        active.status = 'resolved'; active.resolvedBy = evidence(completions[0].event);
        active.reason = 'An explicit matching completion was reported later for this case. This does not establish overall case completion.';
        active = null;
      }
    }
    const undated = items.filter(item => time(item.event.occurredAt) === null);
    const unknownWaits = undated.filter(item => item.kind === 'wait');
    if (unknownWaits.length) {
      if (!active) active = open(unknownWaits[0], 'uncertain');
      else active.status = 'uncertain';
      active.reason = 'At least one waiting record has no occurrence time; its order relative to other evidence is unknown.';
    }
    if (active && undated.some(item => item.kind === 'resolve')) {
      active.status = 'uncertain';
      active.reason = 'A matching completion has no occurrence time and cannot safely clear the reported wait.';
    }
  }
  return blockers;
}

function activitiesFor(events, blockers) {
  const performed = ACTIVITIES.map(activity => ({ key: activity.key, label: activity.label, state: 'reported_complete',
    evidence: events.filter(event => event.status === 'completed' && event.sourceField !== 'nextDependency'
      && clauses(event.sourceQuote).some(clause => activity.performed.test(clause)
        && !NOT_COMPLETION.test(clause) && !activity.excludes?.test(clause))).map(evidence) })).filter(activity => activity.evidence.length);
  for (const blocker of blockers.filter(item => item.status !== 'resolved')) {
    if (blocker.key !== 'qa_release') continue;
    performed.push({ key: 'release_wait', label: 'QA release waiting', state: 'waiting', evidence: [blocker.openedBy] });
  }
  return performed;
}

function caseStatement(milestones, blockers) {
  const completed = unique(milestones.filter(item => item.state === 'reported_complete')
    .map(item => item.label.replace(/^[A-Z](?![A-Z])/u, initial => initial.toLowerCase())));
  const active = blockers.filter(item => item.status !== 'resolved');
  const parts = [];
  if (completed.length) parts.push(`Reported activities: ${completed.join(', ')}.`);
  if (active.length) {
    parts.push(`Waiting reported: ${unique(active.map(item => item.label)).join('; ')}.`);
    if (active.some(item => item.status === 'uncertain')) parts.push('The order of conflicting or undated evidence remains uncertain.');
  } else if (blockers.some(item => item.status === 'resolved')) {
    parts.push('Earlier waits have later matching completion evidence; overall case readiness is not established.');
  } else parts.push('No explicit waiting issue was found in these records; overall case readiness is not established.');
  if (!completed.length) parts.unshift('No completed operating activity is established by the available records.');
  return parts.join(' ');
}

function participantList(events, logsById) {
  const found = new Map();
  for (const event of events) {
    const log = logsById.get(event.logId);
    if (!log || !log.authorName) continue;
    // Never turn a mentioned colleague into a participant. A missing ID receives
    // a per-record key rather than falsely merging people who share a name.
    const id = log.authorId || `record-author:${log.id}`;
    if (!found.has(id)) found.set(id, { id, name: log.authorName });
  }
  return [...found.values()];
}

function suggestedFollowup(item, blocker) {
  const fit = (value, limit) => value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
  return { title: fit(`Clarify ${blocker.label} for ${item.title}`, 200),
    description: fit(`Check ${blocker.label} for ${item.title}. Reported dependency: “${blocker.openedBy.quote}” Record the actual outcome and when it happened.`, 2000) };
}

/** Compute on every state read. It has no persistence or external dependencies. */
export function buildOperatingReview(state = {}, review = {}) {
  const output = { version: 1, cases: [], goalSummaries: [], attention: [], patterns: [], processPatterns: [], warnings: [
    'This bounded interpretation recognizes explicit reported activities and a small set of waiting topics. Unrecognized language can remain unknown.',
    'Objective links and process applicability are suggested relevance. Reported work and resolved waits do not establish KPI impact or operational readiness.',
    'Activity patterns describe comparable recorded cases; they do not establish mandatory steps or causal sequences.',
  ] };
  const logsById = new Map(arr(state?.logs).filter(Boolean).map(log => [log.id, log]));
  const goals = arr(state?.goals).filter(Boolean);
  const knownGoals = new Set(goals.map(goal => goal.id));
  const tasks = arr(state?.tasks).filter(Boolean);
  const reviewed = arr(review?.cases).filter(item => item && item.id);
  for (const item of reviewed) {
    const events = arr(item.events).filter(event => event && event.logId && event.id && str(event.sourceQuote).trim());
    const blockers = blockersFor(events), milestones = activitiesFor(events, blockers);
    const active = blockers.filter(blocker => blocker.status !== 'resolved');
    const goalIds = unique(arr(item.goalLinks).map(link => link?.goalId).filter(id => knownGoals.has(id)));
    const openTaskIds = tasks.filter(task => task.caseId === item.id && task.status === 'open').map(task => task.id);
    const projected = { caseId: item.id, title: item.title, goalIds, participants: participantList(events, logsById),
      statement: caseStatement(milestones, blockers),
      readiness: active.length ? (active.every(blocker => blocker.status === 'uncertain') ? 'uncertain' : 'needs_attention')
        : milestones.length ? 'evidence_available' : 'uncertain',
      blockers, milestones, openTaskIds,
      nextAction: active.length ? suggestedFollowup(item, active[0]) : null };
    output.cases.push(projected);
    for (const blocker of active) {
      const suggestion = suggestedFollowup(item, blocker);
      output.attention.push({ id: `waiting:${item.id}:${blocker.id}`, kind: 'waiting', caseId: item.id, goalId: goalIds[0] || null,
        title: `${item.title}: ${blocker.label}`, detail: blocker.reason, evidence: [blocker.openedBy],
        suggestedTask: { ...suggestion, goalId: goalIds[0] || null, caseId: item.id }, existingTaskIds: openTaskIds });
    }
    if (!goalIds.length && events.length) output.attention.push({ id: `unlinked:${item.id}`, kind: 'unlinked_work',
      caseId: item.id, goalId: null, title: `${item.title}: objective relationship not established`,
      detail: 'These records have no supported suggested link to a current objective. This does not mean the work lacks value.',
      evidence: events.map(evidence), suggestedTask: null, existingTaskIds: openTaskIds });
  }
  for (const goal of goals) {
    const cases = output.cases.filter(item => item.goalIds.includes(goal.id));
    output.goalSummaries.push({ goalId: goal.id, caseIds: cases.map(item => item.caseId),
      needsAttentionCaseIds: cases.filter(item => item.blockers.some(blocker => blocker.status !== 'resolved')).map(item => item.caseId) });
  }
  for (const metric of arr(review?.metrics)) {
    if (!metric || !knownGoals.has(metric.goalId) || !['no_data', 'gap'].includes(metric.status)) continue;
    const unavailable = metric.status === 'no_data';
    output.attention.push({ id: `measurement:${metric.goalId}`, kind: 'measurement_gap', caseId: null, goalId: metric.goalId,
      title: unavailable ? `${metric.title}: measured actual unavailable` : `${metric.title}: measured actual is outside target`,
      detail: unavailable ? 'No sourced measurement matches this objective’s unit, scope and reporting period. Work activity does not substitute for a measured actual.'
        : `Latest comparable actual: ${metric.actual} ${metric.unit}; target: ${metric.target} ${metric.unit}. Source: ${metric.source}. Related work does not establish the cause of this gap.`,
      evidence: [], suggestedTask: { title: unavailable ? `Record a sourced measurement for ${metric.title}` : `Review the measured gap for ${metric.title}`,
        description: unavailable ? 'Check the metric definition, unit, scope and reporting period, then record an actual with its source.'
          : 'Review the sourced measurement and relevant evidence. Record any supported explanation without assuming a causal link from work activity.',
        goalId: metric.goalId, caseId: null },
      existingTaskIds: tasks.filter(task => task.goalId === metric.goalId && !task.caseId && task.status === 'open').map(task => task.id) });
  }

  // A cohort must be explicitly comparable through one suggested goal or one
  // suggested requirement. Goal-less cases are never grouped company-wide.
  const cohorts = goals.map(goal => ({ id: `goal:${goal.id}`, goalId: goal.id, requirementId: null,
    label: `Recorded cases with suggested relevance to “${goal.title}”`,
    cases: output.cases.filter(item => item.goalIds.includes(goal.id) && reviewed.find(source => source.id === item.caseId)?.events?.length) }));
  const requirementIds = unique(reviewed.flatMap(item => arr(item.requirements).map(requirement => requirement?.requirementId)).filter(Boolean));
  for (const requirementId of requirementIds) {
    const source = reviewed.flatMap(item => arr(item.requirements)).find(requirement => requirement.requirementId === requirementId);
    cohorts.push({ id: `requirement:${requirementId}`, goalId: null, requirementId,
      label: `Recorded cases without objective links and with suggested applicability of “${source.title}”`,
      cases: output.cases.filter(item => !item.goalIds.length && reviewed.find(source => source.id === item.caseId)?.requirements?.some(requirement => requirement.requirementId === requirementId)) });
  }
  for (const cohort of cohorts.filter(item => item.cases.length >= 2)) {
    const cohortCaseIds = cohort.cases.map(item => item.caseId);
    for (const topic of TOPICS) {
      const cases = cohort.cases.filter(item => item.blockers.some(blocker => blocker.key === topic.key));
      if (cases.length < 2) continue;
      output.patterns.push({ id: `${cohort.id}:wait:${topic.key}`, goalId: cohort.goalId, requirementId: cohort.requirementId,
        label: `${topic.label} waiting was reported in ${cases.length} of ${cohort.cases.length} recorded cases`,
        count: cases.length, total: cohort.cases.length, caseIds: cases.map(item => item.caseId), cohortCaseIds,
        cohortLabel: cohort.label,
        evidence: dedupeEvidence(cases.flatMap(item => item.blockers.filter(blocker => blocker.key === topic.key).map(blocker => blocker.openedBy))) });
    }
    const activities = ACTIVITIES.map(activity => {
      const cases = cohort.cases.filter(item => item.milestones.some(milestone => milestone.key === activity.key && milestone.state === 'reported_complete'));
      return { key: activity.key, label: activity.label, count: cases.length, caseIds: cases.map(item => item.caseId),
        evidence: dedupeEvidence(cases.flatMap(item => item.milestones.filter(milestone => milestone.key === activity.key && milestone.state === 'reported_complete').flatMap(milestone => milestone.evidence))) };
    }).filter(activity => activity.count);
    if (activities.length) output.processPatterns.push({ id: `${cohort.id}:activities`, goalId: cohort.goalId, requirementId: cohort.requirementId,
      title: `Discovered activity pattern · ${cohort.label}`, caseCount: cohort.cases.length, caseIds: cohortCaseIds, activities });
  }
  return output;
}
