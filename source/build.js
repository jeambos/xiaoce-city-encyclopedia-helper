const fs=require('node:fs');
const path=require('node:path');

const root=__dirname;
const modules=['src/data.js','src/core.js','src/roles.js','src/adapter.js','src/layout.js','src/ui-model.js','src/ui.js','src/main.js'];
const json=['data/cities-source.json','data/provinces-source.json'];
const parts=[];
function formatCss(css) {
  const lines=[];
  let depth=0,token='';
  const flush=suffix=>{if(token.trim())lines.push(`${'  '.repeat(depth)}${token.trim()}${suffix}`);token='';};
  for(const ch of css){
    if(ch==='{'){flush(' {');depth++;}
    else if(ch===';')flush(';');
    else if(ch==='}'){
      flush('');depth=Math.max(0,depth-1);lines.push(`${'  '.repeat(depth)}}`);
    }else token+=ch;
  }
  flush('');
  return lines.join('\n');
}
for(const file of modules){
  let source=fs.readFileSync(path.join(root,file),'utf8');
  if(file==='src/ui.js')source=source.replace(/const css = `([\s\S]*?)`;/,
    (_whole,raw)=>`const css = \`\n${formatCss(raw)}\n\`;`);
  parts.push(`${JSON.stringify(file)}: function(module, exports, require) {\n${source}\n}`);
}
for(const file of json){const parsed=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));parts.push(`${JSON.stringify(file)}: function(module) {\nmodule.exports = ${JSON.stringify(parsed,null,2)};\n}`);}
const metadata=`// ==UserScript==
// @name         城市百科助手
// @namespace    https://xiaoce.fun/
// @version      2.0.0
// @description  猜盐城市百科助手：推荐下一字、点击直接提交、查看候选城市。
// @license      PolyForm-Noncommercial-1.0.0
// @match        https://xiaoce.fun/c/*
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==\n`;
const runtime=`(function() {
  'use strict';
  const modules = {
${parts.join(',\n')}
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
      if (!/\\.(?:js|json)$/.test(normalized)) normalized += '.js';
      return load(normalized);
    });
    return module.exports;
  }

  load('src/main.js');
})();
`;
const out=path.resolve(root,'dist/城市百科助手.user.js');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,metadata+runtime,'utf8');
console.log(out,fs.statSync(out).size,'bytes');
