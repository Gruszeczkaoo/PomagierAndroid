"""Pomagier 1.0.71 / userscript 8.8.78.

Autonomous prestige battles using action points: remove arbitrary roll/day
limits, refresh opponent list after each fight, skip zero-prestige targets.
Apply after the verified 1.0.70 source. No requests are sent by this patch.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf8')

def one(old,new,label):
    global s
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'v1071 {label}: expected exactly once, got {n}')
    s=s.replace(old,new,1)

one('// @version      8.8.77','// @version      8.8.78','script metadata')
one("const VERSION = '8.8.77';", "const VERSION = '8.8.78';",'script version')
one("const ANDROID_VERSION = '1.0.70';", "const ANDROID_VERSION = '1.0.71';",'android version')
one('''  prestigeAuto.maxDaily=12; // limit asekuracyjny, rzeczywiste punkty okresla serwer''','''  // Dwanaście to maksymalny zapas punktów, NIE dzienny limit walk.
  // Gra odnawia po 4 punkty o 07:00, 12:00 i 17:00.
  prestigeAuto.maxDaily=0; // bez sztucznego limitu; stan serwera rozstrzyga''','no daily cap')
one("prestigeAuto.rollsToday.slice(-30)", "prestigeAuto.rollsToday.slice(-500)",'roll accounting')
one('''    const ranked=rows.filter(x=>Number.isInteger(Number(x?.level))&&Number(x.level)>0&&
      Number.isSafeInteger(Number(x?.id))&&Number(x.id)>0)''','''    // Gdy celem jest PRESTIŻ, nie zużywaj punktu na rywala z +0.
    // Serwerowy expectedGain uwzględnia także różnicę ELO (~700 pkt).
    const ranked=rows.filter(x=>Number(x?.expectedGain)>0&&
      Number.isInteger(Number(x?.level))&&Number(x.level)>0&&
      Number.isSafeInteger(Number(x?.id))&&Number(x.id)>0)''','lowest LVL positive prestige only')
one("'remainingDuels','remainingToday','attacksLeft','duelsLeft'", "'remainingDuels','remainingToday','attacksLeft','duelsLeft',\n      'actionPoints','action_points','currentActionPoints','remainingActionPoints'",'action points aliases')
one('''    }else if(confirm('Zezwolic na automatyczne LOSOWANIE przeciwnikow przez POST? Nie znamy kosztu tej operacji. Pomagier zrobi najwyzej 12 losowan dziennie, maksymalnie co 30 minut; zatrzyma sie przy bledzie lub podejrzeniu wydania punktu walki.')){''','''    }else if(confirm('Zezwolic na automatyczne LOSOWANIE 3 przeciwnikow przez POST? Z opisu gry wynika, ze 1 punkt kosztuje pojedynek, nie losowanie. Pomagier sprawdza punkty przed i po losowaniu; zatrzyma sie, gdy je zuzyje lub wystapi blad.')){''','new roll consent')
one("    if(Date.now()-prestigeAuto.lastAutoRollAt<30*60000 || prestigeAutoRollsDay()>=12)return;",'''    // Nie ma arbitralnych 30 minut ani 12 losowań/dobę.
    // Liczba powtórek w jednym cyklu jest ograniczona w prestigeAutoCycle,
    // a każde losowanie wymaga wcześniejszego opt-in i stanu z serwera.''','remove roll throttle')
one('''    if(before.remaining!=null && after.remaining!=null && after.remaining<before.remaining){
      prestigeAuto.enabled=false;prestigeAuto.allowAutoRoll=false;
      prestigeAuto.status='STOP: LOSOWANIE ZUZYLO PUNKTY WALKI';
    }''','''    if(before.remaining!=null && after.remaining!=null && after.remaining<before.remaining){
      prestigeAuto.enabled=false;prestigeAuto.allowAutoRoll=false;
      prestigeAuto.status='STOP: LOSOWANIE ZUZYLO PUNKTY WALKI';
    }else if(!after.ready){
      prestigeAuto.status='PO LOSOWANIU BRAK DOSTEPNYCH PUNKTOW — bez ataku';
    }''','validate postroll status')
start=s.index('  async function prestigeAutoCycle({manual=false}={}){')
end=s.index('\n  async function prestigeAutoRefreshTargets(){',start)
new_cycle='''  async function prestigeAutoCycle({manual=false}={}){
    prestigeAutoGuard();
    if(!prestigeAuto.enabled || prestigeAuto.runtimeBusy || prestigeAutoBusyElsewhere())return;
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if(!__mgSessionTemplate){prestigeAuto.status='CZEKAM NA SESJE GRY';prestigeAutoSave();return;}
    const now=Date.now();
    if(!manual && now-prestigeAuto.lastCheckAt<prestigeAuto.checkMinutes*60000)return;
    prestigeAuto.lastCheckAt=now;
    if(!prestigeAuto.calibration||prestigeAuto.calibration.type!=='target-id'||
       prestigeAuto.calibration.ownId!==pvpLabOwnId()){
      prestigeAutoStop('AUTO STOP — brak potwierdzonego formatu ataku');return;
    }
    prestigeAuto.runtimeBusy=true;
    let completed=0,emptyRolls=0;
    try{
      const cid=pvpLabOwnId();
      // Na jedno wejście w automat maks. 12 walk (pojemność licznika),
      // BEZ sztucznego ograniczenia liczby walk w ciągu dnia.
      // Co pięć minut weryfikujemy nowe punkty, m.in. po regeneracji.
      for(let attempt=0;attempt<12;attempt++){
        if(!prestigeAuto.enabled || prestigeAuto.characterId!==cid || pvpLabOwnId()!==cid)return;
        if(prestigeAutoBusyElsewhere()){
          prestigeAuto.status='WSTRZYMANO — inny modul wykonuje operacje';return;
        }
        // Przed KAŻDYM POST walki ponownie pytamy serwer o punkty.
        const status=await apiActive(`/api/duels/${cid}/status`);
        const points=prestigeAutoStatusCheck(status);
        if(!points.ready){
          prestigeAuto.status=points.remaining===0?'BRAK PUNKTOW AKCJI — czekam na odnowienie':
            'SERWER NIE POTWIERDZIL MOZLIWOSCI WALKI';return;
        }
        pvpLabIngestDuelStatus(status);
        if(!prestigeAutoCandidates().length || prestigeAuto.rollMethod==='GET'){
          await prestigeAutoMaybeRoll(cid,points);
          if(!prestigeAuto.enabled || prestigeAuto.characterId!==cid || pvpLabOwnId()!==cid)return;
          if(prestigeAuto.lastStatus?.ready===false){
            prestigeAuto.status='BRAK PUNKTOW PO LOSOWANIU — bez ataku';return;
          }
        }
        const candidates=prestigeAutoCandidates();
        const selection=prestigeAutoChoose(candidates),choice=selection.choice;
        if(!choice){
          if(candidates.length && candidates.every(x=>Number(x.expectedGain)<=0)){
            emptyRolls++;
            // Gdy wszyscy oferują 0 prestiżu, próbujemy nową trójkę,
            // maksymalnie 3 razy w tym cyklu, bez 30-minutowej blokady.
            const canReroll=prestigeAuto.rollMethod==='GET' ||
              (prestigeAuto.rollMethod==='POST'&&prestigeAuto.allowAutoRoll&&
               prestigeAuto.rollCalibration?.ownId===cid);
            if(emptyRolls<3 && canReroll){
              prestigeAuto.lastRollAt=0;prestigeAuto.rollCandidates=[];
              prestigeAuto.status='0 PRESTIZU — szukam innej trojki ('+emptyRolls+'/3)';
              prestigeAutoSave();continue;
            }
            prestigeAuto.status='BRAK CELU DAJACEGO PRESTIZ — sprawdze pozniej';return;
          }
          prestigeAuto.status=candidates.length?'BRAK CELU Z DODATNIM PRESTIZEM / ZNANYM LVL':
            (prestigeAuto.rollMethod==='POST'&&!prestigeAuto.allowAutoRoll?
             'LOSOWANIE AUTO WYLACZONE — wlacz je osobno':'BRAK SWIEZEJ LISTY CELOW');
          return;
        }
        emptyRolls=0;
        const call=prestigeAuto.calibration;
        if(!prestigeAuto.enabled || prestigeAuto.characterId!==cid || pvpLabOwnId()!==cid)return;
        const body={...call.base,[call.field]:choice.id};
        prestigeAuto.lastAttackAt=Date.now();
        prestigeAuto.actions.push({at:prestigeAuto.lastAttackAt,targetId:choice.id,origin:'auto',
          status:'wyslano',selectionRule:selection.rule,targetLevel:Number(choice.level)||null,
          expectedGain:Number(choice.expectedGain)||0});
        prestigeAuto.status='ATAKUJE ID '+choice.id+' • +'+choice.expectedGain+' prestizu (prognoza)';
        prestigeAutoSave(); // stan przed POST — nie powtarzaj niepewnego ataku
        const result=await apiActive(`/api/duels/${cid}/fight`,{method:'POST',body});
        if(result?.success===false || typeof result?.won!=='boolean' || !result?.battleId){
          prestigeAutoStop('STOP — serwer nie potwierdzil wyniku (bez ponawiania POST)');return;
        }
        pvpLabObserveApi(`/api/duels/${cid}/fight`,result,{method:'POST',requestBody:body,autoplay:true});
        completed++;
        if(!result.won){prestigeAuto.enabled=false;prestigeAuto.status='PRZEGRANA — AUTO STOP';return;}
        if(result.prestigeChange!=null && Number(result.prestigeChange)===0){
          prestigeAuto.enabled=false;
          prestigeAuto.status='AUTO STOP — wygrana dala 0 prestizu mimo prognozy';return;
        }
        prestigeAuto.status='WYGRANA — '+completed+' walk w tej serii; sprawdzam punkty';
        // prestigeAutoObserve zeruje poprzednią trójkę po walce.
        // Następne okrążenie pobierze świeży status i nowych przeciwników.
      }
      prestigeAuto.status='WYKONANO '+completed+' WALK — sprawdze stan za '+prestigeAuto.checkMinutes+' min';
    }catch(e){
      // Timeout po POST może oznaczać, że atak DOSZEDŁ. Nigdy nie ponawiaj na ślepo.
      prestigeAuto.enabled=false;
      prestigeAuto.status='STOP — BLAD/STATUS NIEPEWNY: '+String(e?.message||e).slice(0,120);
    }finally{
      prestigeAuto.runtimeBusy=false;prestigeAutoSave();try{render();}catch(_){}
    }
  }'''
s=s[:start]+new_cycle+s[end:]
one('''        <div class="sub">Losowanie: ${prestigeAuto.rollMethod||'nieznane'} • schemat POST: ${prestigeAuto.rollCalibration?'poznany':'niepoznany'} • auto losowan dzis: ${prestigeAutoRollsDay()}/12.</div>''','''        <div class="sub">Losowanie: ${prestigeAuto.rollMethod||'nieznane'} • schemat POST: ${prestigeAuto.rollCalibration?'poznany':'niepoznany'} • auto losowan dzis: ${prestigeAutoRollsDay()} (bez limitu dziennego).</div>''','roll UI')
one('''        <div class="sub">${prestigeAuto.enabled?'WŁĄCZONY':'WYŁĄCZONY'} • kontrola co ${prestigeAuto.checkMinutes} min • punkty walki: ${prestigeAuto.lastStatus?.remaining==null?'nieodczytane':prestigeAuto.lastStatus.remaining} • wykonano dziś ${today}/12''','''        <div class="sub">${prestigeAuto.enabled?'WŁĄCZONY':'WYŁĄCZONY'} • kontrola co ${prestigeAuto.checkMinutes} min • punkty walki: ${prestigeAuto.lastStatus?.remaining==null?'nieodczytane':prestigeAuto.lastStatus.remaining} /12 • wykonano dziś ${today}''','fight UI')
start=s.index('        <div class="note">AUTO najpierw wybiera cele z min. 4 wygranymi')
end=s.index('</div>',start)
s=s[:start]+'''        <div class="note">AUTO najpierw wybiera rywala z 4 zwyciestwami bez porazki przy obecnym buildzie, a nastepnie najnizszy LVL z <b>dodatnim przewidywanym zyskiem prestizu</b>. Przy 0 prestizu nie marnuje punktu i szuka nowej trojki (maks. 3 losowania bez celu na cykl). Serwer potwierdza punkty przed kazda walka. 12 to pojemnosc punktow, nie dzienny limit: +4 o 07:00, 12:00 i 17:00. Bez sztucznego cooldownu atakow i losowan. Po przegranej lub niepewnym wyniku STOP.</div>'''+s[end+6:]
one('''        <div class="note">Pierwsze uruchomienie: wykonaj w grze <b>jedną ręczną walkę o prestiż</b>, aby Pomagier potwierdził format wywołania. Jeśli gra losuje cele poprzez POST, losowanie pozostaje ręczne — automat niczego nie kupuje ani nie zużywa na ślepo.</div>''','''        <div class="note">Pierwsze uruchomienie: reczny atak potwierdza format walki; reczne losowanie potwierdza format POST. Aby w pelni automatycznie szukac nowych trojek, wlacz <b>Zezwol na losowanie AUTO</b>. Serwerowe zasady i punkty akcji maja pierwszenstwo.</div>''','intro UI')
one('''      <div class="note">Punkty 12/dzien sa wstepnym zalozeniem, nie potwierdzonym limitem gry. AUTO nie atakuje, jesli serwer nie potwierdza pozostalych punktow lub mozliwosci ataku. Gdy lista celow jest losowana przez POST, wymagane osobne zezwolenie — operacja moze miec koszt. Nie ma gwarantowanych wygranych.</div>''','''      <div class="note">Z instrukcji gry: 1 pojedynek = 1 punkt, maks. stan 12, odnowienie +4 o 07:00, 12:00, 17:00. Losowanie trzech celow nie ma osobnej wskazanej oplaty; w razie spadku punktow po losowaniu AUTO sie zatrzyma. Wygrana i dodatni prestiz nie sa gwarantowane.</div>''','points UI')
one('''      checkMinutes:prestigeAuto.checkMinutes,lastStatus:prestigeAuto.lastStatus,rollsToday:prestigeAutoRollsDay(),''','''      checkMinutes:prestigeAuto.checkMinutes,lastStatus:prestigeAuto.lastStatus,rollsToday:prestigeAutoRollsDay(),
      noOwnDailyCap:true,maxBattlesPerCycle:12,maxNoGainRerollsPerCycle:3,''','export schema')
p.write_text(s,encoding='utf8')
g=root/'app/build.gradle.kts';z=g.read_text(encoding='utf8')
if z.count('versionCode = 10070')!=1 or z.count('versionName = "1.0.70"')!=1:
    raise SystemExit('v1071 requires Android 1.0.70')
g.write_text(z.replace('versionCode = 10070','versionCode = 10071',1).replace('versionName = "1.0.70"','versionName = "1.0.71"',1),encoding='utf8')
r=root/'README.md'
if r.exists():
    r.write_text(r.read_text(encoding='utf8')+'''\n\n## v1.0.71 / userscript 8.8.78\n- W Prestiż AUTO zniesiono sztuczny limit 12 walk/dzien (12 to pojemnosc punktow), a takze limit losowan POST i 30-minutowy odstep.\n- Automat sprawdza dostepne punkty PRZED KAZDA walka i po losowaniu POST, odnawia dzialanie po regeneracji serwera.\n- Seria do 12 potwierdzonych walk w jednym cyklu; po kazdej wygranej swieze losowanie trzech celow.\n- Priorytet historii 4+ wygrane, nastepnie najnizszy LVL, ale tylko dla celow dajacych dodatni predicted prestige.\n- Gdy 3 kolejne losowania daja +0, czeka do nastepnego cyklu zamiast marnowac punkt.\n- Niepewny wynik, przegrana, koszt losowania lub niezgodnosc punktow => STOP. Osobny opt-in na POST-losowanie pozostaje wymagany.\n''',encoding='utf8')
print('OK v1.0.71 / userscript 8.8.78')