from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pomagier.user.js")

s = js.read_text(encoding="utf-8")

s = s.replace("// @version      8.8.35", "// @version      8.8.36", 1)
s = s.replace("const VERSION = '8.8.35';", "const VERSION = '8.8.36';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.28';", "const ANDROID_VERSION = '1.0.29';", 1)

anchor = "  // v8.8.35"
note = """  // v8.8.36 SPÓŁKA — PEŁNA SYMULACJA WYKONAWCÓW:
  // - planner zna stałe zasady wykonawców również dla przyszłych, jeszcze zablokowanych inwestycji:
  //   Szwagier POL = 30% taniej / 2x dłużej, Standardex = koszt i czas bazowy,
  //   Na Cito Bud = 60% drożej / 2x szybciej,
  // - dla każdego przyszłego kroku symuluje wszystkie 3 warianty zamiast używać tylko ceny/czasu bazowego,
  // - wybór wykonawcy jest częścią całej mieszanej ścieżki, a nie lokalną decyzją tylko dla jednego kroku,
  // - planner zachowuje kilka niedominowanych stanów czasu/funduszu dla tej samej grupy ukończonych inwestycji,
  //   dzięki czemu tańszy-wolniejszy wariant może wygrać globalnie, jeśli przyspiesza finansowanie dalszych kroków,
  // - przed prawdziwym START-em nadal pobiera świeże oferty z API i używa realnego contractorCode.
"""
if note not in s:
    p = s.find(anchor)
    if p >= 0:
        s = s[:p] + note + s[p:]

# Większy beam po dodaniu 3 wariantów wykonawcy na każdy węzeł.
s = s.replace("  const COMPANY_AUTO_BEAM=140;", "  const COMPANY_AUTO_BEAM=420;", 1)

# Dodaj model wykonawców po companyNetDaily.
anchor2 = """  function companyNetDaily(companyResp,investments,incomeOverride){
    const c=companyResp&&companyResp.company||{};
    const income=Number(incomeOverride!=null?incomeOverride:(investments&&investments.dailyIncome!=null?investments.dailyIncome:c.dailyIncome)||0);
    const payroll=Number(c.totalSalaries||0);
    return Math.max(0,income-payroll);
  }
"""
if anchor2 not in s:
    raise SystemExit("Nie znaleziono companyNetDaily")

model = r"""  const COMPANY_CONTRACTOR_MODELS=[
    {contractorCode:'sim_szwagier_pol',contractorName:'Szwagier POL',costMult:0.70,timeMult:2.00},
    {contractorCode:'sim_standardex',contractorName:'Standardex',costMult:1.00,timeMult:1.00},
    {contractorCode:'sim_na_cito_bud',contractorName:'Na Cito Bud',costMult:1.60,timeMult:0.50}
  ];
  function companySimulatedOffers(node){
    const baseCost=Math.max(0,Number(node&&node.baseCost||0));
    const baseMinutes=Math.max(1,Number(node&&node.baseMinutes||1));
    return COMPANY_CONTRACTOR_MODELS.map(m=>({
      contractorCode:m.contractorCode,
      contractorName:m.contractorName,
      finalCost:Math.max(0,Math.round(baseCost*m.costMult)),
      finalMinutes:Math.max(1,Math.round(baseMinutes*m.timeMult)),
      live:false,
      simulated:true,
      costMult:m.costMult,
      timeMult:m.timeMult
    }));
  }
  function companyLiveOffersForPlanner(node){
    const arr=companyAuto.liveOffers[String(node&&node.code||'')];
    if(!Array.isArray(arr)||!arr.length) return null;
    return arr
      .filter(o=>o&&Number.isFinite(Number(o.finalCost))&&Number.isFinite(Number(o.finalMinutes)))
      .map(o=>({
        contractorCode:String(o.contractorCode||''),
        contractorName:String(o.contractorName||o.contractorCode||''),
        finalCost:Number(o.finalCost||0),
        finalMinutes:Number(o.finalMinutes||1),
        live:true,
        simulated:false
      }));
  }
"""
s = s.replace(anchor2, anchor2 + model, 1)

# Podmień cały planner na wersję rozgałęziającą wykonawców + Pareto.
start = s.find("  function companyComputeMixedPlan(companyResp,inv){")
end = s.find("  async function companyAutoRefresh", start)
if start < 0 or end < 0:
    raise SystemExit("Nie znaleziono companyComputeMixedPlan")

planner = r"""  function companyComputeMixedPlan(companyResp,inv){
    const nodes=companyBusinessNodes(inv);
    const c=companyResp&&companyResp.company||{};
    const payroll=Number(c.totalSalaries||0);
    let done=companyCompletedSet(inv);
    let fund=Number(inv&&inv.fund!=null?inv.fund:c.investmentFund||0);
    let income=Number(inv&&inv.dailyIncome!=null?inv.dailyIncome:c.dailyIncome||0);
    let initialDelay=0;
    const active=(inv&&inv.activeInvestment)||(companyResp&&companyResp.activeInvestment)||null;

    if(active&&active.code&&!done.has(String(active.code))){
      const fin=Date.parse(String(active.finishesAt||''));
      const rem=Number.isFinite(fin)?Math.max(0,(fin-Date.now())/60000):Math.max(0,Number(active.finalMinutes||0));
      const net=Math.max(0,income-payroll);
      fund+=net*(rem/1440);
      initialDelay+=rem;
      done=new Set(done);
      done.add(String(active.code));
      const n=nodes.find(x=>String(x.code)===String(active.code));
      income+=Number(active.incomeBonus!=null?active.incomeBonus:(n&&n.incomeBonus)||0);
    }

    if(!nodes.length) return {status:'BRAK DANYCH',steps:[],minutes:0,initialDelay,fund,income,payroll,plannerVersion:'CONTRACTORS_V2'};
    if(done.size>=nodes.length) return {status:'MAX',steps:[],minutes:initialDelay,initialDelay,fund,income,payroll,plannerVersion:'CONTRACTORS_V2'};

    let beam=[{done:new Set(done),fund,income,t:initialDelay,path:[]}];
    let full=[];
    const maxDepth=Math.min(60,nodes.length+2);

    for(let depth=0;depth<maxDepth;depth++){
      const next=[];
      for(const st of beam){
        if(st.done.size>=nodes.length){ full.push(st); continue; }
        const avail=companyAvailableNodes(nodes,st.done);
        if(!avail.length) continue;

        for(const n of avail){
          // Dla kroku dostępnego TERAZ preferuj prawdziwe oferty z API.
          // Dla dalszych kroków symuluj wszystkie trzy znane zasady wykonawców.
          const live=st.path.length===0?companyLiveOffersForPlanner(n):null;
          const opts=(live&&live.length)?live:companySimulatedOffers(n);

          for(const o of opts){
            const net=Math.max(0,Number(st.income||0)-payroll);
            const eta=companyOfferEta(o,st.fund,net);
            if(!Number.isFinite(eta.total)) continue;

            const elapsed=eta.total;
            const newFund=Math.max(0,Number(st.fund||0)+net*(elapsed/1440)-eta.cost);
            const nd=new Set(st.done); nd.add(String(n.code));
            const step={
              code:String(n.code),
              name:String(n.name||n.code),
              branch:String(n.branch||''),
              incomeBonus:Number(n.incomeBonus||0),
              cost:Number(eta.cost),
              minutes:Number(eta.mins),
              waitMinutes:Number(eta.wait),
              contractorCode:String(o.contractorCode||''),
              contractorName:String(o.contractorName||''),
              liveOffer:!!o.live,
              simulatedOffer:!!o.simulated
            };
            next.push({
              done:nd,
              fund:newFund,
              income:Number(st.income||0)+Number(n.incomeBonus||0),
              t:Number(st.t||0)+elapsed,
              path:st.path.concat([step])
            });
          }
        }
      }

      if(full.length) break;
      if(!next.length) break;

      // Ta sama lista ukończonych inwestycji może mieć różne sensowne stany:
      // szybszy ale biedniejszy albo wolniejszy ale z większym funduszem.
      // Usuwamy tylko stany zdominowane (czas >= i fundusz <=).
      const groups=new Map();
      for(const st of next){
        const sig=Array.from(st.done).sort().join(',');
        if(!groups.has(sig)) groups.set(sig,[]);
        groups.get(sig).push(st);
      }

      const pareto=[];
      for(const arr of groups.values()){
        arr.sort((a,b)=>a.t-b.t || b.fund-a.fund);
        const keep=[];
        let bestFund=-Infinity;
        for(const st of arr){
          if(st.fund>bestFund+0.01){
            keep.push(st);
            bestFund=st.fund;
          }
          if(keep.length>=6) break;
        }
        pareto.push(...keep);
      }

      beam=pareto
        .map(st=>({st,h:companyStateHeuristic(st,nodes,payroll)}))
        .sort((a,b)=>a.h-b.h || a.st.t-b.st.t || b.st.fund-a.st.fund)
        .slice(0,COMPANY_AUTO_BEAM)
        .map(x=>x.st);
    }

    if(!full.length) full=beam.filter(x=>x.done.size>=nodes.length);
    let winner=null;
    for(const st of full){
      if(!winner||st.t<winner.t||(st.t===winner.t&&st.fund>winner.fund)) winner=st;
    }
    if(!winner){
      winner=beam.slice().sort((a,b)=>companyStateHeuristic(a,nodes,payroll)-companyStateHeuristic(b,nodes,payroll))[0]||null;
    }

    return winner?{
      status:winner.done.size>=nodes.length?'OK':'CZĘŚCIOWY',
      steps:winner.path||[],
      minutes:Number(winner.t||0),
      initialDelay,
      fund:Number(fund||0),
      income:Number(income||0),
      payroll,
      completed:done.size,
      total:nodes.length,
      plannerVersion:'CONTRACTORS_V2',
      contractorRules:{
        szwagierPol:{costMultiplier:.70,timeMultiplier:2},
        standardex:{costMultiplier:1,timeMultiplier:1},
        naCitoBud:{costMultiplier:1.60,timeMultiplier:.5}
      }
    }:{status:'BRAK ŚCIEŻKI',steps:[],minutes:0,initialDelay,fund,income,payroll,plannerVersion:'CONTRACTORS_V2'};
  }

"""
s = s[:start] + planner + s[end:]

# W UI pokazuj wykonawcę dla każdej pozycji i oznacz symulację dla przyszłych kroków.
old_route = """      const contractor=x.contractorName&&x.contractorName!=='wartość bazowa'?' • '+esc(x.contractorName):'';
      return '<div class="simple-card"><span>#'+(i+1)+' • '+esc(companyBranchLabel(x.branch))+'</span><b class="'+cls+'">'+esc(x.code)+' — '+esc(x.name)+'</b><small>'+companyMoney(x.cost)+' • '+companyMinutes(x.minutes)+wait+' • +'+companyMoney(x.incomeBonus)+'/dzień'+contractor+'</small></div>';"""
new_route = """      const contractor=x.contractorName?' • '+esc(x.contractorName)+(x.simulatedOffer?' (sym.)':''):'';
      return '<div class="simple-card"><span>#'+(i+1)+' • '+esc(companyBranchLabel(x.branch))+'</span><b class="'+cls+'">'+esc(x.code)+' — '+esc(x.name)+'</b><small>'+companyMoney(x.cost)+' • '+companyMinutes(x.minutes)+wait+' • +'+companyMoney(x.incomeBonus)+'/dzień'+contractor+'</small></div>';"""
if old_route not in s:
    raise SystemExit("Nie znaleziono route UI")
s = s.replace(old_route,new_route,1)

# Zmień opis ścieżki z "koszt/czas bazowy" na pełną symulację 3 wykonawców.
old_desc = """Dla przyszłych zablokowanych inwestycji używa kosztu/czasu bazowego; gdy staną się dostępne, pobiera świeże oferty wykonawców i aktualizuje ETA."""
new_desc = """Dla przyszłych zablokowanych inwestycji symuluje Szwagier POL (−30% kosztu, ×2 czasu), Standardex (bazowo) i Na Cito Bud (+60% kosztu, ×0,5 czasu). Gdy krok staje się dostępny, pobiera świeże oferty wykonawców z API i aktualizuje trasę oraz ETA."""
if old_desc not in s:
    raise SystemExit("Nie znaleziono opisu ETA/ścieżki")
s = s.replace(old_desc,new_desc,1)

# Dodaj widoczną regułę pod planem.
needle = """      '<div class="section"><b>Ostatnie automatyczne START-y</b><div style="margin-top:10px">'+(hist||'<div class="sub">Brak.</div>')+'</div></div>'+"""
replace = """      '<div class="section simple-notice info"><b>Model wykonawców w całej prognozie:</b><br>• Szwagier POL — 30% taniej, 2× dłużej<br>• Standardex — koszt i czas bazowy<br>• Na Cito Bud — 60% drożej, 2× szybciej<br><small>Po odblokowaniu inwestycji model jest zastępowany świeżymi ofertami z serwera.</small></div>'+
      '<div class="section"><b>Ostatnie automatyczne START-y</b><div style="margin-top:10px">'+(hist||'<div class="sub">Brak.</div>')+'</div></div>'+"""
if needle not in s:
    raise SystemExit("Nie znaleziono sekcji historii Spółki")
s = s.replace(needle,replace,1)

js.write_text(s, encoding="utf-8")

bg = root / "app/build.gradle.kts"
if bg.exists():
    t=bg.read_text(encoding="utf-8")
    t=t.replace("versionCode = 10028","versionCode = 10029")
    t=t.replace('versionName = "1.0.28"','versionName = "1.0.29"')
    bg.write_text(t,encoding="utf-8")

readme = root / "README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.29 / userscript 8.8.36" not in r:
        r += """

## v1.0.29 / userscript 8.8.36
- Planner Spółki symuluje dla każdego przyszłego ulepszenia wszystkich 3 wykonawców:
  Szwagier POL = 70% ceny / 200% czasu, Standardex = 100% / 100%, Na Cito Bud = 160% / 50%.
- Wybór wykonawcy jest częścią całej mieszanej ścieżki, nie tylko bieżącego kroku.
- Dla tego samego zestawu ukończonych inwestycji planner zachowuje Pareto czas/fundusz, aby nie zgubić globalnie lepszej ścieżki.
- Przed realnym START-em nadal pobiera aktualne oferty z API i używa prawdziwego contractorCode.
- Lista kroków pokazuje planowanego wykonawcę; „(sym.)” oznacza przyszły wariant liczony z reguł gry.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.29 patch applied")
