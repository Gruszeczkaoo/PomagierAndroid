from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
if not js.exists():
    raise SystemExit('Brak userscriptu')
s=js.read_text(encoding='utf-8')

if '// @version      8.8.59' not in s:
    raise SystemExit('Oczekiwano JS 8.8.59')
s=s.replace('// @version      8.8.59','// @version      8.8.60',1)
s=s.replace("const VERSION = '8.8.59';","const VERSION = '8.8.60';",1)
s=s.replace("const ANDROID_VERSION = '1.0.52';","const ANDROID_VERSION = '1.0.53';",1)

note="""  // v8.8.60 NO EMERGENCY AUTO-SALE:
  // - wylaczona automatyczna sprzedaz uruchamiana TYLKO po to, aby zwolnic miejsce w pelnym plecaku,
  // - pelny plecak nie wystawia juz produktu z saleQueue ani przypadkowego bezpiecznego przedmiotu na bazar,
  // - priorytet zwalniania miejsca: rupieciarnia -> bezpieczny demontaz (jesli wlaczony) -> czekanie/blokada akcji,
  // - zwykla Automatyczna sprzedaz gotowych produktow nadal dziala normalnie w standardowym cyklu,
  // - odbior gotowego craftu przy 0 wolnych slotow czeka na Guardiana zamiast wymuszac sprzedaz.
"""
anchor='  // v8.8.59'
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]


def func_bounds(text,name):
    m=re.search(r'^  (?:async )?function '+re.escape(name)+r'\(',text,re.M)
    if not m:
        raise SystemExit('Brak funkcji '+name)
    n=re.search(r'^  (?:async )?function [A-Za-z0-9_]+\(',text[m.end():],re.M)
    return m.start(), (m.end()+n.start()) if n else len(text)

# 1) Emergency inventory relief: zero sprzedaży. Melina -> demontaż -> czekanie.
a,b=func_bounds(s,'localAiEmergencyReliefWhenMelinaFull')
old=s[a:b]
new=r'''  async function localAiEmergencyReliefWhenMelinaFull({reason='akcja',targetSlots=null}={}){
    let inv=await localAiFreshInventory();
    const target=Number.isFinite(Number(targetSlots))
      ? Math.max(0,Number(targetSlots))
      : Math.max(0,Number(inv.capacity||0)-1);

    if(Number(inv.slotsUsed||0)<=target){
      return {ok:true,inventory:inv,listed:0,dismantled:0,emergencySaleDisabled:true};
    }

    // Zawsze najpierw swiezo sprawdzamy rupieciarnie.
    // Jesli zwolnil sie choc jeden slot, wracamy do MELINA-FIRST.
    let storage=await localAiFreshMelina();
    if(Number(storage.slotsUsed||0)<Number(storage.capacity||0)){
      await localAiStoreBackpackToMelina({reason:`${reason}: pojawilo sie miejsce`});
      inv=await localAiFreshInventory();
      storage=await localAiFreshMelina();
      if(Number(inv.slotsUsed||0)<=target){
        return {ok:true,inventory:inv,storage,listed:0,dismantled:0,emergencySaleDisabled:true};
      }
      if(Number(storage.slotsUsed||0)<Number(storage.capacity||0)){
        return {
          ok:false,inventory:inv,storage,listed:0,dismantled:0,emergencySaleDisabled:true,
          reason:'rupieciarnia ma wolne miejsce - nie uruchamiam destrukcyjnego fallbacku'
        };
      }
    }

    // v8.8.60: NIGDY nie sprzedajemy automatycznie tylko dlatego, ze plecak jest pelny.
    // Usuniete sa oba dawne fallbacki bazarowe:
    // - sellOneBackpackProfitItemForSpace()
    // - sellOneSafeBackpackItemForSpace()
    // Normalna sprzedaz pipeline pozostaje w standardowym cyklu Pomagiera.
    let dismantled=0;

    if(Number(inv.slotsUsed||0)>target){
      storage=await localAiFreshMelina();
      if(Number(storage.slotsUsed||0)>=Number(storage.capacity||0)){
        const relief=await localAiRelieveBackpackByDismantle({
          reason:`${reason}: rupieciarnia pelna`,
          targetSlots:target
        });
        inv=relief.inventory||inv;
        dismantled=Number(relief.moved||0);

        state.localAI.inventoryGuardian.melinaLastAction=
          `Plecak pelny - sprzedaz awaryjna OFF • demontaz ${dismantled} • plecak ${Number(inv.slotsUsed||0)}/${Number(inv.capacity||0)}`;
        localAiSavePersistent();

        return {
          ok:Number(inv.slotsUsed||0)<=target,
          inventory:inv,
          storage,
          listed:0,
          dismantled,
          emergencySaleDisabled:true,
          reason:relief.reason||(
            Number(inv.slotsUsed||0)>target
              ? 'plecak nadal pelny - sprzedaż awaryjna jest wylaczona'
              : ''
          )
        };
      }
    }

    state.localAI.inventoryGuardian.melinaLastAction=
      `Plecak pelny - sprzedaz awaryjna OFF • plecak ${Number(inv.slotsUsed||0)}/${Number(inv.capacity||0)}`;
    localAiSavePersistent();

    return {
      ok:Number(inv.slotsUsed||0)<=target,
      inventory:inv,
      storage,
      listed:0,
      dismantled,
      emergencySaleDisabled:true,
      reason:Number(inv.slotsUsed||0)>target
        ? 'brak miejsca - automatyczna sprzedaz za pelny plecak jest wylaczona'
        : ''
    };
  }'''
s=s[:a]+new+'\n\n'+s[b:]

# 2) Odbior craftu: usuwamy specjalna sprzedaz wywolywana przez 0 wolnych slotow.
a,b=func_bounds(s,'collectOneFinishedProfitJob')
seg=s[a:b]
pattern=re.compile(r'''\n\s*// Gotowy craft również zajmuje miejsce w plecaku\.\n\s*// Jeśli plecak jest ciasny, najpierw próbujemy wystawić produkt\n\s*// już czekający w saleQueue — to zwalnia slot bez chowania towaru\.\n\s*if\(autoCfg\.localAiInventoryGuardian\)\{\n\s*let invState=null;\n\s*try\{ invState=await localAiFreshInventory\(\); \}catch\{\}\n\n\s*const freeSlots=invState\n\s*\? Math\.max\(0,Number\(invState\.capacity\|\|0\)-Number\(invState\.slotsUsed\|\|0\)\)\n\s*: null;\n\n\s*if\(freeSlots!=null && freeSlots<1 && autoCfg\.autoSell && saleQueue\.length\)\{\n\s*state\.auto\.stage='MIEJSCE NA ODBIÓR';\n\s*state\.auto\.stageDetail=`Brak miejsca na \$\{job\.name\} — najpierw próbuję wystawić gotowy produkt`;\n\n\s*if\(await sellOneProfitItem\(\)\)\{\n\s*return true;\n\s*\}\n\s*\}\n''',re.M)
m=pattern.search(seg)
if not m:
    raise SystemExit('Nie znaleziono starego fallbacku sprzedazy przed odbiorem craftu')
replacement="""
    // v8.8.60: pelny plecak NIE uruchamia juz automatycznej sprzedazy.
    // Guardian moze uzyc rupieciarni lub bezpiecznego demontazu; jesli nadal
    // nie ma miejsca, odbior craftu po prostu czeka.
    if(autoCfg.localAiInventoryGuardian){
"""
seg=seg[:m.start()]+replacement+seg[m.end():]
# Mamy teraz podwojne 'if(autoCfg.localAiInventoryGuardian){' bo pattern konczyl sie po fallbacku,
# a w oryginale dalek byl guard wewnatrz tego samego if. Sprawdzamy i naprawiamy tylko ten fragment.
seg=seg.replace("    if(autoCfg.localAiInventoryGuardian){\n\n      const bag=await localAiGuardInventory({",
                "    if(autoCfg.localAiInventoryGuardian){\n      const bag=await localAiGuardInventory({",1)
s=s[:a]+seg+s[b:]

# 3) Status Guardiana ma jasno mowic, ze listed=0 z definicji.
a,b=func_bounds(s,'localAiGuardInventory')
seg=s[a:b]
seg=seg.replace("${relief?` • sprzedaż ${Number(relief.listed||0)} • demontaż ${Number(relief.dismantled||0)}`:''}",
                "${relief?` • sprzedaż awaryjna OFF • demontaż ${Number(relief.dismantled||0)}`:''}",1)
s=s[:a]+seg+s[b:]

# 4) Twarde testy regresji: emergency path bez bazaru, normalny autoSell nadal obecny.
ea,eb=func_bounds(s,'localAiEmergencyReliefWhenMelinaFull')
em=s[ea:eb]
if re.search(r'await\s+sellOneBackpackProfitItemForSpace\s*\(', em):
    raise SystemExit('REGRESJA: emergency relief nadal sprzedaje produkt pipeline')
if re.search(r'await\s+sellOneSafeBackpackItemForSpace\s*\(', em):
    raise SystemExit('REGRESJA: emergency relief nadal sprzedaje losowy bezpieczny przedmiot')
if '/api/bazaar/' in em and '/list' in em:
    raise SystemExit('REGRESJA: emergency relief nadal ma zapis do bazaru')
if 'listed:0' not in em or 'emergencySaleDisabled:true' not in em:
    raise SystemExit('REGRESJA: brak jawnego emergencySaleDisabled')

ca,cb=func_bounds(s,'collectOneFinishedProfitJob')
collect=s[ca:cb]
if 'freeSlots<1 && autoCfg.autoSell' in collect:
    raise SystemExit('REGRESJA: odbior craftu nadal sprzedaje przy 0 slotow')
if "const bag=await localAiGuardInventory({" not in collect:
    raise SystemExit('REGRESJA: odbior craftu nie korzysta juz z Guardiana')

# Normalna sprzedaz ma zostac.
if s.count('if(await sellOneProfitItem()) return;') < 1:
    raise SystemExit('REGRESJA: usunieto normalna automatyczna sprzedaz pipeline')
if 'async function sellOneProfitItem()' not in s:
    raise SystemExit('REGRESJA: brak normalnej funkcji sprzedazy')

checks=[
    '// @version      8.8.60',
    "const ANDROID_VERSION = '1.0.53';",
    'Plecak pelny - sprzedaz awaryjna OFF',
    'emergencySaleDisabled:true',
    'sprzedaż awaryjna OFF',
]
for x in checks:
    if x not in s:
        raise SystemExit('v1.0.53 NIEKOMPLETNA: '+x)

js.write_text(s,encoding='utf-8')

bg=root/'app/build.gradle.kts'
t=bg.read_text(encoding='utf-8')
if 'versionCode = 10052' not in t or 'versionName = "1.0.52"' not in t:
    raise SystemExit('Oczekiwano Android 1.0.52')
t=t.replace('versionCode = 10052','versionCode = 10053',1)
t=t.replace('versionName = "1.0.52"','versionName = "1.0.53"',1)
bg.write_text(t,encoding='utf-8')

readme=root/'README.md'
if readme.exists():
    r=readme.read_text(encoding='utf-8')
    if '## v1.0.53 / userscript 8.8.60' not in r:
        r += """

## v1.0.53 / userscript 8.8.60 - No emergency auto-sale
- Pelny plecak nie uruchamia juz automatycznej sprzedazy tylko po to, aby zwolnic slot.
- Usuniete fallbacki: sprzedaz produktu z saleQueue i sprzedaz najtanszego bezpiecznego przedmiotu.
- Priorytet przy pelnym plecaku: rupieciarnia -> bezpieczny demontaz (jesli wlaczony) -> czekanie/blokada akcji.
- Normalna automatyczna sprzedaz gotowych produktow nadal dziala w standardowym cyklu.
- Odbior gotowego craftu przy 0 wolnych slotow nie wymusza sprzedazy; czeka na Guardiana.
"""
    readme.write_text(r,encoding='utf-8')

print('v1.0.53 applied')
print('OK: emergency inventory sale disabled')
print('OK: full-bag craft collection no longer forces sale')
print('OK: normal pipeline auto-sell preserved')
