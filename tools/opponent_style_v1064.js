  // v8.8.71: opis zachowania przeciwnika na podstawie zdarzeń z replayów.
  // To NIE jest odczyt jego ukrytych atrybutów STR/END/AGI/VIT/PRC.
  function opponentLabStyle(q){
    const own=Number(pvpLabOwnId()||0);
    const key=String(q?.key||'');
    const valid=(pvpLab.battles||[]).filter(b=>
      !!b && b.detailLoaded===true && !!b.eventSummary &&
      opponentLabKey(b.opponent?.id,b.opponent?.nickname)===key &&
      Number(b.opponent?.id||0)!==own
    );
    const all=(pvpLab.battles||[]).filter(b=>!!b?.detailLoaded && !!b.eventSummary);
    const med=(a)=>pvpLabMedian(a.filter(v=>Number.isFinite(v)),null);
    const perFight=valid.map(b=>{
      const e=b.eventSummary;
      const n=k=>Math.max(0,Number(e[k])||0);
      const eh=n('enemyHits'), ea=n('enemyAttacks'), ma=n('attacks'), mh=n('hits');
      return {
        enemyHits:eh,enemyAttacks:ea,attacks:ma,hits:mh,
        enemyDamage:n('damageTaken'),enemyCrits:n('enemyCrits'),enemyDoubles:n('enemyDoubles'),
        enemyCounters:n('enemyCounters'),enemyLifesteal:n('enemyLifesteal'),
        enemyBleedApplied:n('enemyBleedApplied'),stunsTaken:n('stunsTaken'),
        hp:(b.opponentObserved?.maxHp ?? b.opponent?.maxHp),
        regen:b.opponentObserved?.hpRegen,
        direction:String(b.direction||''),won:b.won===true
      };
    });
    const sum=k=>perFight.reduce((acc,r)=>acc+Math.max(0,Number(r[k])||0),0);
    const totals={fightN:valid.length,enemyHits:sum('enemyHits'),enemyAttacks:sum('enemyAttacks'),
      myAttacks:sum('attacks'),myHits:sum('hits'),enemyDamage:sum('enemyDamage'),
      enemyCrits:sum('enemyCrits'),enemyDoubles:sum('enemyDoubles'),enemyCounters:sum('enemyCounters'),
      enemyLifesteal:sum('enemyLifesteal'),enemyBleedApplied:sum('enemyBleedApplied'),
      stunsTaken:sum('stunsTaken')};
    const rate=(n,d)=>d>0?Math.round(1000*n/d)/10:null;
    const observed={
      hp:q?.medianHp??med(perFight.map(x=>Number(x.hp))),
      regen:q?.medianRegen??med(perFight.map(x=>x.regen==null?NaN:Number(x.regen))),
      damagePerEnemyHit:totals.enemyHits?Math.round(totals.enemyDamage/totals.enemyHits):null,
      critRate:rate(totals.enemyCrits,totals.enemyHits),
      doubleRate:rate(totals.enemyDoubles,totals.enemyAttacks),
      counterRate:rate(totals.enemyCounters,totals.enemyAttacks),
      myMissRate:rate(Math.max(0,totals.myAttacks-totals.myHits),totals.myAttacks),
      enemyLifestealRate:rate(totals.enemyLifesteal,totals.enemyDamage),
      enemyBleedRate:rate(totals.enemyBleedApplied,totals.enemyHits)
    };
    const ref=med(all.map(b=>{
      const e=b.eventSummary;const hits=Number(e?.enemyHits)||0;
      return hits>=3?Math.max(0,Number(e?.damageTaken)||0)/hits:NaN;
    }))||350;
    const traits=[],tips=[];
    const hp=Number(observed.hp)||0,regen=Number(observed.regen)||0;
    const anchor=Math.max(0,Number(q?.n)||valid.length);
    const enoughHits=totals.enemyHits>=20 && valid.length>=2;
    if(hp>=3400 && regen>=25){
      traits.push('Bardzo duże HP i regeneracja');
      tips.push('To przeciwnik walczący na przetrwanie: porównuj obrażenia netto na rundę z jego leczeniem, zamiast oceniać tylko pojedynczy cios.');
    }else{
      if(hp>=3400) {traits.push('Bardzo duże HP');tips.push('Przygotuj się na dłuższą walkę; sprawdź obrażenia zadawane na rundę.');}
      if(regen>=25) {traits.push('Silna regeneracja');tips.push('Sprawdź, czy obrażenia netto pokonują odnowę HP przeciwnika.');}
    }
    if(enoughHits && observed.damagePerEnemyHit!=null && observed.damagePerEnemyHit>=1.30*ref){
      traits.push('Silne trafienia'); tips.push('Przetestuj wariant z większą przeżywalnością: redukcją otrzymywanych obrażeń i odpornością na krytyki.');
    }
    if(totals.enemyHits>=25 && observed.critRate>=26){
      traits.push('Częste krytyki');tips.push('Porównaj odporność na krytyki i odpowiednie Przełamania.');
    }
    if(totals.enemyAttacks>=25 && observed.doubleRate>=34){
      traits.push('Częste podwójne ciosy');tips.push('Warto testować redukcję obrażeń oraz uniki przeciw serii trafień.');
    }
    if(totals.enemyAttacks>=20 && totals.enemyCounters>=4 && observed.counterRate>=17){
      traits.push('Częste kontrataki');tips.push('Sprawdź bilans obrażeń z Twoich ataków i kontrataków przeciwnika.');
    }
    if(totals.myAttacks>=25 && observed.myMissRate>=37){
      traits.push('Trudny do trafienia');tips.push('Zwróć uwagę na celność. Pudła mogą wynikać także z Twojego buildu, a nie tylko z uniku rywala.');
    }
    if(enoughHits && observed.enemyLifestealRate>=23){
      traits.push('Silne leczenie z obrażeń');tips.push('Przetestuj redukcję leczenia przeciwnika.');
    }
    if(totals.enemyHits>=25 && totals.enemyBleedApplied>=5 && observed.enemyBleedRate>=20){
      traits.push('Częste krwawienia');tips.push('Sprawdź odporność na krwawienie.');
    }
    if(totals.enemyHits>=15 && totals.stunsTaken>=3){
      traits.push('Ogłusza podczas walk');tips.push('Sprawdź odporność na ogłuszenie.');
    }
    const type=traits.some(t=>/HP|regeneracja/.test(t))?'Przetrwanie / regeneracja':
      traits.some(t=>/Silne trafienia|krytyki|podwójne/.test(t))?'Presja ofensywna':
      traits.some(t=>/kontrataki|trafi/.test(t))?'Uniki / kontrataki':
      'Nierozpoznany styl';
    const confidence=valid.length>=5 && totals.enemyHits>=40?'UMIARKOWANA':
      valid.length>=3 && totals.enemyHits>=20?'WSTĘPNA':'NISKA';
    const directions={attack:{n:0,wins:0},defense:{n:0,wins:0}};
    for(const b of (pvpLab.battles||[])){
      if(opponentLabKey(b?.opponent?.id,b?.opponent?.nickname)!==key) continue;
      if(directions[b.direction]){directions[b.direction].n++;if(b.won===true)directions[b.direction].wins++;}
    }
    return {type,confidence,traits:traits.slice(0,4),tips:tips.slice(0,4),
      samples:{fights:anchor,detailed:valid.length,enemyHits:totals.enemyHits,myAttacks:totals.myAttacks},
      observed,baselineDamagePerHit:Math.round(ref),directions,
      disclaimer:'To charakterystyka zaobserwowanych walk, nie odczyt atrybutów ani pewna prognoza zwycięstwa.'};
  }
  function opponentLabStyleHTML(q){
    const a=opponentLabStyle(q);
    const fmt=v=>v==null?'brak danych':String(v);
    const details=[`Cios przeciwnika: ${fmt(a.observed.damagePerEnemyHit)} obrażeń na trafienie (próba ${a.samples.enemyHits})`,
      `Krytyki: ${fmt(a.observed.critRate)}% • podwójne: ${fmt(a.observed.doubleRate)}% • kontrataki: ${fmt(a.observed.counterRate)}%`,
      `Twoje pudła: ${fmt(a.observed.myMissRate)}% (również zależne od Twojej celności)`,
      `Atakowałeś: ${a.directions.attack.wins}/${a.directions.attack.n} wygranych • broniłeś się: ${a.directions.defense.wins}/${a.directions.defense.n}`];
    return `<div class="section"><div class="section-title">📊 Styl walki z replayów: ${esc(a.type)} • pewność ${esc(a.confidence)}</div>
      <div class="sub">Podstawa: ${a.samples.detailed} szczegółowych walk, ${a.samples.enemyHits} trafień przeciwnika. To nie oznacza odczytania statystyk postaci.</div>
      <div class="note">${esc(a.traits.join(' • ')||'Za mało charakterystycznych danych do klasyfikacji.')}</div>
      ${details.map(t=>`<div class="sub" style="margin-top:5px">${esc(t)}</div>`).join('')}
      ${a.tips.map(t=>`<div class="note" style="margin-top:5px">${esc(t)}</div>`).join('')}
      <div class="sub">${esc(a.disclaimer)}</div></div>`;
  }