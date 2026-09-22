const app = document.querySelector('#app');
const dialogRoot = document.querySelector('#dialogs');
const notifications = document.querySelector('#notifications');
const state = { session: null, data: null, view: 'work', goalTab: 'objectives', authMode: new URLSearchParams(location.search).has('invite') ? 'join' : 'login', csrfToken: null, draft: {}, search: '', workspaceId: null };
let fieldSequence = 0;
let notificationTimer;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked') node.checked = value;
    else if (key === 'open') node.open = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
const arr = value => Array.isArray(value) ? value : [];
const isManager = () => state.session?.user?.role === 'manager';
const button = (label, onClick, style = '', extra = {}) => el('button', { type: 'button', class: `button ${style}`, onclick: onClick, ...extra }, label);
const badge = (label, tone = '') => el('span', { class: `badge ${tone}` }, label);
const number = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value)) : '—';
function date(value, time = false) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, time ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}
function localDate(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function notify(message, error = false) {
  clearTimeout(notificationTimer);
  notifications.replaceChildren(el('div', { class: `notification${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, message));
  notificationTimer = setTimeout(() => notifications.replaceChildren(), 6500);
}
async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.csrfToken && method !== 'GET' ? { 'X-CSRF-Token': state.csrfToken } : {}) };
  let response;
  try { response = await fetch(path, { ...options, method, credentials: 'same-origin', headers, ...(options.body ? { body: JSON.stringify(options.body) } : {}) }); }
  catch { throw new Error('We could not connect. Your input is still here. Please try again.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unexpected response. Please try again.'); }
  if (!response.ok) {
    if (response.status === 401 && state.session?.user) notify('Your session has expired. Sign in again in another tab, then retry to keep this draft.', true);
    throw new Error(data.error || 'We could not save that change. Please try again.');
  }
  if (data.csrfToken) state.csrfToken = data.csrfToken;
  return data;
}
function resetWorkspaceView() {
  state.draft = {};
  state.search = '';
  state.view = 'work';
  state.goalTab = 'objectives';
  dialogRoot.replaceChildren();
  notifications.replaceChildren();
  clearTimeout(notificationTimer);
}
async function refresh() {
  const nextData = await api('/api/state');
  if (state.workspaceId && state.workspaceId !== nextData.company?.id) resetWorkspaceView();
  state.workspaceId = nextData.company?.id || null;
  state.data = nextData;
  state.session = { user: state.data.user, company: state.data.company };
  renderShell();
}
function brand() {
  return el('div', { class: 'brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'w'), el('span', {}, 'workwork', el('span', { class: 'brand-cloud' }, 'CLOUD')));
}
function field(label, name, { type = 'text', value = '', placeholder, required = false, optional = false, help, rows, options, ...extra } = {}) {
  const id = `field-${++fieldSequence}`;
  const attributes = { id, name, value, required, placeholder, ...extra };
  let input;
  if (type === 'textarea') input = el('textarea', { ...attributes, rows: rows || 3 });
  else if (type === 'select') {
    input = el('select', { ...attributes }, (options || []).map(option => el('option', { value: option.value }, option.label)));
    input.value = value;
  } else input = el('input', { ...attributes, type });
  const helpId = help ? `${id}-help` : null;
  if (helpId) input.setAttribute('aria-describedby', helpId);
  const container = el('div', { class: 'field' }, el('label', { for: id, class: 'field-label' }, label, optional && el('span', { class: 'optional' }, 'optional')), input, help && el('div', { id: helpId, class: 'field-help' }, help));
  return container;
}
function formError() { return el('div', { class: 'form-error', role: 'alert', tabindex: '-1' }); }
function formValues(form) { return Object.fromEntries(new FormData(form)); }
function bindSubmit(form, errorBox, handler) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]');
    const label = submit?.textContent;
    if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
    errorBox.textContent = '';
    try { await handler(formValues(form)); }
    catch (error) { errorBox.textContent = error.message; errorBox.focus(); }
    finally { if (submit) { submit.disabled = false; submit.textContent = label; } }
  });
}
function empty(title, text, action = null, symbol = '↗') {
  return el('div', { class: 'empty' }, el('div', { class: 'empty-symbol', 'aria-hidden': 'true' }, symbol), el('h3', {}, title), el('p', {}, text), action);
}
function section(title, subtitle, body, action) {
  return el('section', { class: 'section' }, el('div', { class: 'section-header' }, el('div', {}, el('h2', {}, title), subtitle && el('p', {}, subtitle)), action), body);
}
function modal(title, subtitle, content) {
  dialogRoot.replaceChildren();
  const dialog = el('dialog', { 'aria-labelledby': 'dialog-title' });
  const close = () => dialog.close();
  dialog.append(el('div', { class: 'dialog-header' }, el('div', {}, el('h2', { id: 'dialog-title' }, title), subtitle && el('p', {}, subtitle)), el('button', { type: 'button', class: 'dialog-close', 'aria-label': 'Close dialog', onclick: close }, '×')), el('div', { class: 'dialog-body' }, content));
  dialog.addEventListener('click', event => { if (event.target === dialog && !event.target.closest('.dialog-body')) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } });
  dialog.addEventListener('close', () => dialog.remove());
  dialogRoot.append(dialog);
  dialog.showModal();
  return dialog;
}
function renderAuth() {
  const mode = state.authMode;
  const errorBox = formError();
  const signup = mode === 'signup';
  const join = mode === 'join';
  const form = el('form', { class: 'form' },
    signup && field('Company name', 'companyName', { required: true, maxlength: 120, autocomplete: 'organization', placeholder: 'Your company' }),
    (signup || join) && field('Your name', 'name', { required: true, maxlength: 100, autocomplete: 'name', placeholder: 'Full name' }),
    !join && field('Work email', 'email', { type: 'email', required: true, maxlength: 254, autocomplete: 'email', placeholder: 'you@company.com' }),
    field('Password', 'password', { type: 'password', required: true, minlength: signup || join ? 12 : undefined, maxlength: 200, autocomplete: signup || join ? 'new-password' : 'current-password', help: signup || join ? 'Use at least 12 characters.' : null }),
    errorBox,
    el('button', { type: 'submit', class: 'button auth-submit' }, join ? 'Join your company' : signup ? 'Create company workspace' : 'Sign in')
  );
  bindSubmit(form, errorBox, async values => {
    if (join) values.token = new URLSearchParams(location.search).get('invite');
    const result = await api(`/api/${join ? 'join' : signup ? 'signup' : 'login'}`, { method: 'POST', body: values });
    state.session = result;
    const session = await api('/api/session');
    state.session = session;
    state.csrfToken = session.csrfToken || state.csrfToken;
    if (join) history.replaceState({}, '', location.pathname);
    await refresh();
    notify(signup ? 'Your company workspace is ready. Start with a goal or a work entry.' : join ? 'Welcome to your company workspace.' : 'Welcome back.');
  });
  const changeMode = next => { state.authMode = next; renderAuth(); };
  app.replaceChildren(el('main', { class: 'auth-layout' },
    el('aside', { class: 'auth-story' }, brand(), el('div', { class: 'auth-story-content' }, el('div', { class: 'eyebrow' }, 'Clarity from everyday work'), el('h1', {}, 'Bring company goals', el('br'), 'closer to the', el('br'), 'work being done.'), el('p', {}, 'A shared place for your team’s work, your company’s direction, and the evidence that connects them.'), el('div', { class: 'auth-flow' }, el('span', {}, el('b', {}, '01'), 'Capture work in your own words'), el('span', {}, el('b', {}, '02'), 'See the process taking shape'), el('span', {}, el('b', {}, '03'), 'Understand what needs attention'))), el('div', { class: 'auth-footer' }, 'WORK  /  GOALS  /  REVIEW')),
    el('section', { class: 'auth-main' }, el('div', { class: 'auth-box' }, !join && el('div', { class: 'auth-tabs' }, el('button', { type: 'button', class: `tab-button${!signup ? ' active' : ''}`, onclick: () => changeMode('login') }, 'Sign in'), el('button', { type: 'button', class: `tab-button${signup ? ' active' : ''}`, onclick: () => changeMode('signup') }, 'Create a company')), el('h2', {}, join ? 'Join your team' : signup ? 'A clearer way to work.' : 'Welcome back.'), el('p', { class: 'auth-subtitle' }, join ? 'Set up your account using your company’s invitation.' : signup ? 'Create an independent workspace for your company.' : 'Sign in to your company workspace.'), join && el('div', { class: 'auth-note' }, 'This invitation connects you to an existing company. Your email was selected by the inviting manager.'), form, el('p', { class: 'auth-small' }, signup ? 'You’ll be the company manager. Invite team members after signing in. Each company has a separate workspace.' : join ? 'Already have an account? Sign in using the account associated with your company.' : 'Your account connects you to the company you joined.'), join && button('Back to sign in', () => { history.replaceState({}, '', location.pathname); changeMode('login'); }, 'quiet')))
  ));
}
function setView(view) { state.view = view; renderShell(); document.querySelector('#page-title')?.focus({ preventScroll: true }); }
function renderShell() {
  if (!state.session?.user || !state.data) return renderAuth();
  const { user, company } = state.session;
  const names = { work: 'Work', goals: 'Goals', review: 'Review' };
  const icons = { work: '▤', goals: '◎', review: '◫' };
  const initials = (user.name || user.email || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const logout = async () => { try { await api('/api/logout', { method: 'POST' }); state.session = null; state.data = null; state.csrfToken = null; state.workspaceId = null; resetWorkspaceView(); state.authMode = 'login'; renderAuth(); } catch (error) { notify(error.message, true); } };
  const sidebar = el('aside', { class: 'sidebar' }, brand(), el('span', { class: 'mobile-brand' }, company.name), el('div', { class: 'company-label' }, 'Your workspace'), el('div', { class: 'company-name' }, company.name), el('nav', { class: 'nav', 'aria-label': 'Main navigation' }, Object.entries(names).map(([key, title]) => el('button', { type: 'button', class: `nav-button${state.view === key ? ' active' : ''}`, 'aria-current': state.view === key ? 'page' : null, onclick: () => setView(key) }, el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icons[key]), title))), el('p', { class: 'nav-note' }, 'Your team’s work.', el('br'), 'Your company’s direction.', el('br'), 'One shared picture.'), el('div', { class: 'sidebar-bottom' }, isManager() && el('button', { type: 'button', class: 'invite-button', onclick: inviteModal }, '+ Invite a teammate'), el('div', { class: 'account' }, el('div', { class: 'avatar', 'aria-hidden': 'true' }, initials), el('div', { class: 'account-info' }, el('div', { class: 'account-name' }, user.name), el('div', { class: 'account-role' }, user.role))), el('button', { type: 'button', class: 'logout', onclick: logout }, 'Sign out')));
  const workspace = el('main', { class: 'workspace' }, el('div', { class: 'topbar' }, el('div', { class: 'breadcrumb' }, 'Workspace', el('span', { 'aria-hidden': 'true' }, '/'), el('strong', {}, names[state.view])), el('div', { class: 'workspace-status' }, el('span', { class: 'dot' }), 'Company workspace'), el('div', { class: 'desktop-hidden button-row' }, isManager() && button('Invite', inviteModal, 'quiet'), button('Sign out', logout, 'quiet'))), state.view === 'work' ? workView() : state.view === 'goals' ? goalsView() : reviewView());
  app.replaceChildren(el('div', { class: 'shell' }, sidebar, workspace));
}
function pageHeader(eyebrow, title, subtitle, action) { return el('header', { class: 'page-header' }, el('div', {}, el('div', { class: 'eyebrow' }, eyebrow), el('h1', { id: 'page-title', tabindex: '-1' }, title), el('p', { class: 'subtitle' }, subtitle)), action); }
function summaryStrip(items) { return el('div', { class: 'summary-strip' }, items.map(([value, label]) => el('div', { class: 'summary-item' }, el('div', { class: 'summary-value' }, value), el('div', { class: 'summary-label' }, label)))); }
function workView() {
  const data = state.data;
  const logs = arr(data.logs);
  const tasks = arr(data.tasks);
  const review = data.review || {};
  const errorBox = formError();
  const selectedCase = arr(data.cases).find(item => item.id === state.draft.caseId);
  const narrative = field('What did you work on?', 'text', { type: 'textarea', required: true, maxlength: 12000, value: state.draft.text || '', class: 'narrative', placeholder: 'Describe the work, what happened, and any order or lot reference.\nFor example: Inspected order DEMO-104. Two parts need rework before packaging.' });
  const context = el('details', { class: 'context-details', open: Boolean(state.draft.result || state.draft.nextDependency || state.draft.occurredAt) }, el('summary', { class: 'context-toggle' }, 'Add useful context'), el('div', { class: 'form' }, field('Result / output', 'result', { type: 'textarea', value: state.draft.result || '', maxlength: 4000, optional: true, rows: 2, placeholder: 'What was produced, changed, or confirmed?' }), field('Next dependency', 'nextDependency', { value: state.draft.nextDependency || '', maxlength: 2000, optional: true, placeholder: 'What or whom are you waiting for?' }), field('When did this happen?', 'occurredAt', { type: 'datetime-local', value: state.draft.occurredAt || '', optional: true, help: 'Leave blank if the actual time is unknown. We keep record time separately.' })));
  const form = el('form', { class: 'form' }, selectedCase && el('div', { class: 'continuation' }, el('span', {}, 'Continuing: ', el('strong', {}, selectedCase.title)), el('button', { type: 'button', onclick: () => { delete state.draft.caseId; renderShell(); }, 'aria-label': 'Stop continuing this case' }, '×')), narrative, context, errorBox, el('div', { class: 'form-footer' }, el('p', {}, 'Just describe your work. Related activities and suggested goal links are extracted automatically.'), el('button', { type: 'submit', class: 'button' }, 'Save work entry')));
  form.addEventListener('input', () => { state.draft = { ...state.draft, ...formValues(form) }; });
  bindSubmit(form, errorBox, async values => {
    const body = { text: values.text, result: values.result || '', nextDependency: values.nextDependency || '' };
    if (state.draft.caseId) body.caseId = state.draft.caseId;
    if (values.occurredAt) body.occurredAt = new Date(values.occurredAt).toISOString();
    await api('/api/logs', { method: 'POST', body });
    state.draft = {};
    form.reset();
    notify('Work saved. Its evidence is now available in Review.');
    await refresh();
  });
  const compose = section('Your work, in your words', 'No goal mapping or process drawing needed.', el('div', { class: 'section-body' }, form));
  const recent = section('Recent work', 'A shared record of what happened.', logs.length ? el('div', { class: 'item-list' }, [...logs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 15).map(logCard)) : empty('Start with today’s work', 'Save your first work entry above. The service will extract activities and begin a case history.', null, '▤'), logs.length ? badge(`${logs.length} entries`) : null);
  const taskSection = section('Team commitments', 'Work authorized by your company.', tasks.length ? el('div', { class: 'item-list' }, [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')).map(taskCard)) : empty('No tasks assigned yet', isManager() ? 'Add a concrete task for your team when a company goal needs action.' : 'Tasks created by your manager will appear here.', isManager() ? button('Create a task', taskModal, 'secondary small') : null, '✓'), isManager() && tasks.length ? button('+ Add task', taskModal, 'quiet') : null);
  taskSection.append(el('p', { class: 'small-note' }, 'Completing a task records work status. Business outcomes are measured separately.'));
  const onboarding = el('div', { class: 'learning-strip' }, el('div', { class: 'eyebrow' }, 'A useful first week'), el('p', {}, el('strong', {}, 'One team. One recurring problem.'), ' Add a company goal, capture daily work, and review the evidence together.'), button('See company goals →', () => setView('goals'), 'quiet'));
  return el('div', {}, pageHeader('Everyday work', 'Make work visible.', 'Capture what your team is doing. See how it connects over time.'), summaryStrip([[logs.length, 'Work entries'], [arr(data.cases).length, 'Work cases'], [tasks.filter(task => task.status !== 'done').length, 'Open team tasks'], [arr(data.goals).length, 'Company objectives']]), el('div', { class: 'work-columns' }, el('div', { class: 'stack' }, compose, recent), el('div', { class: 'stack' }, taskSection, onboarding, el('div', { class: 'learning-strip' }, el('div', { class: 'eyebrow' }, 'Automatic understanding'), el('p', {}, data.extraction?.label || 'Automatic text extraction · baseline'), el('p', {}, 'Suggestions stay linked to your original words. Check the sources before making decisions.'), button(`Review ${review.summary?.eventCount || 0} recorded activities →`, () => setView('review'), 'quiet')))));
}
function logCard(log) {
  const eventCases = [...new Set(arr(log.analysis?.events).map(event => event.caseId).filter(Boolean))];
  const caseId = log.caseId || (eventCases.length === 1 ? eventCases[0] : null);
  return el('article', { class: 'list-item' }, el('div', { class: 'item-top' }, el('div', { class: 'meta' }, el('strong', {}, log.authorName || 'Team member'), '·', date(log.createdAt, true)), badge(`${arr(log.analysis?.events).length} activities`, 'outline')), el('p', { class: 'log-text clamp' }, log.text), log.result && el('p', { class: 'log-result' }, log.result), el('div', { class: 'item-footer' }, button('View evidence', () => sourceModal(log.id), 'quiet'), caseId && button('Continue this work →', () => continueCase(caseId), 'quiet')));
}
function taskCard(task) {
  const done = task.status === 'done';
  const goal = arr(state.data.goals).find(item => item.id === task.goalId);
  const toggle = el('button', { type: 'button', class: `task-toggle${done ? ' done' : ''}`, 'aria-label': `${done ? 'Reopen' : 'Complete'} task: ${task.title}`, 'aria-pressed': String(done), onclick: async () => {
    toggle.disabled = true;
    try { await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', body: { status: done ? 'open' : 'done' } }); await refresh(); notify(done ? 'Task reopened.' : 'Task marked done.'); }
    catch (error) { notify(error.message, true); toggle.disabled = false; }
  } }, done ? '✓' : '');
  return el('article', { class: 'list-item task-row' }, toggle, el('div', { class: 'task-content' }, el('h3', {}, task.title), task.description && el('p', { class: 'task-description' }, task.description), el('div', { class: 'meta' }, done && badge('Done', 'green'), task.dueDate && `Due ${date(task.dueDate)}`, goal && `Goal: ${goal.title}`), task.caseId && button('Continue related work →', () => continueCase(task.caseId), 'quiet')));
}
function continueCase(id) {
  state.draft.caseId = id;
  state.view = 'work';
  renderShell();
  document.querySelector('textarea[name=text]')?.focus();
  document.querySelector('textarea[name=text]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function goalsView() {
  const goals = arr(state.data.goals);
  const requirements = arr(state.data.requirements);
  const tabs = el('div', { class: 'tab-row', role: 'tablist', 'aria-label': 'Company direction' }, [['objectives', 'Objectives & measures'], ['processes', 'Required processes']].map(([key, label]) => el('button', { class: `tab-button${state.goalTab === key ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(state.goalTab === key), onclick: () => { state.goalTab = key; renderShell(); } }, label)));
  const actions = isManager() ? el('div', { class: 'button-row' }, button(state.goalTab === 'objectives' ? '+ Add objective' : '+ Add process', state.goalTab === 'objectives' ? goalModal : requirementModal)) : null;
  const content = state.goalTab === 'objectives' ? goals.length ? el('div', { class: 'goal-grid' }, goals.map(goalCard)) : section('Give work a direction', 'Start with a measurable business objective.', empty('What should improve?', 'Set one outcome, its target, and a period. Your team can keep logging work without manually choosing a goal.', isManager() ? button('Add your first objective', goalModal) : null, '◎')) : requirements.length ? section('Required processes', 'Management-defined requirements remain separate from observed activity.', el('div', {}, requirements.map(requirement => el('article', { class: 'process-row' }, el('div', { class: 'item-top' }, el('h3', {}, requirement.title), badge(`Version ${requirement.version || 1}`, 'outline')), el('div', { class: 'scope-line' }, `Scope: ${requirement.scope} · Effective ${date(requirement.effectiveFrom)}`), el('p', { class: 'description' }, `When: ${requirement.trigger}`), el('div', { class: 'process-steps' }, arr(requirement.steps).flatMap((step, index) => [index > 0 && el('span', { class: 'step-arrow', 'aria-hidden': 'true' }, '→'), el('div', { class: 'step-chip' }, el('span', { class: 'step-number' }, String(index + 1).padStart(2, '0')), typeof step === 'string' ? step : step.title)])), el('p', { class: 'description' }, 'Review checks recorded evidence against these requirements. Applicability and step matches are provisional.'))))) : section('Define what must happen', 'Only management can set a required process.', empty('A clear operating expectation', 'Describe where the process applies, what starts it, and its required steps. The service compares it with recorded evidence.', isManager() ? button('Add a required process', requirementModal) : null, '→'));
  return el('div', {}, pageHeader('Company direction', 'Make expectations clear.', 'Set outcomes and operating requirements. Let everyday evidence show what is happening.', actions), tabs, content);
}
function goalCard(goal) {
  const metric = arr(state.data.review?.metrics).find(item => item.goalId === goal.id);
  const hasActual = metric?.actual !== null && metric?.actual !== undefined;
  const label = metric?.status === 'met' ? 'Target met' : metric?.status === 'gap' ? 'Outcome gap' : 'Awaiting measurement';
  return el('article', { class: 'goal-card' }, el('div', { class: 'item-top' }, badge(label, metric?.status === 'met' ? 'green' : metric?.status === 'gap' ? 'amber' : 'outline'), el('span', { class: 'meta' }, `${date(goal.periodStart)} – ${date(goal.periodEnd)}`)), el('h2', {}, goal.title), goal.description && el('p', { class: 'description' }, goal.description), el('div', { class: 'goal-reading' }, el('span', { class: 'number' }, hasActual ? number(metric.actual) : '—'), el('span', { class: 'unit' }, goal.unit), el('span', { class: 'meta' }, 'latest recorded actual')), el('p', { class: 'goal-target' }, `${goal.metricName} · Target ${goal.direction === 'at_most' ? '≤' : '≥'} ${number(goal.target)} ${goal.unit}`), el('div', { class: 'goal-meta' }, el('span', {}, `Scope: ${goal.scope || 'Company'}`), goal.baseline !== null && goal.baseline !== undefined && el('span', {}, `Baseline: ${number(goal.baseline)} ${goal.unit}`)), hasActual && el('p', { class: 'metric-source' }, `Source: ${metric.source || 'Manual measurement'}`), el('div', { class: 'goal-divider button-row' }, isManager() && button('+ Record measurement', () => measurementModal(goal), 'secondary small'), button('View in Review →', () => setView('review'), 'quiet')));
}
function goalModal() {
  const start = localDate();
  const end = localDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
  const errorBox = formError();
  const form = el('form', { class: 'form' }, field('Objective', 'title', { required: true, maxlength: 200, placeholder: 'Improve on-time delivery' }), field('What does success mean?', 'description', { type: 'textarea', optional: true, maxlength: 2000, rows: 2, placeholder: 'The business outcome your team is working toward.' }), el('div', { class: 'field-grid' }, field('Metric name', 'metricName', { required: true, maxlength: 120, placeholder: 'On-time delivery rate' }), field('Unit', 'unit', { required: true, maxlength: 40, placeholder: '%' })), field('Measurement scope', 'scope', { required: true, maxlength: 300, value: 'Company', help: 'Use the same scope when recording an actual. For example: Company, Line A, or domestic orders.' }), el('div', { class: 'field-grid' }, field('Target', 'target', { type: 'number', step: 'any', required: true, placeholder: '95' }), field('Target direction', 'direction', { type: 'select', value: 'at_least', options: [{ value: 'at_least', label: 'At least (≥)' }, { value: 'at_most', label: 'At most (≤)' }] })), el('div', { class: 'field-grid' }, field('Period starts', 'periodStart', { type: 'date', required: true, value: start }), field('Period ends', 'periodEnd', { type: 'date', required: true, value: end })), field('Baseline', 'baseline', { type: 'number', step: 'any', optional: true, placeholder: 'Previous value, if known' }), errorBox, el('div', { class: 'button-row' }, el('button', { class: 'button', type: 'submit' }, 'Create objective')));
  const dialog = modal('Add a company objective', 'Define one outcome and how you will measure it.', form);
  bindSubmit(form, errorBox, async values => { await api('/api/goals', { method: 'POST', body: { ...values, target: Number(values.target), ...(values.baseline !== '' ? { baseline: Number(values.baseline) } : { baseline: undefined }) } }); dialog.close(); await refresh(); notify('Objective created. Team work can now be associated with it.'); });
}
function requirementModal() {
  const errorBox = formError();
  const form = el('form', { class: 'form' }, field('Process name', 'title', { required: true, maxlength: 200, placeholder: 'Quality release before shipment' }), field('Where does it apply?', 'scope', { required: true, maxlength: 300, placeholder: 'All finished-goods shipments' }), field('What starts this process?', 'trigger', { required: true, maxlength: 500, placeholder: 'An order is ready for shipment' }), field('Required steps — one per line', 'steps', { type: 'textarea', required: true, rows: 5, maxlength: 6000, placeholder: 'Inspect the finished goods\nRecord the inspection result\nApprove release\nHand over for shipment', help: 'Write concrete actions and expected outputs. These become version 1 of this requirement.' }), field('Effective from', 'effectiveFrom', { type: 'date', required: true, value: localDate() }), el('p', { class: 'notice' }, 'Saving makes this a management-defined requirement. Evidence matches are suggestions; they do not establish compliance or nonperformance.'), errorBox, el('div', { class: 'button-row' }, el('button', { class: 'button', type: 'submit' }, 'Create requirement')));
  const dialog = modal('Add a required process', 'Define the company’s prescribed process, separately from the process observed in work.', form);
  bindSubmit(form, errorBox, async values => { await api('/api/requirements', { method: 'POST', body: { ...values, steps: values.steps.split('\n').map(step => step.trim()).filter(Boolean) } }); dialog.close(); await refresh(); notify('Required process created as version 1.'); });
}
function taskModal() {
  const errorBox = formError();
  const goals = arr(state.data.goals);
  const cases = arr(state.data.cases);
  const form = el('form', { class: 'form' }, field('Team task', 'title', { required: true, maxlength: 200, placeholder: 'Resolve the packaging delay for this week’s orders' }), field('Instructions', 'description', { type: 'textarea', optional: true, maxlength: 2000, rows: 3, placeholder: 'The work you are authorizing the team to carry out.' }), field('Supports an objective', 'goalId', { type: 'select', optional: true, options: [{ value: '', label: 'No objective selected' }, ...goals.map(goal => ({ value: goal.id, label: goal.title }))] }), field('Related work case', 'caseId', { type: 'select', optional: true, options: [{ value: '', label: 'No existing case' }, ...cases.map(item => ({ value: item.id, label: item.title }))] }), field('Due date', 'dueDate', { type: 'date', optional: true }), el('p', { class: 'notice' }, 'This is a team commitment authorized by you. Any member of your company can mark it done.'), errorBox, el('div', { class: 'button-row' }, el('button', { type: 'submit', class: 'button' }, 'Create team task')));
  const dialog = modal('Authorize a team task', 'Turn a company expectation into concrete work.', form);
  bindSubmit(form, errorBox, async values => { const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')); await api('/api/tasks', { method: 'POST', body }); dialog.close(); await refresh(); notify('Team task created.'); });
}
function measurementModal(goal) {
  const errorBox = formError();
  const form = el('form', { class: 'form' }, el('p', { class: 'notice' }, `${goal.metricName} · Target ${goal.direction === 'at_most' ? '≤' : '≥'} ${number(goal.target)} ${goal.unit}`), el('div', { class: 'field-grid' }, field('Measured value', 'value', { type: 'number', step: 'any', required: true }), field('Unit', 'unit', { value: goal.unit, required: true, maxlength: 40 })), field('Measurement scope', 'scope', { value: goal.scope || 'Company', required: true, maxlength: 300 }), field('Observation date', 'observedAt', { type: 'date', required: true, value: localDate() }), field('Source / evidence reference', 'source', { type: 'textarea', required: true, maxlength: 1000, rows: 2, placeholder: 'For example: Weekly dispatch report, 15 September, 47 of 50 orders delivered on time.', help: 'Enter the source you checked. This is a manually recorded measurement, not a verified system integration.' }), el('p', { class: 'field-help' }, `Only matching units and scope within ${date(goal.periodStart)} – ${date(goal.periodEnd)} are compared with this target.`), errorBox, el('div', { class: 'button-row' }, el('button', { class: 'button', type: 'submit' }, 'Record measurement')));
  const dialog = modal('Record an actual result', goal.title, form);
  bindSubmit(form, errorBox, async values => { await api('/api/measurements', { method: 'POST', body: { ...values, goalId: goal.id, value: Number(values.value) } }); dialog.close(); await refresh(); notify('Measurement recorded with its source.'); });
}
function inviteModal() {
  const errorBox = formError();
  const resultBox = el('div');
  const form = el('form', { class: 'form' }, field('Teammate’s email', 'email', { type: 'email', required: true, maxlength: 254, placeholder: 'teammate@company.com', autocomplete: 'off' }), el('p', { class: 'field-help' }, 'They will join your company as a member. This creates a private invitation link for you to share; it does not send an email.'), errorBox, el('div', { class: 'button-row' }, el('button', { type: 'submit', class: 'button' }, 'Create invitation')));
  modal('Invite a teammate', `Add a member to ${state.session.company.name}.`, el('div', {}, form, resultBox));
  bindSubmit(form, errorBox, async values => {
    const { invite } = await api('/api/invites', { method: 'POST', body: values });
    const url = new URL('/', location.origin); url.searchParams.set('invite', invite.token);
    const input = el('input', { readonly: true, value: url.href, 'aria-label': 'Invitation link' });
    resultBox.replaceChildren(el('div', { class: 'invite-result' }, el('h3', {}, 'Invitation ready'), el('p', {}, `Share this link with ${invite.email}. Expires ${date(invite.expiresAt)}.`), input, button('Copy invitation link', async () => { try { await navigator.clipboard.writeText(url.href); notify('Invitation link copied.'); } catch { input.focus(); input.select(); notify('Select and copy the invitation link.'); } }, 'secondary small'), el('p', {}, 'Keep this link private. The invitation token is shown here once.')));
  });
}
function reviewView() {
  const review = state.data.review || {};
  const metrics = arr(review.metrics);
  const cases = arr(review.cases);
  const summary = review.summary || {};
  const taskStatus = review.tasks || {};
  const metricsSection = section('Outcomes against targets', 'Actuals are compared only when unit, scope, and reporting period match.', metrics.length ? el('div', { class: 'review-table-wrap' }, el('table', { class: 'review-table' }, el('thead', {}, el('tr', {}, ['Objective / measure', 'Target', 'Latest actual', 'Actual − target', 'Status'].map(title => el('th', { scope: 'col' }, title)))), el('tbody', {}, metrics.map(metric => {
    const goal = arr(state.data.goals).find(item => item.id === metric.goalId);
    const available = metric.actual !== null && metric.actual !== undefined;
    return el('tr', {}, el('td', {}, el('div', { class: 'metric-title' }, metric.title), el('div', { class: 'metric-detail' }, `${metric.metricName} · ${metric.scope || 'Company'}`), isManager() && goal && button('+ Measurement', () => measurementModal(goal), 'quiet')), el('td', {}, el('span', { class: 'metric-value' }, `${goal?.direction === 'at_most' ? '≤' : '≥'} ${number(metric.target)}`), el('div', { class: 'metric-detail' }, metric.unit)), el('td', {}, el('span', { class: 'metric-value' }, available ? number(metric.actual) : '—'), el('div', { class: 'metric-source' }, available ? `Source: ${metric.source || 'Manual entry'}` : 'No comparable measurement')), el('td', {}, el('span', { class: 'metric-value' }, available && metric.gap !== null ? `${metric.gap > 0 ? '+' : ''}${number(metric.gap)}` : '—'), available && el('div', { class: 'metric-detail' }, metric.unit?.trim() === '%' ? 'percentage points' : metric.unit)), el('td', {}, badge(metric.status === 'met' ? 'Target met' : metric.status === 'gap' ? 'Gap' : 'No data', metric.status === 'met' ? 'green' : metric.status === 'gap' ? 'amber' : 'outline')));
  })))) : empty('No outcome target yet', 'Add a measurable objective in Goals, then record actual results with a source.', isManager() ? button('Add an objective', goalModal, 'secondary small') : null, '◎'));
  const caseList = el('div');
  function updateCases(query) {
    const filtered = cases.filter(item => `${item.title} ${item.id} ${arr(item.events).map(event => event.text).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    caseList.replaceChildren(...(filtered.length ? filtered.map((item, index) => caseCard(item, index === 0)) : [cases.length ? el('p', { class: 'filtered-empty' }, 'No cases match your search.') : empty('The process starts with evidence', 'Save a work entry to see its extracted activities. Continue an existing case to build a connected work history.', button('Write a work entry', () => setView('work'), 'secondary small'), '→')]));
  }
  updateCases(state.search);
  const search = el('input', { type: 'search', class: 'search-input', value: state.search, placeholder: 'Find a work case…', 'aria-label': 'Search work cases', oninput: event => { state.search = event.target.value; updateCases(state.search); } });
  const evidence = section('How the work unfolds', 'Observed activities, suggested goal links, and required steps.', caseList, cases.length ? search : null);
  evidence.append(el('p', { class: 'small-note' }, 'A timeline shows recorded evidence. Sequence alone does not prove a dependency. Missing evidence does not mean work was not performed.'));
  const guide = el('aside', { class: 'section review-guide' }, el('div', { class: 'eyebrow' }, 'Read the full picture'), el('h2', {}, 'Three separate checks'), el('div', { class: 'guide-item' }, el('div', { class: 'guide-number' }, '01 / WORK'), el('h3', {}, 'Expected vs recorded'), el('p', {}, `${taskStatus.open || 0} open and ${taskStatus.done || 0} completed team tasks. Completion is a reported work status.`)), el('div', { class: 'guide-item' }, el('div', { class: 'guide-number' }, '02 / PROCESS'), el('h3', {}, 'Required vs observed'), el('p', {}, 'Compare management’s prescribed steps with source-linked evidence. Applicability and matches remain provisional.')), el('div', { class: 'guide-item' }, el('div', { class: 'guide-number' }, '03 / OUTCOME'), el('h3', {}, 'Target vs measured actual'), el('p', {}, 'A work entry or completed task does not establish that the business target was achieved.')), el('div', { class: 'review-legend' }, badge('Suggested link', 'blue'), badge('Source evidence', 'green')));
  return el('div', {}, pageHeader('Evidence & alignment', 'See where things stand.', 'Company expectations meet the work your team has actually recorded.'), summaryStrip([[summary.eventCount || 0, 'Recorded activities'], [summary.caseCount ?? cases.length, 'Work cases'], [summary.unlinkedEventCount || 0, 'Activities without goal links'], [metrics.filter(item => item.status === 'gap').length, 'Measured outcome gaps']]), el('div', { class: 'stack' }, metricsSection, el('div', { class: 'review-columns' }, evidence, guide), arr(review.warnings).length > 0 && el('details', { class: 'review-notes' }, el('summary', {}, 'How to interpret this review'), el('ul', {}, arr(review.warnings).map(warning => el('li', {}, warning))))));
}
function caseCard(item, initiallyOpen = false) {
  const events = arr(item.events);
  const links = arr(item.goalLinks);
  const requirements = arr(item.requirements);
  const dependencies = arr(item.dependencies);
  const caseSource = arr(state.data.cases).find(source => source.id === item.id);
  const body = el('div', { class: 'case-detail' }, el('div', { class: 'case-actions' }, el('span', { class: 'case-reference' }, caseSource?.reference || 'Case with source-linked activity'), button('Continue this work →', () => continueCase(item.id), 'secondary small')), el('h3', { class: 'mini-heading' }, 'Evidence timeline'), el('div', { class: 'timeline' }, events.map(event => {
    const status = { completed: ['Completed', 'green'], in_progress: ['In progress', 'blue'], planned: ['Planned', 'outline'], blocked: ['Blocked', 'amber'], recorded: ['Recorded', 'outline'] }[event.status] || ['Recorded', 'outline'];
    const sourceLabel = { result: 'Source · Result/output', nextDependency: 'Source · Next dependency' }[event.sourceField] || 'Source';
    return el('div', { class: 'timeline-event' }, el('div', { class: 'timeline-line', 'aria-hidden': 'true' }), el('div', { class: 'timeline-content' }, el('p', {}, event.text || event.action), el('div', { class: 'meta' }, badge(...status), event.authorName || 'Team member', '·', `${event.occurredAt ? 'Occurred' : 'Recorded'} ${date(event.occurredAt || event.recordedAt, true)}`, el('button', { type: 'button', class: 'evidence-link', onclick: () => sourceModal(event.logId, event.sourceQuote) }, sourceLabel), event.caseAmbiguous && badge('Case identity uncertain', 'amber'))));
  })), el('h3', { class: 'mini-heading' }, 'Suggested objective relationships'), links.length ? el('div', { class: 'link-list' }, links.map(link => { const goal = arr(state.data.goals).find(goal => goal.id === link.goalId); return el('div', { class: 'suggestion' }, el('div', { class: 'item-top' }, el('strong', {}, goal?.title || 'Company objective'), badge('Suggested', 'blue')), el('p', {}, link.reason || 'Possible relationship based on source text.')); })) : el('p', { class: 'inline-empty' }, 'No objective relationship is supported by the current extraction. This work may still be necessary.'), dependencies.length > 0 && el('h3', { class: 'mini-heading' }, 'Explicit dependencies'), dependencies.map(dependency => { const from = events.find(event => event.id === dependency.fromEventId); const to = events.find(event => event.id === dependency.toEventId); return el('div', { class: 'dependency' }, from && to ? `${from.action || from.text} → ${to.action || to.text}` : dependency.reason, el('p', { class: 'description' }, dependency.reason)); }), el('h3', { class: 'mini-heading' }, 'Required vs recorded process'), requirements.length ? requirements.map(requirement => el('div', { class: 'requirement-check' }, el('div', { class: 'item-top' }, el('h3', {}, requirement.title), badge(`v${requirement.version} · Suggested match`, 'outline')), arr(requirement.steps).map(step => el('div', { class: 'requirement-step' }, el('div', { class: 'item-top' }, el('span', {}, step.title), badge(step.status === 'evidence_found' ? 'Potential evidence' : 'Not evidenced', step.status === 'evidence_found' ? 'green' : 'outline')), arr(step.evidence).map(evidence => el('button', { type: 'button', class: 'evidence-link', onclick: () => sourceModal(evidence.logId, evidence.quote) }, evidence.quote || 'Open supporting evidence')))), el('p', { class: 'field-help' }, 'Check applicability and evidence before drawing a conclusion.'))) : el('p', { class: 'inline-empty' }, 'No applicable process requirement has been suggested for this case.'));
  return el('details', { class: 'case-item', open: Boolean(state.search) || initiallyOpen }, el('summary', {}, el('div', {}, el('div', { class: 'case-title' }, item.title || 'Work case'), el('div', { class: 'case-subtitle' }, `${events.length} ${events.length === 1 ? 'activity' : 'activities'} · ${links.length} suggested ${links.length === 1 ? 'goal link' : 'goal links'}`))), body);
}
function sourceModal(logId, quote) {
  const log = arr(state.data.logs).find(item => item.id === logId);
  if (!log) { notify('This source is not available in the current workspace.', true); return; }
  const warnings = arr(log.analysis?.warnings);
  const engine = log.analysis?.engine === 'openai' ? 'AI extraction' : log.analysis?.engine === 'rules' ? 'Baseline text extraction' : 'Extraction method not recorded';
  modal('Original work evidence', 'Your source record is kept separately from its automatic interpretation.', el('div', {}, badge(engine, 'outline'), el('div', { class: 'meta' }, log.authorName || 'Team member', '·', `Recorded ${date(log.createdAt, true)}`), log.occurredAt && el('div', { class: 'meta' }, `Occurred ${date(log.occurredAt, true)}`), quote && el('div', { class: 'source-detail' }, el('strong', {}, 'Referenced excerpt'), quote), el('p', { class: 'source-text' }, log.text), log.result && el('div', { class: 'source-detail' }, el('strong', {}, 'Result / output'), log.result), log.nextDependency && el('div', { class: 'source-detail' }, el('strong', {}, 'Next dependency'), log.nextDependency), warnings.length > 0 && el('div', { class: 'source-detail' }, el('strong', {}, 'Extraction notes'), warnings.join('\n')), el('p', { class: 'field-help source-footer' }, 'Statements in a work entry are reported evidence. Suggested relationships do not prove a causal contribution to an outcome.')));
}
async function boot() {
  try {
    state.session = await api('/api/session');
    if (state.authMode === 'join') { renderAuth(); return; }
    if (state.session.user) await refresh(); else renderAuth();
  } catch (error) {
    app.replaceChildren(el('main', { class: 'error-page' }, el('h1', {}, 'Unable to open your workspace'), el('p', {}, error.message), button('Try again', boot)));
  }
}
boot();
