// ==UserScript==
// @name         城市百科助手
// @namespace    https://xiaoce.fun/
// @version      2.0.0
// @description  猜盐城市百科助手：推荐下一字、点击直接提交、查看候选城市。
// @license      PolyForm-Noncommercial-1.0.0
// @match        https://xiaoce.fun/c/*
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==
(function() {
  'use strict';
  const modules = {
"src/data.js": function(module, exports, require) {
const rawCities = require('../data/cities-source.json');
const rawProvinces = require('../data/provinces-source.json');

const placeholders = new Set(['市辖区', '省直辖县级行政区划', '县', '自治区直辖县级行政区划']);
const provinces = rawProvinces.map(p => ({ code: p.code, name: p.name }));
provinces.push(
  { code: '71', name: '台湾省', recognitionOnly: true },
  { code: '81', name: '香港特别行政区', recognitionOnly: true },
  { code: '82', name: '澳门特别行政区', recognitionOnly: true }
);
const cities = rawCities.filter(c => !placeholders.has(c.name)).map(c => ({
  code: c.code,
  name: c.name,
  provinceCode: c.provinceCode,
  type: c.name.endsWith('自治州') ? '自治州' : c.name.endsWith('地区') ? '地区' : c.name.endsWith('盟') ? '盟' : '地级市',
  titleVariants: [c.name]
}));

if (rawCities.length !== 342 || cities.length !== 333 || rawProvinces.length !== 31 || provinces.length !== 34) throw new Error('词库快照数量异常');
if (new Set(cities.map(c => c.code)).size !== cities.length) throw new Error('城市代码重复');
if (cities.some(c => !provinces.some(p => p.code === c.provinceCode))) throw new Error('城市省份缺失');

module.exports = { cities, provinces, metadata: {
  source: 'modood/Administrative-divisions-of-China',
  sourcePaths: ['dist/cities.json', 'dist/provinces.json'],
  cityBlobSha: 'db79349bfb35da6eb071ca42c94218794bd60438',
  provinceBlobSha: '8b1417706e4911ac145ec2672f1ff747b065be85',
  retrieved: '2026-11-11',
  lastSourceUpdate: '2023',
  rawCount: rawCities.length,
  placeholderCount: rawCities.length - cities.length
} };

},
"src/core.js": function(module, exports, require) {
function matchPattern(pattern, name) {
  const a = [...pattern], b = [...name];
  return a.length === b.length && a.every((ch, i) => ch === '?' || ch === '□' || ch === b[i]);
}

function hardCandidates(cities, pattern, titleAbsent) {
  const absent = new Set(titleAbsent || []);
  return cities.filter(city => (city.titleVariants || [city.name]).some(name =>
    matchPattern(pattern, name) && ![...name].some(ch => absent.has(ch))));
}

function analyzeTitle(cities, pattern, titleAbsent) {
  const known = new Set([...pattern].filter(ch => ch !== '?' && ch !== '□'));
  const conflicts = [...new Set(titleAbsent || [])].filter(ch => known.has(ch));
  return { candidates: hardCandidates(cities, pattern, (titleAbsent || []).filter(ch => !known.has(ch))), conflicts };
}

function partitionByCharacter(candidates, character) {
  const groups = new Map();
  for (const candidate of candidates) {
    const indices = [...candidate.name].flatMap((ch, i) => ch === character ? [i] : []);
    const signature = indices.join(',') || '-';
    groups.set(signature, [...(groups.get(signature) || []), candidate]);
  }
  return groups;
}

function expectedRemaining(groups) {
  const sizes = [...groups.values()].map(group => group.length);
  const n = sizes.reduce((sum, size) => sum + size, 0);
  return n ? sizes.reduce((sum, size) => sum + size * size, 0) / n : 0;
}

function recommendCharacters(candidates, guessed, limit = 12) {
  if (candidates.length < 2) return [];
  const seen = new Set(guessed || []);
  const chars = new Set(candidates.flatMap(c => [...c.name]));
  return [...chars].filter(ch => !seen.has(ch)).map(ch => {
    const groups = partitionByCharacter(candidates, ch);
    return { char: ch, expected: expectedRemaining(groups), worst: Math.max(...[...groups.values()].map(g => g.length)), groups: groups.size };
  }).filter(item => item.groups > 1).sort((a,b) => a.expected - b.expected || a.worst - b.worst || a.char.localeCompare(b.char, 'zh-CN')).slice(0, limit);
}

function compatible(visible, actual) {
  const a = [...visible], b = [...actual];
  return a.length === b.length && a.every((ch, i) => ch === '?' || ch === '□' || ch === b[i]);
}

function overlapping(visible, pattern) {
  const a = [...visible], b = [...pattern];
  return a.length === b.length && a.every((ch, i) => ch === '?' || ch === '□' || b[i] === '?' || b[i] === '□' || ch === b[i]);
}

function analyzeProvinceTail(body, titlePattern, guessed = []) {
  const boundary = (body || '').search(/[，,。；;！？!]/);
  const first = boundary < 0 ? '' : body.slice(0, boundary);
  const titleLength = [...(titlePattern || '')].length;
  if (!titleLength || first.length <= titleLength ||
      !overlapping(first.slice(0, titleLength), titlePattern)) {
    return { available: false, tail: '', absent: [] };
  }
  const tail = first.slice(titleLength);
  return { available: true, tail, absent: [...new Set(guessed)].filter(ch => !tail.includes(ch)) };
}

function inferFirstClauseEnding(body, titlePattern) {
  const first = analyzeProvinceTail(body, titlePattern);
  if (!first.available || first.tail.length < 3) return { kind: null, slot: '' };
  const slot = first.tail.slice(-3);
  const ordinary = compatible(slot, '地级市');
  const capital = compatible(slot, '的省会');
  return { kind: ordinary === capital ? null : ordinary ? 'ordinary' : 'capital', slot };
}

function inferProvince(body, subject, provinces, globalMisses = []) {
  const first = (body || '').split(/[，,。；;]/)[0];
  if (!subject || !overlapping(first.slice(0, subject.length), subject)) return { provinces: [], reason: '句首主语未确认', experimental: true };
  const afterSubject = first.slice(subject.length);
  const linker = ['位于', '隶属', '下辖', '是'].find(word => afterSubject.startsWith(word));
  if (!linker) return { provinces: [], reason: '归属连接词未确认', experimental: true };
  const slot = afterSubject.slice(linker.length);
  const misses = new Set(globalMisses);
  const result = provinces.filter(province => {
    const name = province.name;
    if ([...name].some(ch => misses.has(ch))) return false;
    const visibleName=slot.slice(0, name.length);
    if (!compatible(visibleName, name)) return false;
    const suffix=name.endsWith('特别行政区')?'特别行政区':name.endsWith('自治区')?'自治区':name.slice(-1);
    const distinctive=visibleName.slice(0,-suffix.length);
    if ([...visibleName].filter(ch=>/\p{Script=Han}/u.test(ch)).length<2) return false;
    if (![...distinctive].some(ch=>/\p{Script=Han}/u.test(ch))) return false;
    const rest = slot.slice(name.length);
    if (linker === '位于') return !rest || !/^[?□]/.test(rest);
    return /^(?:下辖(?:的)?地级市|地级市|下辖(?:的)?自治州|自治州|地区|盟|省会|首府)(?:$|[^?□])/.test(rest);
  });
  return { provinces: result, reason: result.length ? `第一分句“${linker}”后的省名槽位` : '省名槽位未确认', experimental: true };
}

function inferProvinceByPosition(body, subject, provinces, globalMisses = []) {
  const first=(body||'').split(/[，,。；;]/)[0];
  const empty={provinces:[],reason:'首句位置尚不足以判断省名',experimental:true};
  if(!subject||!overlapping(first.slice(0,subject.length),subject))return empty;
  const tail=first.slice(subject.length);
  const linker=['位于','隶属','是','属','?','□'].find(word=>tail.startsWith(word));
  if(!linker)return empty;
  const slot=tail.slice(linker.length),misses=new Set(globalMisses);
  const result=provinces.filter(province=>{
    const name=province.name;
    if([...name].some(ch=>misses.has(ch)))return false;
    const visible=slot.slice(0,name.length);
    if(!compatible(visible,name))return false;
    const suffix=name.endsWith('特别行政区')?'特别行政区':name.endsWith('自治区')?'自治区':name.slice(-1);
    return [...visible.slice(0,-suffix.length)].some(ch=>/\p{Script=Han}/u.test(ch));
  });
  return {provinces:result,reason:result.length?`首句按标题${subject.length}字后${linker==='?'||linker==='□'?'未揭晓连接字':'“'+linker+'”'}推测省名`:'首句省名槽位尚无辨别字',experimental:true};
}

function focusCandidates(candidates, provinceCodes, enabled) {
  if (!enabled || !provinceCodes?.length) return { candidates, conflict: false, active: false };
  const codes = new Set(provinceCodes);
  const focused = candidates.filter(c => codes.has(c.provinceCode));
  return focused.length ? { candidates: focused, conflict: false, active: true } : { candidates, conflict: true, active: false };
}

function suggestProvinceExclusions(provinces, globalMisses) {
  const misses=new Set(globalMisses||[]);
  if(!misses.size)return [];
  return provinces.filter(p=>!p.recognitionOnly).map(p=>({
    code:p.code,name:p.name,reason:[...p.name].filter(ch=>misses.has(ch)).join('、')
  })).filter(p=>p.reason);
}

function applyManualFilters(candidates, options={}) {
  const capitalCodes=new Set(options.capitalCodes||[]);
  let current=options.excludeCapital?candidates.filter(c=>!capitalCodes.has(c.code)):
    options.capitalOnly?candidates.filter(c=>capitalCodes.has(c.code)):candidates;
  if(!current.length)return {candidates:[],conflict:false,conflicts:[],active:current.length<candidates.length};
  const conditions=[];
  if(options.excludedProvinceCodes?.length){
    const excluded=new Set(options.excludedProvinceCodes);
    conditions.push({name:'排除省份',accept:c=>!excluded.has(c.provinceCode)});
  }
  if(options.provinceEnabled&&options.provinceCodes?.length){
    const codes=new Set(options.provinceCodes);
    conditions.push({name:'省份',accept:c=>codes.has(c.provinceCode)});
  }
  if(options.type)conditions.push({name:'行政类型',accept:c=>c.type===options.type});
  const conflicts=[];
  for(const condition of conditions){
    const next=current.filter(condition.accept);
    if(next.length)current=next;
    else conflicts.push(condition.name);
  }
  return {candidates:current,conflict:conflicts.length>0,conflicts,active:current.length<candidates.length};
}

function groupByProvince(candidates, provinces) {
  return provinces.map(p => ({ ...p, cities: candidates.filter(c => c.provinceCode === p.code) }))
    .filter(p => p.cities.length).sort((a,b) => a.cities.length - b.cities.length || a.code.localeCompare(b.code));
}

module.exports = { hardCandidates, analyzeTitle, matchPattern, partitionByCharacter, expectedRemaining,
  recommendCharacters, analyzeProvinceTail, inferFirstClauseEnding, inferProvince, inferProvinceByPosition, focusCandidates, suggestProvinceExclusions, applyManualFilters, groupByProvince };

},
"src/roles.js": function(module, exports, require) {
const {cities}=require('./data');

// 省会／自治区首府名单据清华大学公共管理学院《2023年中国城市政府财政透明度报告》附表核对。
// https://www.sppm.tsinghua.edu.cn/__local/5/E4/AA/C7740295314A7E69496ACBE6039_BCBAC39D_60C814.pdf
const capitalNames=[
  '石家庄市','太原市','沈阳市','长春市','哈尔滨市','南京市','杭州市','合肥市','福州市',
  '南昌市','济南市','郑州市','广州市','长沙市','武汉市','海口市','成都市','贵阳市',
  '昆明市','西安市','兰州市','西宁市','呼和浩特市','南宁市','拉萨市','银川市','乌鲁木齐市'
];
const capitalCodes=capitalNames.map(name=>{
  const matches=cities.filter(c=>c.name===name);
  if(matches.length!==1)throw new Error(`省会词库匹配异常：${name}`);
  return matches[0].code;
});
module.exports={capitalCodes};

},
"src/adapter.js": function(module, exports, require) {
function classifyGuesses(guessed, pattern, body, misses, complete = true) {
  const missSet = new Set(misses || []);
  return (guessed || []).map(char => ({ char, status: !complete ? 'unknown' :
    pattern.includes(char) ? 'title' : body.includes(char) ? 'body' : missSet.has(char) ? 'miss' : 'unknown' }));
}

function deriveGuesses(pattern, body, wrongChars, count) {
  const revealed = [...`${pattern}${body}`].filter(ch => /^\p{Script=Han}$/u.test(ch));
  const misses = [...new Set(wrongChars)];
  const guessed = [...new Set([...revealed, ...misses])];
  return { guessed, misses, historyComplete: Number.isFinite(count) && guessed.length === count };
}

function confirmSubmission(before, after, value, mode = 'chars') {
  if (!before || !after || before.id !== after.id) return 'uncertain';
  if (mode === 'city') {
    if (!Number.isFinite(before.count) || !Number.isFinite(after.count)) return 'uncertain';
    return after.count > before.count ? 'confirmed' : 'uncertain';
  }
  if (!before.historyComplete || !after.historyComplete) return 'uncertain';
  const chars = [...value];
  if (after.count - before.count !== chars.length) return 'uncertain';
  const previous = new Set(before.guessed);
  const added = new Set(after.guessed.filter(ch => !previous.has(ch)));
  return added.size === chars.length && chars.every(ch => added.has(ch)) ? 'confirmed' : 'uncertain';
}

function snapshotStatus(snapshot) {
  if (snapshot.restorePending) return 'restore';
  if (!snapshot.pattern || !/^[-?□\p{Script=Han}]+$/u.test(snapshot.pattern)) return 'unavailable';
  if (!snapshot.historyComplete) return 'partial';
  return 'ready';
}

function tileText(tile) {
  const value = (tile.textContent || '').trim();
  return /^[\p{Script=Han}]$/u.test(value) ? value : '?';
}

function bodyCellText(tile) {
  const value = (tile.textContent || '').trim();
  return /^[\p{Script=Han}，,。；;：:！？!?、“”]$/u.test(value) ? value : '?';
}

function getTileGroups(doc) {
  const tiles = [...doc.querySelectorAll('div[style*="FangSong"]')];
  const map = new Map();
  for (const tile of tiles) {
    const parent = tile.parentElement;
    if (!parent) continue;
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(tile);
  }
  return [...map].map(([parent, items]) => ({ parent, tiles: items }));
}

function textWithPunctuation(group) {
  // The game renders characters as FangSong cells. Keep visible punctuation in cells or direct text nodes.
  const cells = new Set(group.tiles);
  let result = '';
  for (const node of group.parent.childNodes) {
    if (cells.has(node)) result += bodyCellText(node);
    else if (node.nodeType === 3) result += (node.textContent || '').replace(/[^，,。；;：:！？!?]/g, '');
    else if (node.nodeType === 1 && !node.querySelector?.('div[style*="FangSong"]')) {
      result += (node.textContent || '').replace(/[^，,。；;：:！？!?]/g, '');
    }
  }
  return result || group.tiles.map(bodyCellText).join('');
}

function findRestorePending(doc) {
  const buttons = [...doc.querySelectorAll('button')].filter(button => {
    if (button.closest?.('[hidden],[aria-hidden="true"],[inert],.ant-modal-hidden')) return false;
    if (button.getClientRects && !button.getClientRects().length) return false;
    for (let node = button; node && node !== doc.body; node = node.parentElement) {
      const style = doc.defaultView?.getComputedStyle?.(node);
      if (style && (style.visibility === 'hidden' || Number(style.opacity) === 0 ||
        (node !== button && style.pointerEvents === 'none'))) return false;
    }
    return true;
  });
  return buttons.some(b => b.textContent.trim() === '恢复进度') && buttons.some(b => b.textContent.trim() === '重新开始');
}

function inspectPage(doc, url) {
  const id = new URL(url).pathname;
  const input = [...doc.querySelectorAll('input')].find(el => /输入\s*1\s*[～~至-]\s*10\s*个字/.test(el.placeholder || ''));
  const button = input && [...doc.querySelectorAll('button')].find(el => el.textContent.trim() === '猜');
  const won = !input && [...doc.querySelectorAll('span.ant-typography-success')]
    .some(el => /恭喜你猜对了/.test(el.textContent || ''));
  const restorePending = findRestorePending(doc);
  const pageTitle = doc.title || '';
  const groups = getTileGroups(doc);
  const titleIndex = groups.findIndex((g, i) => g.tiles.length >= 2 && g.tiles.length <= 16 && groups.slice(i + 1).some(b => b.tiles.length >= 20));
  const bodyIndex = titleIndex < 0 ? -1 : groups.findIndex((g, i) => i > titleIndex && g.tiles.length >= 20);
  const titleGroup = groups[titleIndex], bodyGroup = groups[bodyIndex];
  const pattern = titleGroup ? titleGroup.tiles.map(tileText).join('') : '';
  const body = bodyGroup ? textWithPunctuation(bodyGroup) : '';
  const countMatch = (doc.body?.innerText || '').match(/猜测次数\s*[:：]?\s*(\d+)/);
  const count = countMatch ? Number(countMatch[1]) : NaN;
  const historyGroups = bodyIndex < 0 ? [] : groups.slice(bodyIndex + 1);
  const wrongChars = historyGroups.flatMap(g => g.tiles.filter(tile => (tile.getAttribute('style') || '').includes('reveal-wrong'))
    .map(tile => (tile.textContent || '').trim()).filter(ch => /^[\p{Script=Han}]$/u.test(ch)));
  const {guessed, misses, historyComplete} = deriveGuesses(pattern, body, wrongChars, count);
  const maxLength = input && Number.isFinite(input.maxLength) && input.maxLength > 0 ? input.maxLength : 10;
  const snapshot = { id, pattern, body, count, guessed, historyComplete, restorePending, maxLength,
    titleAbsent: historyComplete ? guessed.filter(ch => !pattern.includes(ch)) : [],
    globalMisses: historyComplete ? misses : [],
    pageTitle, confidence: !!titleGroup && !!bodyGroup && !!input && !!button && Number.isFinite(count) };
  snapshot.status = won ? 'won' : restorePending ? 'restore' : !snapshot.confidence ? 'unavailable' : snapshotStatus(snapshot);
  return { snapshot, input, button };
}

function writeNativeInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

async function submitGuess(doc, url, value, options = {}) {
  const mode = options.mode || 'chars';
  const timeoutMs = options.timeoutMs || 10000;
  const before = inspectPage(doc, url);
  const usable = before.snapshot.status === 'ready' ||
    (options.allowPartial && before.snapshot.status === 'partial' && before.input && before.button);
  if (!usable || !before.input || !before.button) return { status: 'unavailable' };
  writeNativeInput(before.input, value);
  if (before.button.disabled) {
    writeNativeInput(before.input, '');
    return { status: 'unavailable', reason: '页面未接受输入' };
  }
  before.button.click();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 220));
    const after = inspectPage(doc, url).snapshot;
    if (after.status === 'won' && after.id === before.snapshot.id) return { status: 'won', before: before.snapshot, after };
    if (after.count > before.snapshot.count || after.id !== before.snapshot.id) {
      const status = confirmSubmission(before.snapshot, after, value, mode);
      return { status, before: before.snapshot, after };
    }
  }
  return { status: 'uncertain', reason: '页面未在限定时间内确认提交' };
}

module.exports = { classifyGuesses, deriveGuesses, confirmSubmission, snapshotStatus, inspectPage, submitGuess, bodyCellText };

},
"src/layout.js": function(module, exports, require) {
const pageCss=`
@media (min-width: 1000px) {
  html[data-ceh-docked="true"] { --ceh-dock-width: clamp(400px, 32vw, 560px); }
  html[data-ceh-docked="true"] body > [data-ceh-game-root="true"] {
    width: calc(100% - var(--ceh-dock-width)) !important;
    max-width: calc(100% - var(--ceh-dock-width)) !important;
    margin-left: 0 !important;
    margin-right: var(--ceh-dock-width) !important;
  }
  html[data-ceh-docked="true"] [data-ceh-game-input="true"] {
    left: calc((100vw - var(--ceh-dock-width)) / 2) !important;
    width: min(600px, calc(100vw - var(--ceh-dock-width) - 20px)) !important;
    max-width: calc(100vw - var(--ceh-dock-width) - 20px) !important;
  }
}`;

function createPageDock(doc) {
  const style=doc.createElement('style');style.id='ceh-page-layout';style.textContent=pageCss;doc.head.appendChild(style);
  let gameRoot=null,inputWrap=null;
  function clearTargets(){gameRoot?.removeAttribute('data-ceh-game-root');inputWrap?.removeAttribute('data-ceh-game-input');gameRoot=null;inputWrap=null;}
  function findTargets(){
    const input=[...doc.querySelectorAll('input')].find(el=>/输入\s*1\s*[～~至-]\s*10\s*个字/.test(el.placeholder||''));
    const won=!input&&[...doc.querySelectorAll('span.ant-typography-success')]
      .some(el=>/恭喜你猜对了/.test(el.textContent||''));
    const anchor=input||(won?doc.querySelector('h3[data-xiaoce-page-title]'):null);
    if(!anchor)return null;
    let root=anchor;
    while(root.parentElement&&root.parentElement!==doc.body)root=root.parentElement;
    if(root.parentElement!==doc.body)return null;
    if(!input)return {root,fixed:null};
    let fixed=input.parentElement;
    while(fixed&&fixed!==root&&doc.defaultView.getComputedStyle(fixed).position!=='fixed')fixed=fixed.parentElement;
    return {root, fixed:fixed===root?null:fixed};
  }
  function apply(open){
    if(!open){delete doc.documentElement.dataset.cehDocked;clearTargets();return;}
    const targets=findTargets();
    if(!targets){delete doc.documentElement.dataset.cehDocked;clearTargets();return;}
    if(targets.root!==gameRoot||targets.fixed!==inputWrap){clearTargets();gameRoot=targets.root;inputWrap=targets.fixed;gameRoot.setAttribute('data-ceh-game-root','true');inputWrap?.setAttribute('data-ceh-game-input','true');}
    doc.documentElement.dataset.cehDocked='true';
  }
  return {apply,destroy(){delete doc.documentElement.dataset.cehDocked;clearTargets();style.remove();}};
}

module.exports={createPageDock};

},
"src/ui-model.js": function(module, exports, require) {
function validateGuess(value, guessed, mode = 'chars', maxLength = 10) {
  const chars = [...value];
  if (!chars.length) return '请至少输入 1 个字';
  if (chars.some(ch => !/^\p{Script=Han}$/u.test(ch))) return '只能包含汉字';
  if (mode === 'city') {
    if (chars.length > 20) return '名称过长';
    return '';
  }
  if (chars.length > maxLength) return `每次最多猜 ${maxLength} 个字`;
  if (new Set(chars).size !== chars.length) return '不能有重复字';
  if (chars.some(ch => (guessed || []).includes(ch))) return '含有已猜过的字';
  return '';
}

function chunkGuess(value, maxLength = 10) {
  const chars = [...value];
  if (!chars.length) return [];
  const size = Math.max(1, Math.floor(maxLength) || 10);
  const chunks = [];
  for (let i = 0; i < chars.length; i += size) chunks.push(chars.slice(i, i + size).join(''));
  return chunks;
}

function addGroup(draft, guessed, group) {
  const seen = new Set([...(guessed || []), ...draft]);
  let result = draft;
  for (const ch of group) if (!seen.has(ch) && [...result].length < 10) { result += ch; seen.add(ch); }
  return result;
}

module.exports = { validateGuess, chunkGuess, addGroup };

},
"src/ui.js": function(module, exports, require) {
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
*, *:before, *:after {
  box-sizing: border-box;
}
button, input {
  font: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
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
.launcher[aria-pressed="true"] {
  background: var(--accent);
  color: #fff;
}
.launcher:hover {
  box-shadow: 0 2px 8px #e48d2144;
}
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
.top.resizing {
  background: var(--accent-pale);
}
.spacer {
  flex: 1;
}
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
.linkBtn:hover {
  color: #0e5574;
}
.notice {
  font-size: 12px;
  line-height: 1.5;
  color: #805409;
  background: #fff8e8;
  border: 1px solid #ecd7a8;
  border-radius: 8px;
  padding: 8px 10px;
}
.notice.error {
  color: #8b302a;
  background: #fff1ef;
  border-color: #e9bdb7;
}
.notice.success {
  color: #145e46;
  background: #e9f7ef;
  border-color: #b2ddc5;
}
.recGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.recGrid.smallGrid {
  gap: 5px;
}
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
.rec:hover:not(:disabled) {
  background: #f2f8fa;
}
.rec.lead {
  border-color: var(--accent);
  background: var(--accent-pale);
}
.rec.lead .char {
  color: var(--accent-dark);
}
.rec.lead:hover:not(:disabled) {
  background: #ffedcf;
}
.rec .char {
  font-size: 28px;
  font-weight: 750;
  line-height: 1.1;
}
.rec .meta {
  font-size: 11px;
  color: var(--muted);
}
.rec.small {
  min-height: 50px;
  border-width: 1px;
  border-color: var(--line);
}
.rec.small .char {
  font-size: 19px;
}
.rec.small .meta {
  font-size: 10px;
}
.moreRec {
  align-self: flex-start;
}
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
.groupLabel strong {
  font-size: 12px;
  color: var(--ink);
}
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
.group:hover:not(:disabled) {
  background: #eef7fa;
}
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
.provinceList {
  display: flex;
  flex-direction: column;
}
.provinceRow {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 7px 0;
  border-top: 1px solid var(--line);
}
.provinceRow:first-child {
  border-top: 0;
  padding-top: 0;
}
.provinceRow.excluded {
  opacity: .55;
}
.provinceRow.manual {
  grid-template-columns: 84px minmax(0, 1fr) auto;
}
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
.mini:hover:not(:disabled) {
  background: #eef7fa;
}
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
summary::-webkit-details-marker {
  display: none;
}
summary:before {
  content: '▸';
  font-size: 10px;
  color: var(--muted);
  transition: transform .15s;
}
details[open] summary:before {
  transform: rotate(90deg);
}
summary:hover {
  color: var(--ink);
}
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
.seg.active {
  background: #145f80;
  color: #fff;
  border-color: #145f80;
}
.seg:hover:not(:disabled) {
  background: #e1f1f7;
}
.seg.active:hover:not(:disabled) {
  background: #0d5574;
}
.chip {
  border: 1px solid #b4d1dd;
  background: #fff;
  color: #285b74;
  border-radius: 6px;
  padding: 5px 7px;
  font-size: 12px;
}
.chip:hover:not(:disabled) {
  background: #e1f1f7;
}
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
.suggestions .chip {
  font-size: 14px;
}
.guessHistory {
  display: grid;
  gap: 5px;
}
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
.historyChars {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag {
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  background: #e5f6ed;
  color: #226249;
}
.tag.bodyhit {
  background: #e5f1fb;
  color: #2b638c;
}
.tag.miss {
  background: #f9e7e6;
  color: #a2433e;
}
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
  .dragHint {
    display: block;
  }
  .panel {
    padding: 10px;
  }
  .primaryCard, .candidates {
    padding: 12px;
  }
  .provinceRow {
    grid-template-columns: 68px minmax(0, 1fr);
  }
  .provinceRow.manual {
    grid-template-columns: 68px minmax(0, 1fr);
  }
  .provinceRow.manual .provinceActions {
    grid-column: 2;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    transition: none !important;
  }
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

},
"src/main.js": function(module, exports, require) {
const { cities, provinces } = require('./data');
const { analyzeTitle, analyzeProvinceTail, inferFirstClauseEnding, inferProvince, inferProvinceByPosition, suggestProvinceExclusions, applyManualFilters } = require('./core');
const {capitalCodes}=require('./roles');
const { inspectPage, submitGuess } = require('./adapter');
const { createUI } = require('./ui');

function localDate() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}

function start(doc = document, win = window) {
  let ui=null, timer=null, lastSignature=null;
  function tick() {
    timer=null;
    const active=/^\/c\/[^/]+/.test(win.location.pathname) && /城市百科/.test(doc.title);
    if(!active){if(ui){ui.destroy();ui=null;lastSignature=null;}return;}
    if(!doc.body)return;
    if(!ui) ui=createUI(doc,(value,mode,options)=>submitGuess(doc,win.location.href,value,{mode,...options}));
    if(ui.setChallenge(`${win.location.pathname}:${localDate()}`))lastSignature=null;
    ui.syncDock();
    const {snapshot}=inspectPage(doc,win.location.href);
    const signature=JSON.stringify([snapshot.id,snapshot.status,snapshot.pattern,snapshot.body,snapshot.count,
      snapshot.guessed,snapshot.titleAbsent,snapshot.globalMisses,snapshot.restorePending,snapshot.maxLength]);
    if(signature===lastSignature)return;
    lastSignature=signature;
    const title=analyzeTitle(cities,snapshot.pattern,snapshot.status==='ready'?snapshot.titleAbsent:[]);
    const firstClause=snapshot.status==='ready'
      ?analyzeProvinceTail(snapshot.body,snapshot.pattern,snapshot.guessed):{available:false,tail:'',absent:[]};
    const ending=snapshot.status==='ready'?inferFirstClauseEnding(snapshot.body,snapshot.pattern):{kind:null,slot:''};
    const provinceAbsent=firstClause.available?firstClause.absent:snapshot.globalMisses;
    const inference=snapshot.status==='ready'
      ?inferProvince(snapshot.body,snapshot.pattern,provinces,provinceAbsent):{provinces:[],reason:'等待可靠页面状态'};
    const positional=inference.provinces.length||snapshot.status!=='ready'?inference:
      inferProvinceByPosition(snapshot.body,snapshot.pattern,provinces,provinceAbsent);
    const autoExcluded=snapshot.status==='ready'?suggestProvinceExclusions(provinces,provinceAbsent):[];
    const analysis={hard:title.candidates,conflicts:title.conflicts,inference:positional,firstClause,ending,provinces,autoExcluded,focused:null};
    analysis.refresh=()=>{analysis.focused=applyManualFilters(title.candidates,{
      provinceCodes:ui.state.manualProvince?[ui.state.manualProvince]:positional.provinces.map(p=>p.code),
      provinceEnabled:!!ui.state.manualProvince||ui.state.focus,
      excludedProvinceCodes:[...new Set([...ui.state.excludedProvinces,...(ui.state.autoProvinceExclusion?autoExcluded.map(p=>p.code).filter(code=>code!==ui.state.manualProvince):[])])],
      excludeCapital:ending.kind==='ordinary',capitalOnly:ending.kind==='capital',capitalCodes
    });};
    analysis.refresh();
    ui.render(snapshot,analysis);
  }
  function schedule() {if(timer)return;timer=win.setTimeout(tick,180);}
  const onResize=()=>{ui?.syncDock();schedule();};
  win.addEventListener('resize',onResize);
  const observer=new win.MutationObserver(schedule);
  const watch=()=>{if(doc.body) observer.observe(doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden','inert','disabled','value']});schedule();};
  if(doc.body)watch();else doc.addEventListener('DOMContentLoaded',watch,{once:true});
  const interval=win.setInterval(schedule,1800);
  return {stop(){observer.disconnect();win.removeEventListener('resize',onResize);win.clearInterval(interval);if(timer)win.clearTimeout(timer);ui?.destroy();}};
}

if(typeof document!=='undefined') start();
module.exports={start};

},
"data/cities-source.json": function(module) {
module.exports = [
  {
    "code": "1101",
    "name": "市辖区",
    "provinceCode": "11"
  },
  {
    "code": "1201",
    "name": "市辖区",
    "provinceCode": "12"
  },
  {
    "code": "1301",
    "name": "石家庄市",
    "provinceCode": "13"
  },
  {
    "code": "1302",
    "name": "唐山市",
    "provinceCode": "13"
  },
  {
    "code": "1303",
    "name": "秦皇岛市",
    "provinceCode": "13"
  },
  {
    "code": "1304",
    "name": "邯郸市",
    "provinceCode": "13"
  },
  {
    "code": "1305",
    "name": "邢台市",
    "provinceCode": "13"
  },
  {
    "code": "1306",
    "name": "保定市",
    "provinceCode": "13"
  },
  {
    "code": "1307",
    "name": "张家口市",
    "provinceCode": "13"
  },
  {
    "code": "1308",
    "name": "承德市",
    "provinceCode": "13"
  },
  {
    "code": "1309",
    "name": "沧州市",
    "provinceCode": "13"
  },
  {
    "code": "1310",
    "name": "廊坊市",
    "provinceCode": "13"
  },
  {
    "code": "1311",
    "name": "衡水市",
    "provinceCode": "13"
  },
  {
    "code": "1401",
    "name": "太原市",
    "provinceCode": "14"
  },
  {
    "code": "1402",
    "name": "大同市",
    "provinceCode": "14"
  },
  {
    "code": "1403",
    "name": "阳泉市",
    "provinceCode": "14"
  },
  {
    "code": "1404",
    "name": "长治市",
    "provinceCode": "14"
  },
  {
    "code": "1405",
    "name": "晋城市",
    "provinceCode": "14"
  },
  {
    "code": "1406",
    "name": "朔州市",
    "provinceCode": "14"
  },
  {
    "code": "1407",
    "name": "晋中市",
    "provinceCode": "14"
  },
  {
    "code": "1408",
    "name": "运城市",
    "provinceCode": "14"
  },
  {
    "code": "1409",
    "name": "忻州市",
    "provinceCode": "14"
  },
  {
    "code": "1410",
    "name": "临汾市",
    "provinceCode": "14"
  },
  {
    "code": "1411",
    "name": "吕梁市",
    "provinceCode": "14"
  },
  {
    "code": "1501",
    "name": "呼和浩特市",
    "provinceCode": "15"
  },
  {
    "code": "1502",
    "name": "包头市",
    "provinceCode": "15"
  },
  {
    "code": "1503",
    "name": "乌海市",
    "provinceCode": "15"
  },
  {
    "code": "1504",
    "name": "赤峰市",
    "provinceCode": "15"
  },
  {
    "code": "1505",
    "name": "通辽市",
    "provinceCode": "15"
  },
  {
    "code": "1506",
    "name": "鄂尔多斯市",
    "provinceCode": "15"
  },
  {
    "code": "1507",
    "name": "呼伦贝尔市",
    "provinceCode": "15"
  },
  {
    "code": "1508",
    "name": "巴彦淖尔市",
    "provinceCode": "15"
  },
  {
    "code": "1509",
    "name": "乌兰察布市",
    "provinceCode": "15"
  },
  {
    "code": "1522",
    "name": "兴安盟",
    "provinceCode": "15"
  },
  {
    "code": "1525",
    "name": "锡林郭勒盟",
    "provinceCode": "15"
  },
  {
    "code": "1529",
    "name": "阿拉善盟",
    "provinceCode": "15"
  },
  {
    "code": "2101",
    "name": "沈阳市",
    "provinceCode": "21"
  },
  {
    "code": "2102",
    "name": "大连市",
    "provinceCode": "21"
  },
  {
    "code": "2103",
    "name": "鞍山市",
    "provinceCode": "21"
  },
  {
    "code": "2104",
    "name": "抚顺市",
    "provinceCode": "21"
  },
  {
    "code": "2105",
    "name": "本溪市",
    "provinceCode": "21"
  },
  {
    "code": "2106",
    "name": "丹东市",
    "provinceCode": "21"
  },
  {
    "code": "2107",
    "name": "锦州市",
    "provinceCode": "21"
  },
  {
    "code": "2108",
    "name": "营口市",
    "provinceCode": "21"
  },
  {
    "code": "2109",
    "name": "阜新市",
    "provinceCode": "21"
  },
  {
    "code": "2110",
    "name": "辽阳市",
    "provinceCode": "21"
  },
  {
    "code": "2111",
    "name": "盘锦市",
    "provinceCode": "21"
  },
  {
    "code": "2112",
    "name": "铁岭市",
    "provinceCode": "21"
  },
  {
    "code": "2113",
    "name": "朝阳市",
    "provinceCode": "21"
  },
  {
    "code": "2114",
    "name": "葫芦岛市",
    "provinceCode": "21"
  },
  {
    "code": "2201",
    "name": "长春市",
    "provinceCode": "22"
  },
  {
    "code": "2202",
    "name": "吉林市",
    "provinceCode": "22"
  },
  {
    "code": "2203",
    "name": "四平市",
    "provinceCode": "22"
  },
  {
    "code": "2204",
    "name": "辽源市",
    "provinceCode": "22"
  },
  {
    "code": "2205",
    "name": "通化市",
    "provinceCode": "22"
  },
  {
    "code": "2206",
    "name": "白山市",
    "provinceCode": "22"
  },
  {
    "code": "2207",
    "name": "松原市",
    "provinceCode": "22"
  },
  {
    "code": "2208",
    "name": "白城市",
    "provinceCode": "22"
  },
  {
    "code": "2224",
    "name": "延边朝鲜族自治州",
    "provinceCode": "22"
  },
  {
    "code": "2301",
    "name": "哈尔滨市",
    "provinceCode": "23"
  },
  {
    "code": "2302",
    "name": "齐齐哈尔市",
    "provinceCode": "23"
  },
  {
    "code": "2303",
    "name": "鸡西市",
    "provinceCode": "23"
  },
  {
    "code": "2304",
    "name": "鹤岗市",
    "provinceCode": "23"
  },
  {
    "code": "2305",
    "name": "双鸭山市",
    "provinceCode": "23"
  },
  {
    "code": "2306",
    "name": "大庆市",
    "provinceCode": "23"
  },
  {
    "code": "2307",
    "name": "伊春市",
    "provinceCode": "23"
  },
  {
    "code": "2308",
    "name": "佳木斯市",
    "provinceCode": "23"
  },
  {
    "code": "2309",
    "name": "七台河市",
    "provinceCode": "23"
  },
  {
    "code": "2310",
    "name": "牡丹江市",
    "provinceCode": "23"
  },
  {
    "code": "2311",
    "name": "黑河市",
    "provinceCode": "23"
  },
  {
    "code": "2312",
    "name": "绥化市",
    "provinceCode": "23"
  },
  {
    "code": "2327",
    "name": "大兴安岭地区",
    "provinceCode": "23"
  },
  {
    "code": "3101",
    "name": "市辖区",
    "provinceCode": "31"
  },
  {
    "code": "3201",
    "name": "南京市",
    "provinceCode": "32"
  },
  {
    "code": "3202",
    "name": "无锡市",
    "provinceCode": "32"
  },
  {
    "code": "3203",
    "name": "徐州市",
    "provinceCode": "32"
  },
  {
    "code": "3204",
    "name": "常州市",
    "provinceCode": "32"
  },
  {
    "code": "3205",
    "name": "苏州市",
    "provinceCode": "32"
  },
  {
    "code": "3206",
    "name": "南通市",
    "provinceCode": "32"
  },
  {
    "code": "3207",
    "name": "连云港市",
    "provinceCode": "32"
  },
  {
    "code": "3208",
    "name": "淮安市",
    "provinceCode": "32"
  },
  {
    "code": "3209",
    "name": "盐城市",
    "provinceCode": "32"
  },
  {
    "code": "3210",
    "name": "扬州市",
    "provinceCode": "32"
  },
  {
    "code": "3211",
    "name": "镇江市",
    "provinceCode": "32"
  },
  {
    "code": "3212",
    "name": "泰州市",
    "provinceCode": "32"
  },
  {
    "code": "3213",
    "name": "宿迁市",
    "provinceCode": "32"
  },
  {
    "code": "3301",
    "name": "杭州市",
    "provinceCode": "33"
  },
  {
    "code": "3302",
    "name": "宁波市",
    "provinceCode": "33"
  },
  {
    "code": "3303",
    "name": "温州市",
    "provinceCode": "33"
  },
  {
    "code": "3304",
    "name": "嘉兴市",
    "provinceCode": "33"
  },
  {
    "code": "3305",
    "name": "湖州市",
    "provinceCode": "33"
  },
  {
    "code": "3306",
    "name": "绍兴市",
    "provinceCode": "33"
  },
  {
    "code": "3307",
    "name": "金华市",
    "provinceCode": "33"
  },
  {
    "code": "3308",
    "name": "衢州市",
    "provinceCode": "33"
  },
  {
    "code": "3309",
    "name": "舟山市",
    "provinceCode": "33"
  },
  {
    "code": "3310",
    "name": "台州市",
    "provinceCode": "33"
  },
  {
    "code": "3311",
    "name": "丽水市",
    "provinceCode": "33"
  },
  {
    "code": "3401",
    "name": "合肥市",
    "provinceCode": "34"
  },
  {
    "code": "3402",
    "name": "芜湖市",
    "provinceCode": "34"
  },
  {
    "code": "3403",
    "name": "蚌埠市",
    "provinceCode": "34"
  },
  {
    "code": "3404",
    "name": "淮南市",
    "provinceCode": "34"
  },
  {
    "code": "3405",
    "name": "马鞍山市",
    "provinceCode": "34"
  },
  {
    "code": "3406",
    "name": "淮北市",
    "provinceCode": "34"
  },
  {
    "code": "3407",
    "name": "铜陵市",
    "provinceCode": "34"
  },
  {
    "code": "3408",
    "name": "安庆市",
    "provinceCode": "34"
  },
  {
    "code": "3410",
    "name": "黄山市",
    "provinceCode": "34"
  },
  {
    "code": "3411",
    "name": "滁州市",
    "provinceCode": "34"
  },
  {
    "code": "3412",
    "name": "阜阳市",
    "provinceCode": "34"
  },
  {
    "code": "3413",
    "name": "宿州市",
    "provinceCode": "34"
  },
  {
    "code": "3415",
    "name": "六安市",
    "provinceCode": "34"
  },
  {
    "code": "3416",
    "name": "亳州市",
    "provinceCode": "34"
  },
  {
    "code": "3417",
    "name": "池州市",
    "provinceCode": "34"
  },
  {
    "code": "3418",
    "name": "宣城市",
    "provinceCode": "34"
  },
  {
    "code": "3501",
    "name": "福州市",
    "provinceCode": "35"
  },
  {
    "code": "3502",
    "name": "厦门市",
    "provinceCode": "35"
  },
  {
    "code": "3503",
    "name": "莆田市",
    "provinceCode": "35"
  },
  {
    "code": "3504",
    "name": "三明市",
    "provinceCode": "35"
  },
  {
    "code": "3505",
    "name": "泉州市",
    "provinceCode": "35"
  },
  {
    "code": "3506",
    "name": "漳州市",
    "provinceCode": "35"
  },
  {
    "code": "3507",
    "name": "南平市",
    "provinceCode": "35"
  },
  {
    "code": "3508",
    "name": "龙岩市",
    "provinceCode": "35"
  },
  {
    "code": "3509",
    "name": "宁德市",
    "provinceCode": "35"
  },
  {
    "code": "3601",
    "name": "南昌市",
    "provinceCode": "36"
  },
  {
    "code": "3602",
    "name": "景德镇市",
    "provinceCode": "36"
  },
  {
    "code": "3603",
    "name": "萍乡市",
    "provinceCode": "36"
  },
  {
    "code": "3604",
    "name": "九江市",
    "provinceCode": "36"
  },
  {
    "code": "3605",
    "name": "新余市",
    "provinceCode": "36"
  },
  {
    "code": "3606",
    "name": "鹰潭市",
    "provinceCode": "36"
  },
  {
    "code": "3607",
    "name": "赣州市",
    "provinceCode": "36"
  },
  {
    "code": "3608",
    "name": "吉安市",
    "provinceCode": "36"
  },
  {
    "code": "3609",
    "name": "宜春市",
    "provinceCode": "36"
  },
  {
    "code": "3610",
    "name": "抚州市",
    "provinceCode": "36"
  },
  {
    "code": "3611",
    "name": "上饶市",
    "provinceCode": "36"
  },
  {
    "code": "3701",
    "name": "济南市",
    "provinceCode": "37"
  },
  {
    "code": "3702",
    "name": "青岛市",
    "provinceCode": "37"
  },
  {
    "code": "3703",
    "name": "淄博市",
    "provinceCode": "37"
  },
  {
    "code": "3704",
    "name": "枣庄市",
    "provinceCode": "37"
  },
  {
    "code": "3705",
    "name": "东营市",
    "provinceCode": "37"
  },
  {
    "code": "3706",
    "name": "烟台市",
    "provinceCode": "37"
  },
  {
    "code": "3707",
    "name": "潍坊市",
    "provinceCode": "37"
  },
  {
    "code": "3708",
    "name": "济宁市",
    "provinceCode": "37"
  },
  {
    "code": "3709",
    "name": "泰安市",
    "provinceCode": "37"
  },
  {
    "code": "3710",
    "name": "威海市",
    "provinceCode": "37"
  },
  {
    "code": "3711",
    "name": "日照市",
    "provinceCode": "37"
  },
  {
    "code": "3713",
    "name": "临沂市",
    "provinceCode": "37"
  },
  {
    "code": "3714",
    "name": "德州市",
    "provinceCode": "37"
  },
  {
    "code": "3715",
    "name": "聊城市",
    "provinceCode": "37"
  },
  {
    "code": "3716",
    "name": "滨州市",
    "provinceCode": "37"
  },
  {
    "code": "3717",
    "name": "菏泽市",
    "provinceCode": "37"
  },
  {
    "code": "4101",
    "name": "郑州市",
    "provinceCode": "41"
  },
  {
    "code": "4102",
    "name": "开封市",
    "provinceCode": "41"
  },
  {
    "code": "4103",
    "name": "洛阳市",
    "provinceCode": "41"
  },
  {
    "code": "4104",
    "name": "平顶山市",
    "provinceCode": "41"
  },
  {
    "code": "4105",
    "name": "安阳市",
    "provinceCode": "41"
  },
  {
    "code": "4106",
    "name": "鹤壁市",
    "provinceCode": "41"
  },
  {
    "code": "4107",
    "name": "新乡市",
    "provinceCode": "41"
  },
  {
    "code": "4108",
    "name": "焦作市",
    "provinceCode": "41"
  },
  {
    "code": "4109",
    "name": "濮阳市",
    "provinceCode": "41"
  },
  {
    "code": "4110",
    "name": "许昌市",
    "provinceCode": "41"
  },
  {
    "code": "4111",
    "name": "漯河市",
    "provinceCode": "41"
  },
  {
    "code": "4112",
    "name": "三门峡市",
    "provinceCode": "41"
  },
  {
    "code": "4113",
    "name": "南阳市",
    "provinceCode": "41"
  },
  {
    "code": "4114",
    "name": "商丘市",
    "provinceCode": "41"
  },
  {
    "code": "4115",
    "name": "信阳市",
    "provinceCode": "41"
  },
  {
    "code": "4116",
    "name": "周口市",
    "provinceCode": "41"
  },
  {
    "code": "4117",
    "name": "驻马店市",
    "provinceCode": "41"
  },
  {
    "code": "4190",
    "name": "省直辖县级行政区划",
    "provinceCode": "41"
  },
  {
    "code": "4201",
    "name": "武汉市",
    "provinceCode": "42"
  },
  {
    "code": "4202",
    "name": "黄石市",
    "provinceCode": "42"
  },
  {
    "code": "4203",
    "name": "十堰市",
    "provinceCode": "42"
  },
  {
    "code": "4205",
    "name": "宜昌市",
    "provinceCode": "42"
  },
  {
    "code": "4206",
    "name": "襄阳市",
    "provinceCode": "42"
  },
  {
    "code": "4207",
    "name": "鄂州市",
    "provinceCode": "42"
  },
  {
    "code": "4208",
    "name": "荆门市",
    "provinceCode": "42"
  },
  {
    "code": "4209",
    "name": "孝感市",
    "provinceCode": "42"
  },
  {
    "code": "4210",
    "name": "荆州市",
    "provinceCode": "42"
  },
  {
    "code": "4211",
    "name": "黄冈市",
    "provinceCode": "42"
  },
  {
    "code": "4212",
    "name": "咸宁市",
    "provinceCode": "42"
  },
  {
    "code": "4213",
    "name": "随州市",
    "provinceCode": "42"
  },
  {
    "code": "4228",
    "name": "恩施土家族苗族自治州",
    "provinceCode": "42"
  },
  {
    "code": "4290",
    "name": "省直辖县级行政区划",
    "provinceCode": "42"
  },
  {
    "code": "4301",
    "name": "长沙市",
    "provinceCode": "43"
  },
  {
    "code": "4302",
    "name": "株洲市",
    "provinceCode": "43"
  },
  {
    "code": "4303",
    "name": "湘潭市",
    "provinceCode": "43"
  },
  {
    "code": "4304",
    "name": "衡阳市",
    "provinceCode": "43"
  },
  {
    "code": "4305",
    "name": "邵阳市",
    "provinceCode": "43"
  },
  {
    "code": "4306",
    "name": "岳阳市",
    "provinceCode": "43"
  },
  {
    "code": "4307",
    "name": "常德市",
    "provinceCode": "43"
  },
  {
    "code": "4308",
    "name": "张家界市",
    "provinceCode": "43"
  },
  {
    "code": "4309",
    "name": "益阳市",
    "provinceCode": "43"
  },
  {
    "code": "4310",
    "name": "郴州市",
    "provinceCode": "43"
  },
  {
    "code": "4311",
    "name": "永州市",
    "provinceCode": "43"
  },
  {
    "code": "4312",
    "name": "怀化市",
    "provinceCode": "43"
  },
  {
    "code": "4313",
    "name": "娄底市",
    "provinceCode": "43"
  },
  {
    "code": "4331",
    "name": "湘西土家族苗族自治州",
    "provinceCode": "43"
  },
  {
    "code": "4401",
    "name": "广州市",
    "provinceCode": "44"
  },
  {
    "code": "4402",
    "name": "韶关市",
    "provinceCode": "44"
  },
  {
    "code": "4403",
    "name": "深圳市",
    "provinceCode": "44"
  },
  {
    "code": "4404",
    "name": "珠海市",
    "provinceCode": "44"
  },
  {
    "code": "4405",
    "name": "汕头市",
    "provinceCode": "44"
  },
  {
    "code": "4406",
    "name": "佛山市",
    "provinceCode": "44"
  },
  {
    "code": "4407",
    "name": "江门市",
    "provinceCode": "44"
  },
  {
    "code": "4408",
    "name": "湛江市",
    "provinceCode": "44"
  },
  {
    "code": "4409",
    "name": "茂名市",
    "provinceCode": "44"
  },
  {
    "code": "4412",
    "name": "肇庆市",
    "provinceCode": "44"
  },
  {
    "code": "4413",
    "name": "惠州市",
    "provinceCode": "44"
  },
  {
    "code": "4414",
    "name": "梅州市",
    "provinceCode": "44"
  },
  {
    "code": "4415",
    "name": "汕尾市",
    "provinceCode": "44"
  },
  {
    "code": "4416",
    "name": "河源市",
    "provinceCode": "44"
  },
  {
    "code": "4417",
    "name": "阳江市",
    "provinceCode": "44"
  },
  {
    "code": "4418",
    "name": "清远市",
    "provinceCode": "44"
  },
  {
    "code": "4419",
    "name": "东莞市",
    "provinceCode": "44"
  },
  {
    "code": "4420",
    "name": "中山市",
    "provinceCode": "44"
  },
  {
    "code": "4451",
    "name": "潮州市",
    "provinceCode": "44"
  },
  {
    "code": "4452",
    "name": "揭阳市",
    "provinceCode": "44"
  },
  {
    "code": "4453",
    "name": "云浮市",
    "provinceCode": "44"
  },
  {
    "code": "4501",
    "name": "南宁市",
    "provinceCode": "45"
  },
  {
    "code": "4502",
    "name": "柳州市",
    "provinceCode": "45"
  },
  {
    "code": "4503",
    "name": "桂林市",
    "provinceCode": "45"
  },
  {
    "code": "4504",
    "name": "梧州市",
    "provinceCode": "45"
  },
  {
    "code": "4505",
    "name": "北海市",
    "provinceCode": "45"
  },
  {
    "code": "4506",
    "name": "防城港市",
    "provinceCode": "45"
  },
  {
    "code": "4507",
    "name": "钦州市",
    "provinceCode": "45"
  },
  {
    "code": "4508",
    "name": "贵港市",
    "provinceCode": "45"
  },
  {
    "code": "4509",
    "name": "玉林市",
    "provinceCode": "45"
  },
  {
    "code": "4510",
    "name": "百色市",
    "provinceCode": "45"
  },
  {
    "code": "4511",
    "name": "贺州市",
    "provinceCode": "45"
  },
  {
    "code": "4512",
    "name": "河池市",
    "provinceCode": "45"
  },
  {
    "code": "4513",
    "name": "来宾市",
    "provinceCode": "45"
  },
  {
    "code": "4514",
    "name": "崇左市",
    "provinceCode": "45"
  },
  {
    "code": "4601",
    "name": "海口市",
    "provinceCode": "46"
  },
  {
    "code": "4602",
    "name": "三亚市",
    "provinceCode": "46"
  },
  {
    "code": "4603",
    "name": "三沙市",
    "provinceCode": "46"
  },
  {
    "code": "4604",
    "name": "儋州市",
    "provinceCode": "46"
  },
  {
    "code": "4690",
    "name": "省直辖县级行政区划",
    "provinceCode": "46"
  },
  {
    "code": "5001",
    "name": "市辖区",
    "provinceCode": "50"
  },
  {
    "code": "5002",
    "name": "县",
    "provinceCode": "50"
  },
  {
    "code": "5101",
    "name": "成都市",
    "provinceCode": "51"
  },
  {
    "code": "5103",
    "name": "自贡市",
    "provinceCode": "51"
  },
  {
    "code": "5104",
    "name": "攀枝花市",
    "provinceCode": "51"
  },
  {
    "code": "5105",
    "name": "泸州市",
    "provinceCode": "51"
  },
  {
    "code": "5106",
    "name": "德阳市",
    "provinceCode": "51"
  },
  {
    "code": "5107",
    "name": "绵阳市",
    "provinceCode": "51"
  },
  {
    "code": "5108",
    "name": "广元市",
    "provinceCode": "51"
  },
  {
    "code": "5109",
    "name": "遂宁市",
    "provinceCode": "51"
  },
  {
    "code": "5110",
    "name": "内江市",
    "provinceCode": "51"
  },
  {
    "code": "5111",
    "name": "乐山市",
    "provinceCode": "51"
  },
  {
    "code": "5113",
    "name": "南充市",
    "provinceCode": "51"
  },
  {
    "code": "5114",
    "name": "眉山市",
    "provinceCode": "51"
  },
  {
    "code": "5115",
    "name": "宜宾市",
    "provinceCode": "51"
  },
  {
    "code": "5116",
    "name": "广安市",
    "provinceCode": "51"
  },
  {
    "code": "5117",
    "name": "达州市",
    "provinceCode": "51"
  },
  {
    "code": "5118",
    "name": "雅安市",
    "provinceCode": "51"
  },
  {
    "code": "5119",
    "name": "巴中市",
    "provinceCode": "51"
  },
  {
    "code": "5120",
    "name": "资阳市",
    "provinceCode": "51"
  },
  {
    "code": "5132",
    "name": "阿坝藏族羌族自治州",
    "provinceCode": "51"
  },
  {
    "code": "5133",
    "name": "甘孜藏族自治州",
    "provinceCode": "51"
  },
  {
    "code": "5134",
    "name": "凉山彝族自治州",
    "provinceCode": "51"
  },
  {
    "code": "5201",
    "name": "贵阳市",
    "provinceCode": "52"
  },
  {
    "code": "5202",
    "name": "六盘水市",
    "provinceCode": "52"
  },
  {
    "code": "5203",
    "name": "遵义市",
    "provinceCode": "52"
  },
  {
    "code": "5204",
    "name": "安顺市",
    "provinceCode": "52"
  },
  {
    "code": "5205",
    "name": "毕节市",
    "provinceCode": "52"
  },
  {
    "code": "5206",
    "name": "铜仁市",
    "provinceCode": "52"
  },
  {
    "code": "5223",
    "name": "黔西南布依族苗族自治州",
    "provinceCode": "52"
  },
  {
    "code": "5226",
    "name": "黔东南苗族侗族自治州",
    "provinceCode": "52"
  },
  {
    "code": "5227",
    "name": "黔南布依族苗族自治州",
    "provinceCode": "52"
  },
  {
    "code": "5301",
    "name": "昆明市",
    "provinceCode": "53"
  },
  {
    "code": "5303",
    "name": "曲靖市",
    "provinceCode": "53"
  },
  {
    "code": "5304",
    "name": "玉溪市",
    "provinceCode": "53"
  },
  {
    "code": "5305",
    "name": "保山市",
    "provinceCode": "53"
  },
  {
    "code": "5306",
    "name": "昭通市",
    "provinceCode": "53"
  },
  {
    "code": "5307",
    "name": "丽江市",
    "provinceCode": "53"
  },
  {
    "code": "5308",
    "name": "普洱市",
    "provinceCode": "53"
  },
  {
    "code": "5309",
    "name": "临沧市",
    "provinceCode": "53"
  },
  {
    "code": "5323",
    "name": "楚雄彝族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5325",
    "name": "红河哈尼族彝族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5326",
    "name": "文山壮族苗族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5328",
    "name": "西双版纳傣族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5329",
    "name": "大理白族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5331",
    "name": "德宏傣族景颇族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5333",
    "name": "怒江傈僳族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5334",
    "name": "迪庆藏族自治州",
    "provinceCode": "53"
  },
  {
    "code": "5401",
    "name": "拉萨市",
    "provinceCode": "54"
  },
  {
    "code": "5402",
    "name": "日喀则市",
    "provinceCode": "54"
  },
  {
    "code": "5403",
    "name": "昌都市",
    "provinceCode": "54"
  },
  {
    "code": "5404",
    "name": "林芝市",
    "provinceCode": "54"
  },
  {
    "code": "5405",
    "name": "山南市",
    "provinceCode": "54"
  },
  {
    "code": "5406",
    "name": "那曲市",
    "provinceCode": "54"
  },
  {
    "code": "5425",
    "name": "阿里地区",
    "provinceCode": "54"
  },
  {
    "code": "6101",
    "name": "西安市",
    "provinceCode": "61"
  },
  {
    "code": "6102",
    "name": "铜川市",
    "provinceCode": "61"
  },
  {
    "code": "6103",
    "name": "宝鸡市",
    "provinceCode": "61"
  },
  {
    "code": "6104",
    "name": "咸阳市",
    "provinceCode": "61"
  },
  {
    "code": "6105",
    "name": "渭南市",
    "provinceCode": "61"
  },
  {
    "code": "6106",
    "name": "延安市",
    "provinceCode": "61"
  },
  {
    "code": "6107",
    "name": "汉中市",
    "provinceCode": "61"
  },
  {
    "code": "6108",
    "name": "榆林市",
    "provinceCode": "61"
  },
  {
    "code": "6109",
    "name": "安康市",
    "provinceCode": "61"
  },
  {
    "code": "6110",
    "name": "商洛市",
    "provinceCode": "61"
  },
  {
    "code": "6201",
    "name": "兰州市",
    "provinceCode": "62"
  },
  {
    "code": "6202",
    "name": "嘉峪关市",
    "provinceCode": "62"
  },
  {
    "code": "6203",
    "name": "金昌市",
    "provinceCode": "62"
  },
  {
    "code": "6204",
    "name": "白银市",
    "provinceCode": "62"
  },
  {
    "code": "6205",
    "name": "天水市",
    "provinceCode": "62"
  },
  {
    "code": "6206",
    "name": "武威市",
    "provinceCode": "62"
  },
  {
    "code": "6207",
    "name": "张掖市",
    "provinceCode": "62"
  },
  {
    "code": "6208",
    "name": "平凉市",
    "provinceCode": "62"
  },
  {
    "code": "6209",
    "name": "酒泉市",
    "provinceCode": "62"
  },
  {
    "code": "6210",
    "name": "庆阳市",
    "provinceCode": "62"
  },
  {
    "code": "6211",
    "name": "定西市",
    "provinceCode": "62"
  },
  {
    "code": "6212",
    "name": "陇南市",
    "provinceCode": "62"
  },
  {
    "code": "6229",
    "name": "临夏回族自治州",
    "provinceCode": "62"
  },
  {
    "code": "6230",
    "name": "甘南藏族自治州",
    "provinceCode": "62"
  },
  {
    "code": "6301",
    "name": "西宁市",
    "provinceCode": "63"
  },
  {
    "code": "6302",
    "name": "海东市",
    "provinceCode": "63"
  },
  {
    "code": "6322",
    "name": "海北藏族自治州",
    "provinceCode": "63"
  },
  {
    "code": "6323",
    "name": "黄南藏族自治州",
    "provinceCode": "63"
  },
  {
    "code": "6325",
    "name": "海南藏族自治州",
    "provinceCode": "63"
  },
  {
    "code": "6326",
    "name": "果洛藏族自治州",
    "provinceCode": "63"
  },
  {
    "code": "6327",
    "name": "玉树藏族自治州",
    "provinceCode": "63"
  },
  {
    "code": "6328",
    "name": "海西蒙古族藏族自治州",
    "provinceCode": "63"
  },
  {
    "code": "6401",
    "name": "银川市",
    "provinceCode": "64"
  },
  {
    "code": "6402",
    "name": "石嘴山市",
    "provinceCode": "64"
  },
  {
    "code": "6403",
    "name": "吴忠市",
    "provinceCode": "64"
  },
  {
    "code": "6404",
    "name": "固原市",
    "provinceCode": "64"
  },
  {
    "code": "6405",
    "name": "中卫市",
    "provinceCode": "64"
  },
  {
    "code": "6501",
    "name": "乌鲁木齐市",
    "provinceCode": "65"
  },
  {
    "code": "6502",
    "name": "克拉玛依市",
    "provinceCode": "65"
  },
  {
    "code": "6504",
    "name": "吐鲁番市",
    "provinceCode": "65"
  },
  {
    "code": "6505",
    "name": "哈密市",
    "provinceCode": "65"
  },
  {
    "code": "6523",
    "name": "昌吉回族自治州",
    "provinceCode": "65"
  },
  {
    "code": "6527",
    "name": "博尔塔拉蒙古自治州",
    "provinceCode": "65"
  },
  {
    "code": "6528",
    "name": "巴音郭楞蒙古自治州",
    "provinceCode": "65"
  },
  {
    "code": "6529",
    "name": "阿克苏地区",
    "provinceCode": "65"
  },
  {
    "code": "6530",
    "name": "克孜勒苏柯尔克孜自治州",
    "provinceCode": "65"
  },
  {
    "code": "6531",
    "name": "喀什地区",
    "provinceCode": "65"
  },
  {
    "code": "6532",
    "name": "和田地区",
    "provinceCode": "65"
  },
  {
    "code": "6540",
    "name": "伊犁哈萨克自治州",
    "provinceCode": "65"
  },
  {
    "code": "6542",
    "name": "塔城地区",
    "provinceCode": "65"
  },
  {
    "code": "6543",
    "name": "阿勒泰地区",
    "provinceCode": "65"
  },
  {
    "code": "6590",
    "name": "自治区直辖县级行政区划",
    "provinceCode": "65"
  }
];
},
"data/provinces-source.json": function(module) {
module.exports = [
  {
    "code": "11",
    "name": "北京市"
  },
  {
    "code": "12",
    "name": "天津市"
  },
  {
    "code": "13",
    "name": "河北省"
  },
  {
    "code": "14",
    "name": "山西省"
  },
  {
    "code": "15",
    "name": "内蒙古自治区"
  },
  {
    "code": "21",
    "name": "辽宁省"
  },
  {
    "code": "22",
    "name": "吉林省"
  },
  {
    "code": "23",
    "name": "黑龙江省"
  },
  {
    "code": "31",
    "name": "上海市"
  },
  {
    "code": "32",
    "name": "江苏省"
  },
  {
    "code": "33",
    "name": "浙江省"
  },
  {
    "code": "34",
    "name": "安徽省"
  },
  {
    "code": "35",
    "name": "福建省"
  },
  {
    "code": "36",
    "name": "江西省"
  },
  {
    "code": "37",
    "name": "山东省"
  },
  {
    "code": "41",
    "name": "河南省"
  },
  {
    "code": "42",
    "name": "湖北省"
  },
  {
    "code": "43",
    "name": "湖南省"
  },
  {
    "code": "44",
    "name": "广东省"
  },
  {
    "code": "45",
    "name": "广西壮族自治区"
  },
  {
    "code": "46",
    "name": "海南省"
  },
  {
    "code": "50",
    "name": "重庆市"
  },
  {
    "code": "51",
    "name": "四川省"
  },
  {
    "code": "52",
    "name": "贵州省"
  },
  {
    "code": "53",
    "name": "云南省"
  },
  {
    "code": "54",
    "name": "西藏自治区"
  },
  {
    "code": "61",
    "name": "陕西省"
  },
  {
    "code": "62",
    "name": "甘肃省"
  },
  {
    "code": "63",
    "name": "青海省"
  },
  {
    "code": "64",
    "name": "宁夏回族自治区"
  },
  {
    "code": "65",
    "name": "新疆维吾尔自治区"
  }
];
}
  };
  const cache = {};

  function load(id) {
    if (cache[id]) return cache[id].exports;
    const fn = modules[id];
    if (!fn) throw new Error('Unknown module ' + id);
    const module = { exports: {} };
    cache[id] = module;
    const base = id.slice(0, id.lastIndexOf('/') + 1);
    fn(module, module.exports, function(spec) {
      let normalized = spec.startsWith('.') ? base + spec : spec;
      const segments = [];
      for (const part of normalized.split('/')) {
        if (part === '..') segments.pop();
        else if (part !== '.' && part) segments.push(part);
      }
      normalized = segments.join('/');
      if (!/\.(?:js|json)$/.test(normalized)) normalized += '.js';
      return load(normalized);
    });
    return module.exports;
  }

  load('src/main.js');
})();
