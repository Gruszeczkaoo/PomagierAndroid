from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

s=s.replace("// @version      8.8.41","// @version      8.8.42",1)
s=s.replace("const VERSION = '8.8.41';","const VERSION = '8.8.42';",1)
s=s.replace("const ANDROID_VERSION = '1.0.34';","const ANDROID_VERSION = '1.0.35';",1)

anchor="  // v8.8.41"
note="""  // v8.8.42 GLOBAL AUTO — LIMIT BAZARU = CZEKAJ, NIE STOP:
  // - dzienny limit zakupów nie może wyłączyć głównego Pomagiera,
  // - przy limicie etap przechodzi w CZEKA: LIMIT BAZARU zamiast BŁĄD/STOP,
  // - użytkownik może kupić brakujący przedmiot ręcznie; kolejny cykl wykryje stan i sam wznowi pracę,
  // - limity zwrócone przez API również są traktowane jako oczekiwanie, nie błąd fatalny,
  // - półautomat demontażu również nie wyłącza się przy limicie — pozostaje w oczekiwaniu.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

old="""  function purchaseRemaining() {
    const p = state.purchaseLimit;
    return p?.purchasesRemaining == null ? null : Number(p.purchasesRemaining);
  }
"""
new="""  function purchaseRemaining() {
    const p = state.purchaseLimit;
    return p?.purchasesRemaining == null ? null : Number(p.purchasesRemaining);
  }
  function autoIsBazaarDailyLimit(msg){
    const x=String(msg||'').toLowerCase();
    return (x.includes('limit') && (x.includes('zakup')||x.includes('purchase')||x.includes('bazar')))
      || x.includes('dzienny limit')
      || x.includes('daily purchase');
  }
"""
if old not in s: raise SystemExit("Nie znaleziono purchaseRemaining")
s=s.replace(old,new,1)

old="""      const rem=purchaseRemaining();
      if(rem!=null && rem<=0){
        semiStop('Koniec dziennego limitu zakupów na bazarze.');
        return;
      }
"""
new="""      const rem=purchaseRemaining();
      if(rem!=null && rem<=0){
        semi.lastAction='Limit zakupów bazaru — czekam. Kup brak ręcznie; Pomagier nie zostanie zatrzymany.';
        state.manual.lastMessage=semi.lastAction;
        semi.nextAt=Date.now()+10000;
        return;
      }
"""
if old not in s: raise SystemExit("Nie znaleziono limitu półautomatu")
s=s.replace(old,new,1)

s=s.replace("return {ok:false,reason:'limit zakupów wyczerpany'};","return {ok:false,waitManual:true,reason:'limit zakupów wyczerpany'};")

# Obsługa GLOBAL: ZAKUP -> DEMONTAŻ.
anchor_buy="          const res=await buyBundleItemOne(target,nextItem,cycleSpent);"
p=s.find(anchor_buy)
if p<0: raise SystemExit("Nie znaleziono buyBundleItemOne w autoTick")
a=s.find("          if(!res.ok){",p)
b=s.find("\n\n          cycleSpent+=",a)
if a<0 or b<0: raise SystemExit("Nie znaleziono bloku obsługi buyBundleItemOne")
replacement="""          if(!res.ok){
            if(res.waitManual || autoIsBazaarDailyLimit(res.reason)){
              state.auto.error=null;
              state.auto.stage='CZEKA: LIMIT BAZARU';
              state.auto.stageDetail='Kup ręcznie: '+String(nextItem?.name||'wymagany przedmiot')+'. Pomagier sprawdzi stan w następnym cyklu i sam wznowi.';
              autoLogMsg('info','LIMIT BAZARU: czekam na ręczny zakup '+String(nextItem?.name||'wymaganego przedmiotu')+' — Pomagier pozostaje włączony.');
            }else if(res.reason){
              autoLogMsg('info','Czekam: '+String(res.reason)+'.');
              registerRecipePurchaseStall(target,res.reason);
            }
            return;
          }"""
s=s[:a]+replacement+s[b:]

# Obsługa brakującego specyficznego składnika.
anchor_extra="        const res=await buyExtraIngredientOne(target,missingExtra,cycleSpent);"
p=s.find(anchor_extra)
if p<0: raise SystemExit("Nie znaleziono buyExtraIngredientOne w autoTick")
a=s.find("        if(res.ok){",p)
b=s.find("\n        return;",a)
if a<0 or b<0: raise SystemExit("Nie znaleziono bloku obsługi buyExtraIngredientOne")
replacement="""        if(res.ok){
          cycleSpent+=Number(res.spent||0);
        }else if(res.waitManual || autoIsBazaarDailyLimit(res.reason)){
          state.auto.error=null;
          state.auto.stage='CZEKA: LIMIT BAZARU';
          state.auto.stageDetail='Kup ręcznie: '+String(missingExtra.name||'brakujący składnik')+'. Gdy przedmiot pojawi się w ekwipunku, Pomagier sam wznowi.';
          autoLogMsg('info','LIMIT BAZARU: czekam na ręczny zakup '+String(missingExtra.name||'składnika')+' — Pomagier pozostaje włączony.');
        }else if(res.reason){
          autoLogMsg('info','Czekam: '+String(res.reason)+'.');
          registerRecipePurchaseStall(target,res.reason);
        }"""
s=s[:a]+replacement+s[b:]

# Limit zwrócony bezpośrednio przez API nie może wejść w fatal.
needle="      const nullRecipeError=/Cannot read properties of null"
p=s.find(needle)
if p<0: raise SystemExit("Nie znaleziono catch autopilota")
s=s[:p]+"      const bazaarLimitError=autoIsBazaarDailyLimit(msg);\n"+s[p:]
old_if="      if(nullRecipeError){"
new_if="""      if(bazaarLimitError){
        state.auto.error=null;
        state.auto.stage='CZEKA: LIMIT BAZARU';
        state.auto.stageDetail='Dzienny limit zakupów wyczerpany. Kup brakujący przedmiot ręcznie — Pomagier sam wznowi po wykryciu zmiany.';
        state.auto.quickRetryAt=Date.now()+10000;
        autoLogMsg('warn','LIMIT BAZARU: nie zatrzymuję Pomagiera — czekam na ręczne uzupełnienie.');
      }else if(nullRecipeError){"""
q=s.find(old_if,p)
if q<0: raise SystemExit("Nie znaleziono if nullRecipeError")
s=s[:q]+new_if+s[q+len(old_if):]

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
t=t.replace("versionCode = 10034","versionCode = 10035")
t=t.replace('versionName = "1.0.34"','versionName = "1.0.35"')
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.35 / userscript 8.8.42" not in r:
        r += """

## v1.0.35 / userscript 8.8.42
- Dzienny limit bazaru nie wyłącza głównego Pomagiera.
- Główny automat przechodzi w CZEKA: LIMIT BAZARU i czeka na ręczne uzupełnienie brakującego przedmiotu.
- Po ręcznym zakupie następny cykl wykrywa stan i automatycznie wznawia pracę.
- Błąd limitu zwrócony przez API nie jest już traktowany jako fatalny.
- Półautomat demontażu również pozostaje w oczekiwaniu zamiast się zatrzymywać.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.35 patch applied")
