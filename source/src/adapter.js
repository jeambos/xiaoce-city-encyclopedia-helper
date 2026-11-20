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
