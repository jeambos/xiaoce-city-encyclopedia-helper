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
