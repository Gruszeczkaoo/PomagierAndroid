'use strict';
const fs=require('fs'), vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(process.argv[2]||'app/src/main/assets/pomagier.user.js','utf8');
function cut(start,end){const a=src.indexOf(start);assert(a>=0,start);const b=src.indexOf(end,a+start.length);assert(b>=0,end);return src.slice(a,b)}
let writes=0,clock=100000,htmlData='<h2>Przeciwnicy</h2>'+('x'.repeat(800)), timers=[];
const body={dataset:{},scrollTop:0,scrollHeight:3200,clientHeight:800,_html:'',
 get innerHTML(){return this._html},set innerHTML(v){writes++;this._html=v;this.scrollTop=0;this.scrollHeight=3200;}}
const panel={querySelector(s){if(s==='.content')return body;if(s==='[data-act="toggle-advanced-ui"]')return {textContent:''};return null},querySelectorAll(s){return [{dataset:{tab:'opponentLab'},classList:{toggle(){}}},{dataset:{tab:'pvpLab'},classList:{toggle(){}}}]}};
const context={panel, state:{activeTab:'opponentLab'},advancedUiOpen:true,updateHeader(){},__mgRenderTabHTML(tab){return tab==='opponentLab'?htmlData:'<section>pvp</section>'},requestAnimationFrame(fn){timers.push([clock+16,fn]);},setTimeout(fn,ms){timers.push([clock+ms,fn]);return timers.length},clearTimeout(){},Date:{now:()=>clock},Math,Number,Object,String};
vm.createContext(context);
const defs=cut('  const __mgPanelScrollByTab=Object.create(null);','  function __mgPanelScheduleRender(')
    +cut('  function __mgPanelScheduleRender(','  function __mgRenderTabHTML(')
    +cut('  function render(force=false){','  function updateHeader() {');
vm.runInContext(defs,context);
function exec(x){return vm.runInContext(x,context)}
function tick(n){clock+=n;for(let pass=0;pass<6;pass++){const due=timers.filter(t=>t[0]<=clock);timers=timers.filter(t=>t[0]>clock);if(!due.length)break;due.forEach(t=>t[1]())}}
exec('render()'); assert.equal(writes,1);
exec('__mgPanelScrollInteractionId++;__mgPanelRestoreGuardUntil=0;');body.scrollTop=1175;exec('__mgPanelRememberScroll()'); assert.equal(exec('__mgPanelScrollByTab.opponentLab'),1175);
exec('render()');assert.equal(writes,1,'Unchanged HTML must not rebuild content');assert.equal(body.scrollTop,1175);
htmlData='<h2>Przeciwnicy (43)</h2>'+('x'.repeat(800));exec('render()');assert.equal(writes,2);assert.equal(body.scrollTop,1175,'scroll position must survive fresh content');
body.scrollTop=0;exec('__mgPanelRememberScroll()');assert.equal(exec('__mgPanelScrollByTab.opponentLab'),1175,'late internal scroll must not wipe remembered position');
tick(100);assert.equal(body.scrollTop,1175,'delayed WebView layout must restore saved position');
tick(250);
exec('state.activeTab="pvpLab";render(true)');assert.equal(writes,3);
exec('state.activeTab="opponentLab";render(true)');assert.equal(writes,4);assert.equal(body.scrollTop,1175,'tab re-entry must restore previous position');
exec('__mgPanelScrollInteractionId++');body.scrollTop=1680;tick(150);assert.equal(body.scrollTop,1680,'manual gesture must not be overwritten by deferred restore');
tick(350);exec('__mgPanelRememberScroll()');assert.equal(exec('__mgPanelScrollByTab.opponentLab'),1680);
console.log('PASS scroll regressions: unchanged HTML, live refresh, async restore, tab switching, touch gesture');
