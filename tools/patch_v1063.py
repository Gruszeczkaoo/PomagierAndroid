"""Pomagier 1.0.63: profile opponent diagnostic, metadata-only API route logger."""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
s=js.read_text(encoding='utf8')

def one(old,new,label):
 global s
 count=s.count(old)
 if count!=1:raise SystemExit(f'{label}: expected once, got {count}')
 s=s.replace(old,new,1)

one('// @version      8.8.69','// @version      8.8.70','meta version')
one("const VERSION = '8.8.69';","const VERSION = '8.8.70';",'version')
one("const ANDROID_VERSION = '1.0.62';","const ANDROID_VERSION = '1.0.63';",'android version')
code=Path(__file__).with_name('opponent_diag_v1063.js').read_text(encoding='utf8')
one('  function opponentLabHTML(){',code+'\n  function opponentLabHTML(){','new diagnostic module')
one('''    return `<div class="helper-hero"><div><div class="helper-name">🔎 Analizator przeciwnika PvP</div><div class="sub">Dane z replayów i profili otwieranych w grze • tylko odczyt. Liczby A/B pokazujemy tylko po potwierdzeniu przez API.</div></div><div class="helper-actions"><button data-act="opp-sync">↻ Synchronizuj replaye</button><button data-act="opp-filter">Szukaj nicku / ID</button><button data-act="opp-export">Eksport przeciwników JSON</button></div></div>''','''    const diag=opponentLabDiagState();
    const active=opponentLabDiagActive();
    const diagRows=Object.entries(diag.paths||{}).sort((a,b)=>Number(b[1].lastAt||0)-Number(a[1].lastAt||0)).slice(0,20)
      .map(([path,v])=>`<div class="sub">${esc(path)} • ${Number(v.count)||0}× • ${esc((v.keys||[]).join(', '))}</div>`).join('');
    return `<div class="helper-hero"><div><div class="helper-name">🔎 Analizator przeciwnika PvP</div><div class="sub">Dane z replayów i profili otwieranych w grze • tylko odczyt. Liczby A/B pokazujemy tylko po potwierdzeniu przez API.</div></div><div class="helper-actions"><button data-act="opp-sync">↻ Synchronizuj replaye</button><button data-act="opp-filter">Szukaj nicku / ID</button><button data-act="opp-export">Eksport przeciwników JSON + diagnostyka</button>${active?'<button data-act="opp-diag-stop">⏹ Zatrzymaj skan</button>':'<button data-act="opp-diag-start">🔍 Skanuj profil (5 min)</button>'}</div></div>
      <div class="section"><div class="section-title">Diagnostyka API profilu (${Object.keys(diag.paths||{}).length} ścieżek)</div>
      <div class="sub">${active?'Skan aktywny — otwórz teraz profil przeciwnika w grze.':'Uruchom skan i otwórz profil Wilson28 w grze.'} Przechwytywane są tylko nazwy pól odpowiedzi GET i ścieżki bez parametrów; bez loginów, tokenów i treści.</div>
      ${diagRows||'<div class="sub">Brak odpowiedzi podczas skanu.</div>'}</div>''','diagnostic UI')
one('''    const data=JSON.stringify({type:'pomagier-opponent-lab',schema:1,version:VERSION,androidVersion:ANDROID_VERSION,
      exportedAt:nowIso(),characterId:pvpLabOwnId(),readOnly:true,rows},null,2);''','''    const d=opponentLabDiagState();
    const diagnostics={startedAt:d.startedAt||0,stoppedAt:d.stoppedAt||0,active:opponentLabDiagActive(),
      scannedEndpoints:Object.keys(d.paths||{}).length,hits:d.hits||0,paths:d.paths||{}};
    const data=JSON.stringify({type:'pomagier-opponent-lab',schema:2,version:VERSION,androidVersion:ANDROID_VERSION,
      exportedAt:nowIso(),characterId:pvpLabOwnId(),readOnly:true,diagnostics,rows},null,2);''','add diagnostics to export')
one("    if(act==='opp-sync'){ await pvpLabSync({silent:false}); render(); return; }","""    if(act==='opp-diag-start'){opponentLabDiagStart();return;}
    if(act==='opp-diag-stop'){opponentLabDiagStop();return;}
    if(act==='opp-sync'){ await pvpLabSync({silent:false}); render(); return; }""",'diagnostic actions')
one('''        // Tylko publicznie odczytane profile tych przeciwnikow, ktorzy wystepuja w historii PvP.
        try{''','''        // Diagnostyka po wyraźnym uruchomieniu przez użytkownika, tylko GET.
        try{
          const url=candidateUrl || (typeof input==='string'?input:(input?.url||response?.url||''));
          if(__mgInternalApiDepth===0 && isSameOriginApiUrl(url) && candidateMethod==='GET' && opponentLabDiagActive()){
            const len=Number(response?.headers?.get?.('content-length')||0);
            const ct=String(response?.headers?.get?.('content-type')||'');
            if(response?.ok && /json/i.test(ct) && (!len || len<250000))
              response.clone().json().then(d=>opponentLabDiagCapture(url,'GET',response.status,d,'native-fetch'))
                .catch(()=>opponentLabDiagCapture(url,'GET',response.status,null,'native-fetch'));
            else opponentLabDiagCapture(url,'GET',response.status,null,'native-fetch');
          }
        }catch(e){console.warn('[MG Opponent Lab] diag fetch',e);}

        // Tylko publicznie odczytane profile tych przeciwnikow, ktorzy wystepuja w historii PvP.
        try{''','fetch network')
one("                if(data && __mgInternalApiDepth===0 && this.__mgNativeMethod==='GET' && opponentLabProfilePath(url)) opponentLabObserveProfile(url,data,{method:'GET',source:'native-xhr'});","""                if(data && __mgInternalApiDepth===0 && this.__mgNativeMethod==='GET' && opponentLabProfilePath(url)) opponentLabObserveProfile(url,data,{method:'GET',source:'native-xhr'});
                if(__mgInternalApiDepth===0 && this.__mgNativeMethod==='GET' && opponentLabDiagActive()) opponentLabDiagCapture(url,'GET',this.status,data,'native-xhr');""",'xhr network')
# Sanity
for chk in ['opponentLabDiagStart()', 'schema:2,version:VERSION','candidateMethod===\'GET\' && opponentLabDiagActive()',"if(act==='opp-diag-start')"]:
 if chk not in s:raise SystemExit('Missing '+chk)
js.write_text(s,encoding='utf8')
g=root/'app/build.gradle.kts';t=g.read_text(encoding='utf8')
assert t.count('versionCode = 10062')==1 and t.count('versionName = "1.0.62"')==1
g.write_text(t.replace('versionCode = 10062','versionCode = 10063',1).replace('versionName = "1.0.62"','versionName = "1.0.63"',1),encoding='utf8')
r=root/'README.md'
if r.exists():r.write_text(r.read_text(encoding='utf8')+'''\n\n## v1.0.63 — Diagnostyka profili PvP\n- Analizator przeciwnikow: 5-minutowy skan tylko GET, jawnie uruchamiany przez użytkownika.\n- Eksport: struktura odpowiedzi API (ścieżki bez query, tylko nazwy pól) bez prywatnych wartości, tokenów, loginów.\n- Znajdowanie kompletnego buildu przeciwnika także w nowych zagnieżdżonych odpowiedziach zawierających jego identyfikator.\n- Zabezpieczenie przed myleniem postaci użytkownika z przeciwnikiem.\n''',encoding='utf8')
print('OK 1.0.63 / 8.8.70')