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
