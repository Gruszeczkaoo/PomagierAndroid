"""Pomagier Android 1.0.62 / userscript 8.8.69 — fix auto-scroll jumps.

UI only: do not reflow unchanged tab and preserve scroll position across genuine
content changes (including async Android WebView layout and queued scroll events).
"""
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js = root/'app/src/main/assets/pomagier.user.js'
if not js.exists(): raise SystemExit('Brak app/src/main/assets/pomagier.user.js')
s = js.read_text(encoding='utf8')

def one(old, new, label):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: oczekiwano jednej kotwicy, znaleziono {n}')
    s=s.replace(old,new,1)

one('// @version      8.8.68','// @version      8.8.69','metadata')
one("const VERSION = '8.8.68';","const VERSION = '8.8.69';",'version')
one("const ANDROID_VERSION = '1.0.61';","const ANDROID_VERSION = '1.0.62';",'android version')

one('''  let __mgPanelRenderPending=false;
  let __mgPanelRenderTimer=null;
''','''  let __mgPanelRenderPending=false;
  let __mgPanelRenderTimer=null;
  // WebView: innerHTML on the entire .content used to drop user's scroll position.
  // These guards separate internal layout scrolls from real finger gestures.
  let __mgPanelRestoreGuardUntil=0;
  let __mgPanelRestoreTab='';
  let __mgPanelScrollInteractionId=0;
  let __mgPanelWritingContent=false;
''','scroll variables')

one('''  function __mgPanelRememberScroll(){
    const body=panel?.querySelector?.('.content');
    if(!body) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
  }
''','''  function __mgPanelRememberScroll(){
    const body=panel?.querySelector?.('.content');
    if(!body || __mgPanelWritingContent) return;
    // An internal scroll event queued by innerHTML must not overwrite saved y.
    if(Date.now()<__mgPanelRestoreGuardUntil &&
       String(body.dataset?.renderedTab||'')===__mgPanelRestoreTab &&
       !__mgPanelTouching) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
  }
''','remember scroll')

start=s.index('  function render(force=false){')
end=s.index('\n  function updateHeader() {',start)
old=s[start:end]
new='''  function render(force=false){
    const body=panel.querySelector('.content');
    if(!body || __mgPanelWritingContent) return;
    __mgPanelRememberScroll();

    if(!force && __mgPanelBusyScrolling()){
      __mgPanelScheduleRender(300);
      updateHeader();
      return;
    }

    if(force){
      __mgPanelTouching=false;
      __mgPanelScrollHoldUntil=0;
      if(__mgPanelRenderTimer){ clearTimeout(__mgPanelRenderTimer); __mgPanelRenderTimer=null; }
      __mgPanelRenderPending=false;
    }

    const targetTab=String(state.activeTab||'autopilot');
    const nextHTML=__mgRenderTabHTML(targetTab);
    const tabs=panel.querySelectorAll('.tab');
    tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===targetTab));

    const advBtn=panel.querySelector('[data-act="toggle-advanced-ui"]');
    if(advBtn) advBtn.textContent=advancedUiOpen?'▴ Mniej':'☰ Więcej';

    // Most background calls to render() do not change the currently open tab.
    // Preserve its DOM, native scroll and active selection instead of rebuilding.
    if(!force && body.dataset.renderedTab===targetTab && body.__mgLastRenderedHTML===nextHTML){
      updateHeader();
      return;
    }

    const wanted=Math.max(0,Number(__mgPanelScrollByTab[targetTab]||0));
    const gestureAtRender=__mgPanelScrollInteractionId;
    const restore=()=>{
      if(String(state.activeTab||'')!==targetTab || body.dataset.renderedTab!==targetTab) return;
      if(__mgPanelTouching || gestureAtRender!==__mgPanelScrollInteractionId) return;
      const max=Math.max(0,Number(body.scrollHeight||0)-Number(body.clientHeight||0));
      const y=Math.min(wanted,max);
      if(Math.abs(Number(body.scrollTop||0)-y)>1) body.scrollTop=y;
      __mgPanelScrollByTab[targetTab]=y;
    };

    __mgPanelWritingContent=true;
    __mgPanelRestoreTab=targetTab;
    __mgPanelRestoreGuardUntil=Date.now()+220;
    try{
      body.innerHTML=nextHTML;
      body.dataset.renderedTab=targetTab;
      body.__mgLastRenderedHTML=nextHTML;
      restore();
    }finally{
      __mgPanelWritingContent=false;
    }
    // WebView can update element height one or two frames after innerHTML.
    // Only replay saved y if there has not been a new user gesture.
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(restore);
    setTimeout(restore,90);
    updateHeader();
  }
'''
s=s[:start]+new+s[end:]

one('''    __mgPanelTouching=true;
    __mgPanelScrollHoldUntil=Date.now()+1200;
    __mgPanelRememberScroll();
''','''    __mgPanelTouching=true;
    __mgPanelScrollInteractionId++;
    __mgPanelRestoreGuardUntil=0;
    __mgPanelScrollHoldUntil=Date.now()+1200;
    __mgPanelRememberScroll();
''','touchstart')

one('''  panel.addEventListener('scroll',e=>{
    const body=e.target;
    if(!(body&&body.classList&&body.classList.contains('content'))) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
    __mgPanelScrollHoldUntil=Date.now()+700;
    if(__mgPanelRenderPending) __mgPanelScheduleRender(750);
  },true);
''','''  panel.addEventListener('scroll',e=>{
    const body=e.target;
    if(!(body&&body.classList&&body.classList.contains('content'))) return;
    if(__mgPanelWritingContent) return;
    // The browser sends queued scroll events after the DOM was replaced.
    // Do not treat these programmatic scrolls as a fresh human scroll.
    if(!__mgPanelTouching && Date.now()<__mgPanelRestoreGuardUntil &&
       String(body.dataset?.renderedTab||'')===__mgPanelRestoreTab) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
    __mgPanelScrollHoldUntil=Date.now()+700;
    if(__mgPanelRenderPending) __mgPanelScheduleRender(750);
  },true);
  panel.addEventListener('wheel',e=>{
    if(!__mgPanelContentEvent(e)) return;
    __mgPanelScrollInteractionId++;
    __mgPanelRestoreGuardUntil=0;
  },{capture:true,passive:true});
''','scroll events')

# In-flight tab changes must not inherit a timer intended for the previous tab.
for k in ['body.__mgLastRenderedHTML===nextHTML','__mgPanelScrollInteractionId++','__mgPanelRestoreGuardUntil=Date.now()+220']:
    if k not in s: raise SystemExit('Brak zabezpieczenia: '+k)
js.write_text(s,encoding='utf8')

g = root/'app/build.gradle.kts'
t=g.read_text(encoding='utf8')
if t.count('versionCode = 10061')!=1 or t.count('versionName = "1.0.61"')!=1:
    raise SystemExit('Wymagana wersja Gradle 1.0.61')
t=t.replace('versionCode = 10061','versionCode = 10062',1).replace('versionName = "1.0.61"','versionName = "1.0.62"',1)
g.write_text(t,encoding='utf8')
readme = root/'README.md'
if readme.exists():
    readme.write_text(readme.read_text(encoding='utf8')+'''

## v1.0.62 / 8.8.69 — trwale przewijanie Pomagiera
- Pomijanie zbędnej przebudowy identycznej zawartości zakładek (także analizatora przeciwników).
- Zachowanie pionowego przewijania przy prawdziwym odświeżeniu wyników.
- Ochrona przed asynchronicznymi zdarzeniami scroll Android WebView po innerHTML.
- Obsługa gestów touch i wheel bez wyrywania ekranu spod palca.
- Nie modyfikuje automatyzacji, danych PvP ani Ligi Meneli.
''',encoding='utf8')
print('OK v1.0.62 / 8.8.69 — nieprzerywaj przewijania')
