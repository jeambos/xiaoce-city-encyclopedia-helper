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
