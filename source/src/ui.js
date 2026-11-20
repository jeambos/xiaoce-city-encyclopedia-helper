const { validateGuess, chunkGuess, addGroup } = require('./ui-model');
const { groupByProvince, recommendCharacters } = require('./core');
const { classifyGuesses } = require('./adapter');
const { createPageDock } = require('./layout');

const css = `
:host {
  all: initial;
  display: contents;
  font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif;
  color: #1c2f3a;
  --ink: #1c2f3a;
  --muted: #6b7f8a;
  --line: #dbe5ea;
  --line-strong: #c4d4dc;
  --accent: #e48d21;
  --accent-dark: #b96f0d;
  --accent-pale: #fff4e3;
  --bg: #f7fafb;
  --card: #ffffff;
  --link: #176a8e;
  z-index: 2147483646;
}
*, *:before, *:after { box-sizing: border-box; }
button, input { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .45; }
button:focus-visible, input:focus-visible, summary:focus-visible {
  outline: 3px solid #eaaa32;
  outline-offset: 2px;
}
.launcher {
  position: fixed;
  right: 16px;
  bottom: 18px;
  z-index: 2147483646;
  border: 1.5px solid var(--accent);
  border-radius: 7px;
  background: transparent;
  color: var(--title-ink, #333);
  padding: 5px 9px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}
.launcher[aria-pressed="true"] { background: var(--accent); color: #fff; }
.launcher:hover { box-shadow: 0 2px 8px #e48d2144; }
.shell {
  position: fixed;
  right: 0;
  top: 0;
  width: clamp(400px, 32vw, 560px);
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-left: 1px solid var(--line-strong);
  box-shadow: -8px 0 28px #173b5118;
  z-index: 2147483645;
  overflow: hidden;
}
.top {
  background: var(--card);
  color: var(--ink);
  padding: 11px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  flex: none;
}
.brand {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.brand strong {
  font-size: 15px;
  font-weight: 750;
  letter-spacing: .02em;
}
.brand small {
  font: 11px/1.4 Consolas, monospace;
  color: var(--muted);
  letter-spacing: .03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dragHint {
  display: none;
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.top.resizing { background: var(--accent-pale); }
.spacer { flex: 1; }
.content {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  flex: 1;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.primaryCard, .candidates {
  min-width: 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 2px #173b5108;
}
.sectionHead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.sectionHead h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
  color: var(--ink);
}
.sectionHead .minor {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.count {
  font: 11px Consolas, monospace;
  color: var(--muted);
  background: #eef3f5;
  border-radius: 10px;
  padding: 1px 6px;
}
.hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
}
.linkBtn {
  border: 0;
  background: transparent;
  color: var(--link);
  padding: 2px 0;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 2px;
  white-space: nowrap;
}
.linkBtn:hover { color: #0e5574; }
.notice {
  font-size: 12px;
  line-height: 1.5;
  color: #805409;
  background: #fff8e8;
  border: 1px solid #ecd7a8;
  border-radius: 8px;
  padding: 8px 10px;
}
.notice.error { color: #8b302a; background: #fff1ef; border-color: #e9bdb7; }
.notice.success { color: #145e46; background: #e9f7ef; border-color: #b2ddc5; }
.recGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.recGrid.smallGrid { gap: 5px; }
.rec {
  min-width: 0;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  padding: 8px 4px;
}
.rec:hover:not(:disabled) { background: #f2f8fa; }
.rec.lead {
  border-color: var(--accent);
  background: var(--accent-pale);
}
.rec.lead .char { color: var(--accent-dark); }
.rec.lead:hover:not(:disabled) { background: #ffedcf; }
.rec .char {
  font-size: 28px;
  font-weight: 750;
  line-height: 1.1;
}
.rec .meta { font-size: 11px; color: var(--muted); }
.rec.small {
  min-height: 50px;
  border-width: 1px;
  border-color: var(--line);
}
.rec.small .char { font-size: 19px; }
.rec.small .meta { font-size: 10px; }
.moreRec { align-self: flex-start; }
.groupBlock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}
.groupLabel {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--muted);
}
.groupLabel strong { font-size: 12px; color: var(--ink); }
.groups {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.group {
  border: 1px solid var(--line-strong);
  background: #fff;
  color: #31576a;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
}
.group:hover:not(:disabled) { background: #eef7fa; }
.group small {
  margin-left: 4px;
  font: 10px Consolas, monospace;
  color: var(--muted);
}
.group:disabled {
  background: #eef2f4;
  color: #9aa8ae;
  border-color: #dde5e9;
  opacity: 1;
}
.provinceList { display: flex; flex-direction: column; }
.provinceRow {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 7px 0;
  border-top: 1px solid var(--line);
}
.provinceRow:first-child { border-top: 0; padding-top: 0; }
.provinceRow.excluded { opacity: .55; }
.provinceRow.manual { grid-template-columns: 84px minmax(0, 1fr) auto; }
.provinceName {
  font-size: 12px;
  font-weight: 700;
  color: #31576a;
  line-height: 1.8;
  white-space: nowrap;
  padding-top: 1px;
}
.provinceName small {
  margin-left: 4px;
  font: 10px Consolas, monospace;
  color: var(--muted);
  font-weight: 400;
}
.cityList {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 4px;
}
.city {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: #234c60;
  padding: 2px 4px;
  font-size: 14px;
  line-height: 1.45;
}
.city:hover:not(:disabled) {
  background: #eef7fa;
  border-color: #d4e6ed;
}
.city mark {
  background: #ffe9a8;
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
.provinceActions {
  display: flex;
  align-items: flex-start;
  gap: 3px;
  padding-top: 3px;
}
.mini {
  border: 1px solid var(--line-strong);
  background: #fff;
  color: #31576a;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 10px;
  white-space: nowrap;
}
.mini:hover:not(:disabled) { background: #eef7fa; }
.autoBadge {
  font-size: 10px;
  color: #95602a;
  background: #fff1e5;
  border-radius: 4px;
  padding: 2px 4px;
  white-space: nowrap;
}
.advanced {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 2px 18px;
}
details {
  border-top: 1px solid var(--line);
  padding: 2px 0;
}
summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
  padding: 7px 0;
  display: flex;
  align-items: center;
  gap: 6px;
  list-style: none;
  user-select: none;
}
summary::-webkit-details-marker { display: none; }
summary:before {
  content: '▸';
  font-size: 10px;
  color: var(--muted);
  transition: transform .15s;
}
details[open] summary:before { transform: rotate(90deg); }
summary:hover { color: var(--ink); }
.advancedBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 10px;
}
.filterRow {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.filterLabel {
  font-size: 11px;
  font-weight: 700;
  color: #4e7182;
  min-width: 34px;
}
.filterHint {
  font-size: 11px;
  color: #607d8a;
  line-height: 1.5;
}
.seg {
  border: 1px solid #bbd4de;
  border-radius: 6px;
  background: #fff;
  color: #31627a;
  padding: 5px 7px;
  font-size: 12px;
}
.seg.active { background: #145f80; color: #fff; border-color: #145f80; }
.seg:hover:not(:disabled) { background: #e1f1f7; }
.seg.active:hover:not(:disabled) { background: #0d5574; }
.chip {
  border: 1px solid #b4d1dd;
  background: #fff;
  color: #285b74;
  border-radius: 6px;
  padding: 5px 7px;
  font-size: 12px;
}
.chip:hover:not(:disabled) { background: #e1f1f7; }
.chip.negative {
  background: #fff3eb;
  border-color: #e7c5a9;
  color: #995624;
}
.chip small {
  color: #688492;
  font: 11px Consolas, monospace;
  margin-left: 4px;
}
.eyebrow {
  font-size: 11px;
  color: #51768a;
  font-weight: 700;
  letter-spacing: .07em;
}
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
.suggestions .chip { font-size: 14px; }
.guessHistory { display: grid; gap: 5px; }
.historyRow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.historyLabel {
  flex: none;
  min-width: 68px;
  font-size: 11px;
  font-weight: 700;
  color: #597383;
  line-height: 23px;
}
.historyChars { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  background: #e5f6ed;
  color: #226249;
}
.tag.bodyhit { background: #e5f1fb; color: #2b638c; }
.tag.miss { background: #f9e7e6; color: #a2433e; }
.aboutText {
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}
.empty {
  font-size: 12px;
  color: #6c818c;
  line-height: 1.6;
}
@media (max-width: 999px) {
  .shell {
    left: 0;
    right: 0;
    top: auto;
    bottom: 0;
    width: 100vw;
    height: min(var(--mobile-height, min(60dvh, 640px)), calc(100dvh - 80px));
    border-left: 0;
    border-top: 1px solid var(--line-strong);
    border-radius: 14px 14px 0 0;
  }
  .top {
    touch-action: none;
    user-select: none;
    cursor: ns-resize;
  }
  .dragHint { display: block; }
  .panel { padding: 10px; }
  .primaryCard, .candidates { padding: 12px; }
  .provinceRow { grid-template-columns: 68px minmax(0, 1fr); }
  .provinceRow.manual { grid-template-columns: 68px minmax(0, 1fr); }
  .provinceRow.manual .provinceActions { grid-column: 2; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition: none !important; }
}
`;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
}
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function provinceLabel(name) {
  return ({
    '内蒙古自治区': '内蒙古',
    '广西壮族自治区': '广西',
    '西藏自治区': '西藏',
    '宁夏回族自治区': '宁夏',
    '新疆维吾尔自治区': '新疆'
  })[name] || name.replace(/省$|市$|特别行政区$/, '');
}

function createUI(doc, onSubmit) {
  const host = doc.createElement('div');
  host.id = 'city-encyclopedia-helper';
  const root = host.attachShadow({mode: 'open'});
  const style = doc.createElement('style');
  style.textContent = css;
  root.appendChild(style);
  const launcher = doc.createElement('button');
  launcher.className = 'launcher';
  launcher.type = 'button';
  launcher.textContent = '助手';
  launcher.setAttribute('aria-label', '切换城市百科助手');
  root.appendChild(launcher);
  const mount = doc.createElement('div');
  root.appendChild(mount);
  doc.body.appendChild(host);
  const dock = createPageDock(doc);
  const prefs = readJSON('ceh-prefs', {});
  const state = {
    open: prefs.open ?? false,
    focus: prefs.autoFirstClause ?? true,
    autoProvinceExclusion: prefs.autoProvinceExclusion ?? true,
    view: 'focus',
    pending: false,
    message: '',
    messageType: '',
    manualProvince: '',
    excludedProvinces: [],
    challenge: '',
    snapshot: null,
    analysis: null,
    mobileHeight: Number.isFinite(prefs.mobileHeight) ? prefs.mobileHeight : null,
    scrollTop: 0,
    showAllRecs: false,
    manualMode: false,
    details: {history: false, filters: false, about: false}
  };
  const persist = () => saveJSON('ceh-prefs', {
    open: state.open,
    autoFirstClause: state.focus,
    autoProvinceExclusion: state.autoProvinceExclusion,
    mobileHeight: state.mobileHeight
  });
  function positionLauncher() {
    const title = doc.querySelector('h3[data-xiaoce-page-title]') ||
      [...doc.querySelectorAll('h3')].find(el => el.textContent.trim() === '城市百科');
    if (!title) {
      launcher.style.position = 'fixed';
      launcher.style.left = 'auto';
      launcher.style.top = 'auto';
      launcher.style.right = '16px';
      launcher.style.bottom = '18px';
      return;
    }
    const rect = title.getBoundingClientRect(), win = doc.defaultView;
    const range = doc.createRange();
    range.selectNodeContents(title);
    const textRect = range.getBoundingClientRect().width ? range.getBoundingClientRect() : rect;
    let gameRoot = title;
    while (gameRoot.parentElement && gameRoot.parentElement !== doc.body) gameRoot = gameRoot.parentElement;
    const gameRight = gameRoot.parentElement === doc.body ? gameRoot.getBoundingClientRect().right : win.innerWidth;
    const maxLeft = gameRight - (launcher.getBoundingClientRect().width || 48) - 8;
    const besideText = textRect.right + 8 <= maxLeft;
    launcher.style.position = 'absolute';
    launcher.style.left = `${Math.max(8, besideText ? textRect.right + 8 : maxLeft) + win.scrollX}px`;
    launcher.style.top = `${(besideText ? rect.top + Math.max(0, (rect.height - 30) / 2) : rect.bottom + 4) + win.scrollY}px`;
    launcher.style.right = 'auto';
    launcher.style.bottom = 'auto';
    launcher.style.setProperty('--title-ink', win.getComputedStyle(title).color);
  }
  const syncDock = () => { dock.apply(state.open); positionLauncher(); };
  function setChallenge(id) {
    if (state.challenge === id) return false;
    state.challenge = id;
    state.manualProvince = '';
    state.excludedProvinces = [];
    state.view = 'focus';
    state.message = '';
    state.messageType = '';
    state.scrollTop = 0;
    state.showAllRecs = false;
    state.manualMode = false;
    state.details = {history: false, filters: false, about: false};
    return true;
  }
  function render(snapshot, analysis) {
    const oldContent = mount.querySelector('.content');
    if (oldContent) state.scrollTop = oldContent.scrollTop;
    if (snapshot) state.snapshot = snapshot;
    if (analysis) state.analysis = analysis;
    syncDock();
    const s = state.snapshot, a = state.analysis;
    launcher.setAttribute('aria-pressed', String(state.open));
    if (!state.open) { mount.innerHTML = ''; return; }
    const won = s?.status === 'won';
    const available = !!(s && a && (s.status === 'ready' || s.status === 'partial' || won));
    const hard = a?.hard || [], focused = a?.focused?.candidates || hard;
    const focusActive = !!a?.focused?.active;
    const scope = focusActive ? focused : hard;
    const visible = state.view === 'focus' && focusActive ? focused : hard;
    const groups = available ? groupByProvince(visible, a.provinces) : [];
    const guessed = s?.historyComplete ? classifyGuesses(s.guessed, s.pattern, s.body, s.globalMisses) : [];
    const recommendations = available && s.status === 'ready' ? recommendCharacters(scope, s.guessed, 12) : [];
    const provinceRecs = available && s.status === 'ready' && (a?.inference?.provinces?.length || 0) > 1
      ? recommendCharacters(a.inference.provinces, s.guessed, 6) : [];
    const maxLength = s?.maxLength || 10;
    const ready = s?.status === 'ready' && !state.pending;
    const excluded = new Set([...state.excludedProvinces, ...(state.autoProvinceExclusion
      ? (a?.autoExcluded || []).map(p => p.code).filter(code => code !== state.manualProvince) : [])]);
    const statusNotice = s?.status === 'restore' ? '请先在游戏页面选择“恢复进度”或“重新开始”。'
      : s?.status === 'partial' ? '猜字记录与次数不一致；助手暂停自动排除和提交。'
      : s?.status === 'unavailable' ? '无法可靠读取游戏页面；助手已暂停，请使用游戏原输入框。'
      : '';
    const historyRows = [['title', '标题命中'], ['body', '仅正文命中'], ['miss', '全文落选']].map(([kind, label]) => {
      const chars = guessed.filter(x => x.status === kind)
        .map(x => `<span class="tag ${kind === 'body' ? 'bodyhit' : kind}">${esc(x.char)}</span>`).join('');
      return `<div class="historyRow"><span class="historyLabel">${label}</span><div class="historyChars">${chars || '<span class="empty">—</span>'}</div></div>`;
    }).join('');
    const endingHint = a?.ending?.kind === 'ordinary' ? `首句末尾 ${a.ending.slot}：排除省会`
      : a?.ending?.kind === 'capital' ? `首句末尾 ${a.ending.slot}：只看省会` : '首句末尾类型未确定';
    const quickGroups = ['东西南北中', '江河湖海山', '州城市区县', '省自治地区盟']
      .map((group, index) => ({group, index, done: [...group].every(ch => (s?.guessed || []).includes(ch))}))
      .sort((x, y) => Number(x.done) - Number(y.done) || x.index - y.index);
    const recButton = (r, small = false, lead = false) => `<button class="rec${small ? ' small' : ''}${lead ? ' lead' : ''}" data-action="guessChar"
      data-char="${esc(r.char)}" title="点击提交「${esc(r.char)}」；最差仍有 ${r.worst} 个候选" ${ready ? '' : 'disabled'}>
      <span class="char">${esc(r.char)}</span><span class="meta">剩 ${Math.round(r.expected)}</span></button>`;
    const cityButton = c => {
      const length = [...c.name].length;
      const chunks = Math.ceil(length / maxLength);
      const cost = chunks > 1 ? `${length} 字 · ${chunks} 次` : `${length} 字`;
      return `<button class="city" data-action="guessCity" data-name="${esc(c.name)}"
        title="点击提交「${esc(c.name)}」（${cost}）" ${ready ? '' : 'disabled'}>${[...c.name]
        .map((ch, i) => s.pattern[i] === ch ? `<mark>${esc(ch)}</mark>` : esc(ch)).join('')}</button>`;
    };
    const provinceRow = p => {
      const isExcluded = excluded.has(p.code);
      const isManual = state.manualProvince === p.code;
      const actions = state.manualMode && !won ? `<span class="provinceActions">
        <button class="mini" data-action="manualProvince" data-code="${esc(p.code)}" ${isManual ? 'disabled' : ''}>${isManual ? '已聚焦' : '聚焦'}</button>
        ${state.excludedProvinces.includes(p.code)
          ? `<button class="mini" data-action="restoreProvince" data-code="${esc(p.code)}">恢复</button>`
          : isExcluded ? '<span class="autoBadge">推测排除</span>'
          : `<button class="mini" data-action="excludeProvince" data-code="${esc(p.code)}">排除</button>`}
      </span>` : '';
      return `<div class="provinceRow${state.manualMode ? ' manual' : ''}${isExcluded ? ' excluded' : ''}">
        <div class="provinceName"><strong data-province="${esc(p.name)}" title="${esc(p.name)}">${esc(provinceLabel(p.name))}</strong><small>${p.cities.length}</small></div>
        <div class="cityList">${p.cities.map(cityButton).join('')}</div>
        ${actions}
      </div>`;
    };
    const leadRecs = recommendations.slice(0, 3);
    const moreRecs = recommendations.slice(3, state.showAllRecs ? 12 : 6);
    const candidateHint = !available ? ''
      : won ? ''
      : state.pending ? ''
      : s.status !== 'ready' ? '页面状态未核实，暂不可提交；请先在游戏页面完成恢复或核对记录。'
      : focusActive ? (state.view === 'focus'
        ? `已按首句线索聚焦；点击城市名直接提交（按名称长度计次），完整候选 ${hard.length} 个可复查。`
        : `正在查看完整候选；点击城市名直接提交（按名称长度计次），返回聚焦可只看 ${focused.length} 个。`)
      : '点击城市名直接提交（按名称长度计次）。';
    const primaryPanel = won ? '' : `<section class="primaryCard" aria-label="下一步">
      ${statusNotice ? `<div class="notice ${s?.status === 'unavailable' ? 'error' : ''}">${esc(statusNotice)}</div>` : ''}
      <div class="sectionHead"><h2>下一步</h2><span class="spacer"></span>
        <span class="minor" data-scope-count="${scope.length}">${available ? `按 ${scope.length} 个候选` : '读取中'}</span></div>
      ${ready ? '<div class="hint">点击即提交，每个字消耗 1 次猜测。</div>' : ''}
      ${recommendations.length ? `<div class="recGrid">${leadRecs.map((r, i) => recButton(r, false, i === 0)).join('')}</div>
        ${moreRecs.length ? `<div class="recGrid smallGrid">${moreRecs.map(r => recButton(r, true)).join('')}</div>` : ''}
        ${recommendations.length > 6 ? `<button class="linkBtn moreRec" data-action="toggleMoreRec">${state.showAllRecs ? '收起建议' : `更多建议（${recommendations.length - 6}）`}</button>` : ''}`
        : `<div class="empty">${ready ? '候选不足或页面记录尚未核实。' : '等待页面状态可靠后显示建议。'}</div>`}
      ${state.message ? `<div class="notice ${state.messageType}">${esc(state.message)}</div>` : ''}
      <div class="groupBlock">
        <div class="groupLabel"><strong>常用字组</strong><span>点击整组提交，自动跳过已猜字</span></div>
        <div class="groups">${quickGroups.map(({group, done}) => {
          const value = addGroup('', s?.guessed || [], group);
          return `<button class="group" data-action="guessGroup" data-group="${group}"
            title="提交「${esc(value || group)}」" ${!value || done || !ready ? 'disabled' : ''}>${group}${value ? `<small>+${[...value].length}</small>` : ''}</button>`;
        }).join('')}</div>
      </div>
    </section>`;
    const candidatePanel = `<section class="candidates" aria-label="候选城市">
      <div class="sectionHead"><h2>候选城市</h2><span class="count">${visible.length}</span>
        <span class="spacer"></span>
        ${available && focusActive && !won ? `<button class="linkBtn" data-action="toggleView">${state.view === 'focus' ? `显示完整 ${hard.length}` : `返回聚焦 ${focused.length}`}</button>` : ''}</div>
      ${won ? '<div class="notice success">本局已猜对。</div>' : ''}
      ${!available ? '<div class="empty">正在读取游戏页面…</div>' : ''}
      ${!won && a?.conflicts?.length ? `<div class="notice error">标题已揭晓字与猜测记录冲突：${esc(a.conflicts.join('、'))}</div>` : ''}
      ${!won && available && a?.hard?.length === 0 ? '<div class="notice error">词库没有匹配项。请核对字格，题目也可能使用词库外名称。</div>' : ''}
      ${candidateHint ? `<div class="hint">${candidateHint}</div>` : ''}
      <div class="provinceList">${groups.map(provinceRow).join('')}</div>
      ${!won && available && !groups.length ? '<div class="empty">当前没有可显示的候选省份；可切换完整候选复查。</div>' : ''}
    </section>`;
    const advancedPanel = `<footer class="advanced">
      ${guessed.length ? `<details data-detail="history" ${state.details.history ? 'open' : ''}>
        <summary>已猜字（${guessed.length}）</summary>
        <div class="advancedBody"><div class="guessHistory" aria-label="已猜字分类">${historyRows}</div></div>
      </details>` : ''}
      <details data-detail="filters" ${state.details.filters ? 'open' : ''}>
        <summary>筛选与推断</summary>
        <div class="advancedBody">
          <div class="filterRow"><span class="filterLabel">推断</span>
            <button class="seg ${state.autoProvinceExclusion ? 'active' : ''}" data-action="toggleAutoProvince"
              title="省名区未出现已猜字时，排除省名含该字的省份">首句省名筛选 ${a?.autoExcluded?.length || 0}</button>
            <button class="seg ${state.focus ? 'active' : ''}" data-action="toggleFocus">${state.focus ? '归属推断已启用' : '归属推断'}</button>
          </div>
          <div class="filterRow"><span class="filterLabel">手动</span>
            <button class="seg ${state.manualMode ? 'active' : ''}" data-action="toggleManualMode">${state.manualMode ? '结束手动筛选' : '手动筛选省份'}</button>
            ${state.manualProvince ? `<button class="chip negative" data-action="clearManual">${esc(a?.provinces?.find(p => p.code === state.manualProvince)?.name || '手选省份')} ×</button>` : ''}
            ${state.excludedProvinces.map(code => `<button class="chip negative" data-action="restoreProvince"
              data-code="${esc(code)}">排除 ${esc(a?.provinces?.find(p => p.code === code)?.name || code)} ×</button>`).join('')}
          </div>
          ${state.manualMode ? '<div class="filterHint">开启后，候选省份行右侧会出现“聚焦/排除”按钮。</div>' : ''}
          <div class="filterHint">${esc(endingHint)}；${esc(state.manualProvince ? '当前省份由你手动选择' : a?.inference?.reason || '等待第一分句归属线索')}。完整候选可复查。</div>
          ${!won && a?.focused?.conflict ? `<div class="notice error">${esc(a.focused.conflicts.join('、'))}与已有筛选冲突，已跳过冲突条件。</div>` : ''}
          ${provinceRecs.length ? `<div><span class="eyebrow">辨省字 · 实验线索</span>
            <div class="suggestions">${provinceRecs.map(r => `<button class="chip" data-action="guessChar"
              data-char="${esc(r.char)}" ${ready ? '' : 'disabled'}>${esc(r.char)}<small>省 ${r.expected.toFixed(1)}</small></button>`).join('')}</div></div>` : ''}
        </div>
      </details>
      <details data-detail="about" ${state.details.about ? 'open' : ''}>
        <summary>说明</summary>
        <div class="advancedBody"><div class="aboutText">词库包含 333 个地级单位（2023 版行政区划快照）。点击推荐字、常用字组或城市名都会直接提交；名称超过 ${maxLength} 字时会自动拆成多次提交。助手不读取答案接口。</div></div>
      </details>
    </footer>`;
    const countLabel = available ? ` · 候选 ${visible.length}` : '';
    mount.innerHTML = `<aside class="shell" aria-label="城市百科助手"
      ${state.mobileHeight ? `style="--mobile-height:${Math.round(state.mobileHeight)}px"` : ''}>
      <header class="top" title="长按并上下拖动调整面板高度">
        <div class="brand"><strong>城市百科助手</strong><small>${esc(s?.pattern || '读取中')} · 已猜 ${Number.isFinite(s?.count) ? s.count : '?'} 字${won ? ' · 已猜对' : ''}${countLabel}</small></div>
        <span class="dragHint">长按拖动</span>
      </header>
      <div class="content"><div class="panel">${primaryPanel}${candidatePanel}${advancedPanel}</div></div>
    </aside>`;
    const content = mount.querySelector('.content');
    if (content) content.scrollTop = state.scrollTop;
  }
  root.addEventListener('toggle', event => {
    const details = event.target.closest?.('details[data-detail]');
    if (!details) return;
    state.details[details.dataset.detail] = details.open;
  }, true);
  async function submitGuess(value, mode) {
    if (state.pending || state.snapshot?.status !== 'ready') return;
    const limit = state.snapshot?.maxLength || 10;
    const error = validateGuess(value, state.snapshot?.guessed || [], mode, limit);
    if (error) {
      state.message = error;
      state.messageType = 'error';
      render();
      return;
    }
    const chunks = mode === 'city' ? chunkGuess(value, limit) : [value];
    state.pending = true;
    state.message = chunks.length > 1 ? `正在提交第 1/${chunks.length} 段…` : '正在等待游戏确认…';
    state.messageType = '';
    render();
    try {
      for (let i = 0; i < chunks.length; i++) {
        const result = await onSubmit(chunks[i], mode, {allowPartial: i > 0});
        if (result.status === 'won') {
          state.message = '';
          state.messageType = '';
          if (result.after) state.snapshot = result.after;
          break;
        }
        if (result.status !== 'confirmed') {
          state.message = result.reason || '状态未确认，请核对原页面。助手不会自动重试。';
          state.messageType = 'error';
          break;
        }
        if (result.after) state.snapshot = result.after;
        if (i < chunks.length - 1) {
          state.message = `第 ${i + 1}/${chunks.length} 段已确认，继续提交…`;
          state.messageType = '';
          render();
        } else {
          state.message = chunks.length > 1 ? `已分 ${chunks.length} 次提交「${value}」。` : '';
          state.messageType = chunks.length > 1 ? 'success' : '';
        }
      }
    } catch (error) {
      state.message = `提交未确认：${error.message}`;
      state.messageType = 'error';
    }
    state.pending = false;
    render();
  }
  let resizeGesture = null, holdTimer = null;
  function finishResize(event) {
    const gesture = resizeGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (holdTimer) { doc.defaultView.clearTimeout(holdTimer); holdTimer = null; }
    gesture.bar.classList.remove('resizing');
    if (gesture.bar.hasPointerCapture?.(event.pointerId)) gesture.bar.releasePointerCapture(event.pointerId);
    if (gesture.active) persist();
    resizeGesture = null;
  }
  root.addEventListener('pointerdown', event => {
    const bar = event.target.closest?.('.top');
    if (!bar || doc.defaultView.innerWidth >= 1000 || event.button !== 0) return;
    const shell = bar.closest('.shell');
    resizeGesture = {pointerId: event.pointerId, startY: event.clientY, startHeight: shell.getBoundingClientRect().height, shell, bar, active: false};
    bar.setPointerCapture(event.pointerId);
    holdTimer = doc.defaultView.setTimeout(() => {
      if (resizeGesture?.pointerId === event.pointerId) { resizeGesture.active = true; bar.classList.add('resizing'); }
      holdTimer = null;
    }, 450);
  });
  root.addEventListener('pointermove', event => {
    const gesture = resizeGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.active) { if (Math.abs(event.clientY - gesture.startY) > 10) finishResize(event); return; }
    const maxHeight = Math.max(220, doc.defaultView.innerHeight - 80);
    const minHeight = Math.min(260, maxHeight);
    const next = Math.round(Math.max(minHeight, Math.min(maxHeight, gesture.startHeight + gesture.startY - event.clientY)));
    state.mobileHeight = next;
    gesture.shell.style.setProperty('--mobile-height', `${next}px`);
    event.preventDefault();
  });
  root.addEventListener('pointerup', finishResize);
  root.addEventListener('pointercancel', finishResize);
  launcher.addEventListener('click', () => { state.open = !state.open; persist(); render(); });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'toggleView') { state.view = state.view === 'focus' ? 'full' : 'focus'; render(); return; }
    if (action === 'toggleFocus') {
      state.focus = !state.focus;
      state.manualProvince = '';
      state.view = 'focus';
      persist();
      state.analysis?.refresh?.();
      render();
      return;
    }
    if (action === 'toggleAutoProvince') {
      state.autoProvinceExclusion = !state.autoProvinceExclusion;
      state.view = 'focus';
      persist();
      state.analysis?.refresh?.();
      render();
      return;
    }
    if (action === 'toggleManualMode') { state.manualMode = !state.manualMode; render(); return; }
    if (action === 'manualProvince') {
      state.manualProvince = button.dataset.code;
      state.excludedProvinces = state.excludedProvinces.filter(code => code !== button.dataset.code);
      state.view = 'focus';
      state.analysis?.refresh?.();
      render();
      return;
    }
    if (action === 'clearManual') {
      state.manualProvince = '';
      state.view = 'focus';
      state.analysis?.refresh?.();
      render();
      return;
    }
    if (action === 'excludeProvince') {
      state.excludedProvinces = [...new Set([...state.excludedProvinces, button.dataset.code])];
      state.view = 'focus';
      state.analysis?.refresh?.();
      render();
      return;
    }
    if (action === 'restoreProvince') {
      state.excludedProvinces = state.excludedProvinces.filter(code => code !== button.dataset.code);
      state.view = 'focus';
      state.analysis?.refresh?.();
      render();
      return;
    }
    if (action === 'toggleMoreRec') { state.showAllRecs = !state.showAllRecs; render(); return; }
    if (action === 'guessChar') { await submitGuess(button.dataset.char, 'chars'); return; }
    if (action === 'guessGroup') {
      const value = addGroup('', state.snapshot?.guessed || [], button.dataset.group);
      if (!value) { state.message = '这组字已经全部猜过。'; state.messageType = ''; render(); return; }
      await submitGuess(value, 'chars');
      return;
    }
    if (action === 'guessCity') { await submitGuess(button.dataset.name, 'city'); return; }
  });
  render();
  return {host, state, render, setChallenge, syncDock, destroy() { dock.destroy(); host.remove(); }};
}

module.exports = {createUI};
