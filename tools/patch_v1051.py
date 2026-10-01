from pathlib import Path
import sys,re

root=Path(sys.argv[1])
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

if "// @version      8.8.57" not in s:
    raise SystemExit("Oczekiwano JS 8.8.57")
s=s.replace("// @version      8.8.57","// @version      8.8.58",1)
s=s.replace("const VERSION = '8.8.57';","const VERSION = '8.8.58';",1)
s=s.replace("const ANDROID_VERSION = '1.0.50';","const ANDROID_VERSION = '1.0.51';",1)

a=s.find("  const __mgPanelScrollByTab=Object.create(null);")
b=s.find("  function updateHeader()",a)
if a<0 or b<0:
    raise SystemExit("Brak render v1.0.50")

new=r"""  const __mgPanelScrollByTab=Object.create(null);
  let __mgPanelTouching=false;
  let __mgPanelScrollHoldUntil=0;
  let __mgPanelRenderPending=false;
  let __mgPanelRenderTimer=null;

  function __mgPanelBusyScrolling(){
    return __mgPanelTouching || Date.now()<Number(__mgPanelScrollHoldUntil||0);
  }
  function __mgPanelRememberScroll(){
    const body=panel?.querySelector?.('.content');
    if(!body) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
  }
  function __mgPanelScheduleRender(delay=350){
    __mgPanelRenderPending=true;
    if(__mgPanelRenderTimer) clearTimeout(__mgPanelRenderTimer);
    __mgPanelRenderTimer=setTimeout(()=>{
      __mgPanelRenderTimer=null;
      if(__mgPanelBusyScrolling()){ __mgPanelScheduleRender(280); return; }
      if(!__mgPanelRenderPending) return;
      __mgPanelRenderPending=false;
      render();
    },Math.max(80,Number(delay)||350));
  }

  function render() {
    const body=panel.querySelector('.content');
    __mgPanelRememberScroll();
    if(__mgPanelBusyScrolling()){
      __mgPanelScheduleRender(300);
      updateHeader();
      return;
    }

    const targetTab=String(state.activeTab||'dashboard');
    const wanted=Math.max(0,Number(__mgPanelScrollByTab[targetTab]||0));
    const tabs=panel.querySelectorAll('.tab');
    tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===state.activeTab));
    const advBtn=panel.querySelector('[data-act="toggle-advanced-ui"]');
    if(advBtn) advBtn.textContent=advancedUiOpen?'▴ Mniej':'☰ Więcej';

    if(state.activeTab==='dashboard') body.innerHTML=dashboardHTML();
    if(state.activeTab==='crafting') body.innerHTML=craftingHTML();
    if(state.activeTab==='resources') body.innerHTML=resourcesHTML();
    if(state.activeTab==='watch') body.innerHTML=watchHTML();
    if(state.activeTab==='sessions') body.innerHTML=sessionsHTML();
    if(state.activeTab==='history') body.innerHTML=historyHTML();
    if(state.activeTab==='autopilot') body.innerHTML=autopilotHTML();
    if(state.activeTab==='manual') body.innerHTML=manualDismantleHTML();
    if(state.activeTab==='pvpLab') body.innerHTML=pvpLabHTML();
    if(state.activeTab==='bossLab') body.innerHTML=bossLabHTML();
    if(state.activeTab==='settings') body.innerHTML=settingsHTML();

    body.dataset.renderedTab=targetTab;
    const restore=()=>{
      if(__mgPanelBusyScrolling() || String(state.activeTab||'')!==targetTab) return;
      const max=Math.max(0,Number(body.scrollHeight||0)-Number(body.clientHeight||0));
      const y=Math.min(wanted,max);
      if(Math.abs(Number(body.scrollTop||0)-y)>1) body.scrollTop=y;
      __mgPanelScrollByTab[targetTab]=y;
    };
    restore();
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(restore);
    updateHeader();
  }

"""
s=s[:a]+new+s[b:]

anchor="  const panel = makePanel();"
if anchor not in s:
    raise SystemExit("Brak panel")
listeners=r"""  const panel = makePanel();

  const __mgPanelContentEvent=e=>!!(e&&e.target&&e.target.closest&&e.target.closest('.content'));
  panel.addEventListener('touchstart',e=>{
    if(!__mgPanelContentEvent(e)) return;
    __mgPanelTouching=true;
    __mgPanelScrollHoldUntil=Date.now()+1200;
    __mgPanelRememberScroll();
  },{capture:true,passive:true});
  panel.addEventListener('touchmove',e=>{
    if(!__mgPanelContentEvent(e)) return;
    __mgPanelScrollHoldUntil=Date.now()+1200;
    __mgPanelRememberScroll();
  },{capture:true,passive:true});
  const __mgPanelTouchEnd=()=>{
    if(!__mgPanelTouching) return;
    __mgPanelTouching=false;
    __mgPanelScrollHoldUntil=Date.now()+900;
    __mgPanelRememberScroll();
    if(__mgPanelRenderPending) __mgPanelScheduleRender(950);
  };
  panel.addEventListener('touchend',__mgPanelTouchEnd,{capture:true,passive:true});
  panel.addEventListener('touchcancel',__mgPanelTouchEnd,{capture:true,passive:true});
  panel.addEventListener('scroll',e=>{
    const body=e.target;
    if(!(body&&body.classList&&body.classList.contains('content'))) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
    __mgPanelScrollHoldUntil=Date.now()+700;
    if(__mgPanelRenderPending) __mgPanelScheduleRender(750);
  },true);"""
s=s.replace(anchor,listeners,1)

old="""      pvpEngineScanTick();
      if(state.activeTab!=='pvpLab') return;"""
new2="""      pvpEngineScanTick();
      if(state.activeTab!=='pvpLab') return;
      if(__mgPanelBusyScrolling()) return;"""
if old not in s:
    raise SystemExit("Brak timera skanera")
s=s.replace(old,new2,1)

for x in [
    "// @version      8.8.58",
    "const ANDROID_VERSION = '1.0.51';",
    "let __mgPanelTouching=false;",
    "function __mgPanelBusyScrolling()",
    "panel.addEventListener('touchstart'",
    "panel.addEventListener('scroll'",
    "if(__mgPanelBusyScrolling()) return;"
]:
    if x not in s: raise SystemExit("Brak: "+x)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10050" not in t or 'versionName = "1.0.50"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.50")
t=t.replace("versionCode = 10050","versionCode = 10051",1)
t=t.replace('versionName = "1.0.50"','versionName = "1.0.51"',1)
bg.write_text(t,encoding="utf-8")

print("v1.0.51 applied")
print("OK: render locked during touch/momentum")
print("OK: live scroll memory")
print("OK: scanner paused while scrolling")
