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
