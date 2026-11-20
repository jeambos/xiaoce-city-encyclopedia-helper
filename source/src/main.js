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
