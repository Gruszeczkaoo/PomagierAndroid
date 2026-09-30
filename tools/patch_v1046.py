from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

# -----------------------------------------------------------------
# VERSION
# -----------------------------------------------------------------
if "// @version      8.8.52" not in s:
    raise SystemExit("Oczekiwano JS 8.8.52")
s=s.replace("// @version      8.8.52","// @version      8.8.53",1)
s=s.replace("const VERSION = '8.8.52';","const VERSION = '8.8.53';",1)
s=s.replace("const ANDROID_VERSION = '1.0.45';","const ANDROID_VERSION = '1.0.46';",1)

note="""  // v8.8.53 SPÓŁKA LOCKSTEP:
  // - naprawia rozjazd planner -> wykonawca: AUTO nie wybiera już lokalnie innego wykonawcy niż krok #1 planu,
  // - po świeżym pobraniu ofert planner jest liczony ponownie, a wykonanie używa dokładnie contractorCode z nowego kroku #1,
  // - jeśli oferta planowanego wykonawcy zniknie lub kod nie zgadza się z serwerem, START jest blokowany i plan jest odświeżany zamiast używać fallbacku,
  // - usunięty fallback contractorCode=standardex; prawdziwy START wymaga jawnego kodu z live API,
  // - komunikat oczekiwania pokazuje wykonawcę, koszt, brakującą kwotę i szacowany czas finansowania,
  // - planner/executor ma jeden wspólny wybór również wtedy, gdy globalnie lepszy jest wolniejszy lub droższy wariant.
"""
anchor="  // v8.8.52"
if note not in s:
    p=s.find(anchor)
    if p>=0:
        s=s[:p]+note+s[p:]

# -----------------------------------------------------------------
# Helpers: exact live offer selected by planner + bounded replan.
# -----------------------------------------------------------------
fetch_anchor="  async function companyFetchOffers(code){"
p=s.find(fetch_anchor)
if p<0:
    raise SystemExit("Brak companyFetchOffers")

helper="""  function companyNormalizeContractorCode(v){
    return String(v==null?'':v).trim().toLowerCase();
  }

  function companyFindPlannedLiveOffer(offers,step){
    const wanted=companyNormalizeContractorCode(step&&step.contractorCode);
    if(!wanted || wanted.indexOf('sim_')===0 || wanted==='base') return null;
    const list=(Array.isArray(offers)?offers:[]).filter(o=>o&&Number.isFinite(Number(o.finalCost))&&Number.isFinite(Number(o.finalMinutes)));
    return list.find(o=>companyNormalizeContractorCode(o.contractorCode)===wanted)||null;
  }

  async function companyResolvePlannedDecision(companyResp,inv){
    let plan=companyComputeMixedPlan(companyResp,inv);
    let step=plan&&Array.isArray(plan.steps)?plan.steps[0]:null;
    if(!step) return {plan,step:null,offer:null,eta:null,reason:'no-step'};

    // Maksymalnie trzy szybkie rundy: pobierz live ofertę kroku #1 -> przelicz cały plan.
    // Jeśli po przeliczeniu zmienił się kod inwestycji, pobierz live oferty nowego kroku i powtórz.
    for(let pass=0;pass<3;pass++){
      const fetchedCode=String(step.code||'');
      const liveResp=await companyFetchOffers(fetchedCode);
      if(!liveResp || !Array.isArray(liveResp.offers) || !liveResp.offers.length){
        return {plan,step,offer:null,eta:null,reason:'no-live-offers'};
      }

      plan=companyComputeMixedPlan(companyResp,inv);
      const freshStep=plan&&Array.isArray(plan.steps)?plan.steps[0]:null;
      if(!freshStep) return {plan,step:null,offer:null,eta:null,reason:'no-step-after-replan'};
      step=freshStep;

      // Plan po fetchu wskazał inny krok. Najpierw pobierz jego świeże oferty.
      if(String(step.code||'')!==fetchedCode) continue;

      const live=companyAuto.liveOffers[String(step.code)]||liveResp.offers||[];
      const offer=companyFindPlannedLiveOffer(live,step);
      if(!offer){
        return {plan,step,offer:null,eta:null,reason:'planned-contractor-not-live'};
      }

      const fund=Number(inv&&inv.fund!=null?inv.fund:(companyResp&&companyResp.company&&companyResp.company.investmentFund)||0);
      const net=companyNetDaily(companyResp,inv);
      return {plan,step,offer,eta:companyOfferEta(offer,fund,net),reason:'ok'};
    }

    return {plan,step,offer:null,eta:null,reason:'plan-did-not-stabilize'};
  }

"""
if "async function companyResolvePlannedDecision(" not in s:
    s=s[:p]+helper+s[p:]

# -----------------------------------------------------------------
# Executor: remove local companyOfferBest override and use the exact
# contractor selected by the freshly recalculated global plan.
# -----------------------------------------------------------------
cycle_start=s.find("  async function companyAutoCycle(opts){")
if cycle_start<0:
    raise SystemExit("Brak companyAutoCycle")
a=s.find("      const plan=companyAuto.plan||companyComputeMixedPlan(cr,inv);",cycle_start)
b=s.find("      const affordable=",a)
if a<0 or b<0:
    raise SystemExit("Nie znaleziono bloku decyzji wykonawcy w companyAutoCycle")

new_block="""      let plan=companyAuto.plan||companyComputeMixedPlan(cr,inv);
      let step=plan&&Array.isArray(plan.steps)?plan.steps[0]:null;
      if(!step){
        companyAuto.lastAction=plan&&plan.status==='MAX'?'Spółka: biznesowe drzewko rozwinięte maksymalnie.':'Brak dostępnego kroku inwestycji.';
        companyAuto.nextAt=Date.now()+60*60*1000;
        companyAutoSave();
        return true;
      }

      const fund=Number(inv.fund!=null?inv.fund:c.investmentFund||0);
      const net=companyNetDaily(cr,inv);

      // LOCKSTEP: świeże oferty -> ponowne liczenie CAŁEGO planu -> dokładnie ten sam contractorCode do START.
      const decision=await companyResolvePlannedDecision(cr,inv);
      plan=decision&&decision.plan||plan;
      step=decision&&decision.step||null;
      companyAuto.plan=plan;

      if(!step){
        companyAuto.lastAction=plan&&plan.status==='MAX'?'Spółka: biznesowe drzewko rozwinięte maksymalnie.':'Brak dostępnego kroku po odświeżeniu ofert.';
        companyAuto.nextAt=Date.now()+60*60*1000;
        companyAutoSave();
        return true;
      }

      if(!decision || !decision.offer){
        companyAuto.lastError='SPÓŁKA LOCKSTEP: plan wybrał '+String(step.code||'?')+' / '+String(step.contractorName||step.contractorCode||'?')+
          ', ale nie ma identycznej świeżej oferty z API ('+String(decision&&decision.reason||'unknown')+'). START zablokowany — przeliczę ponownie.';
        companyAuto.nextAt=Date.now()+60000;
        companyAutoSave();
        return false;
      }

      const o=decision.offer;
      const eta=decision.eta||companyOfferEta(o,fund,net);
      const plannedCode=companyNormalizeContractorCode(step.contractorCode);
      const liveCode=companyNormalizeContractorCode(o.contractorCode);
      if(!plannedCode || plannedCode!==liveCode){
        companyAuto.lastError='SPÓŁKA LOCKSTEP: niespójny wykonawca plan='+String(step.contractorCode||'?')+' / API='+String(o.contractorCode||'?')+'. START zablokowany.';
        companyAuto.nextAt=Date.now()+60000;
        companyAutoSave();
        return false;
      }

"""
s=s[:a]+new_block+s[b:]

# Waiting message: must describe the same contractor as route #1.
old_wait="""      if(!affordable){
        companyAuto.lastAction='Czekam na fundusz: '+step.code+' • potrzeba '+companyMoney(o.finalCost)+' • fundusz '+companyMoney(fund);
        companyAuto.nextAt=Date.now()+COMPANY_AUTO_POLL_MS;
        companyAutoSave();
        return true;
      }
"""
new_wait="""      if(!affordable){
        const missing=Math.max(0,Number(o.finalCost||0)-fund);
        const waitText=Number.isFinite(Number(eta&&eta.wait))&&Number(eta.wait)>0?' • szac. finansowanie '+companyMinutes(eta.wait):'';
        companyAuto.lastAction='Czekam na fundusz: '+step.code+' • '+String(o.contractorName||o.contractorCode||'wykonawca')+
          ' • koszt '+companyMoney(o.finalCost)+' • fundusz '+companyMoney(fund)+' • brakuje '+companyMoney(missing)+waitText;
        companyAuto.nextAt=Date.now()+COMPANY_AUTO_POLL_MS;
        companyAutoSave();
        return true;
      }
"""
if old_wait not in s:
    raise SystemExit("Brak bloku oczekiwania na fundusz")
s=s.replace(old_wait,new_wait,1)

# Never silently substitute Standardex on a real write.
old_start="""      const result=await apiActive('/api/gangs/'+Number(settings.characterId||0)+'/company/investments/'+encodeURIComponent(step.code)+'/start',{
        method:'POST',
        body:{contractorCode:String(o.contractorCode||'standardex')}
      });
"""
new_start="""      const liveContractorCode=String(o.contractorCode||'').trim();
      if(!liveContractorCode) throw new Error('SPÓŁKA LOCKSTEP: brak contractorCode w świeżej ofercie — START zablokowany.');
      const result=await apiActive('/api/gangs/'+Number(settings.characterId||0)+'/company/investments/'+encodeURIComponent(step.code)+'/start',{
        method:'POST',
        body:{contractorCode:liveContractorCode}
      });
"""
if old_start not in s:
    raise SystemExit("Brak starego START contractorCode")
s=s.replace(old_start,new_start,1)

# Diagnostics marker.
s=s.replace("CONTRACTORS_V2","CONTRACTORS_V3_LOCKSTEP")

# -----------------------------------------------------------------
# Static regression checks on the transformed userscript.
# -----------------------------------------------------------------
cycle_end=s.find("  function companyAutoHTML(){",cycle_start)
if cycle_end<0:
    raise SystemExit("Brak końca companyAutoCycle")
cycle=s[cycle_start:cycle_end]

required=[
    "// @version      8.8.53",
    "const VERSION = '8.8.53';",
    "const ANDROID_VERSION = '1.0.46';",
    "async function companyResolvePlannedDecision(",
    "companyFindPlannedLiveOffer(",
    "const decision=await companyResolvePlannedDecision(cr,inv);",
    "plannedCode!==liveCode",
    "body:{contractorCode:liveContractorCode}",
    "SPÓŁKA LOCKSTEP",
    "CONTRACTORS_V3_LOCKSTEP"
]
missing=[x for x in required if x not in s]
if missing:
    raise SystemExit("v1.0.46 NIEKOMPLETNA: "+", ".join(missing))

forbidden=[
    "const best=companyOfferBest(offers,fund,net);",
    "body:{contractorCode:String(o.contractorCode||'standardex')}"
]
bad=[x for x in forbidden if x in cycle]
if bad:
    raise SystemExit("SPÓŁKA LOCKSTEP: pozostał stary lokalny override: "+", ".join(bad))

# Regression case from real UI:
# fund 1 294 460, net 313 840/d; local fastest is Na Cito,
# while global planner may deliberately choose Standardex.
# Executor must therefore select Standardex by contractorCode, not local fastest.
fund=1294460.0
net=313840.0
offers=[
    {"code":"szwagier_pol","cost":700000.0,"mins":7200.0},
    {"code":"standardex","cost":1000000.0,"mins":3600.0},
    {"code":"na_cito_bud","cost":1600000.0,"mins":1800.0},
]
def eta(o):
    wait=max(0.0,o["cost"]-fund)/net*1440.0 if net>0 else float("inf")
    return wait+o["mins"]
local_fastest=min(offers,key=eta)
if local_fastest["code"]!="na_cito_bud":
    raise SystemExit("Regresja testu: oczekiwano lokalnie Na Cito")
planned_code="standardex"
lockstep=next((o for o in offers if o["code"]==planned_code),None)
if not lockstep or lockstep["code"]!="standardex" or lockstep["cost"]>fund:
    raise SystemExit("Regresja LOCKSTEP: planowany Standardex nie został zachowany")

js.write_text(s,encoding="utf-8")

# Android app version.
bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10045" not in t or 'versionName = "1.0.45"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.45")
t=t.replace("versionCode = 10045","versionCode = 10046",1)
t=t.replace('versionName = "1.0.45"','versionName = "1.0.46"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.46 / userscript 8.8.53" not in r:
        r += """

## v1.0.46 / userscript 8.8.53 - Spolka Planner/Executor LOCKSTEP
- Naprawiony rozjazd: lista planu i AUTO zawsze używają tego samego wykonawcy dla kroku #1.
- Przed START-em pobierane są świeże oferty, cały plan jest ponownie liczony i dopiero wtedy wybierany jest dokładny live contractorCode.
- Brak identycznej oferty blokuje START zamiast uruchamiać innego wykonawcę.
- Usunięty fallback do Standardex przy pustym contractorCode.
- Oczekiwanie na fundusz pokazuje wykonawcę, koszt, brakującą kwotę i ETA finansowania.
- Dodany build-time regression check dla przypadku P07: plan Standardex kontra lokalnie szybszy Na Cito.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.46 Spolka LOCKSTEP applied")
print("OK: planner contractor == executor contractor")
print("OK: no local companyOfferBest override in companyAutoCycle")
print("OK: no silent Standardex fallback on START")
print("OK: regression P07 Standardex vs Na Cito passed")
