"""Pomagier 1.0.67 / 8.8.74 - Liga Meneli v2 real API history + match normalization.

Grounded in exported /api/rivals/462/overview 2026-11-18; no league attacks sent.
Apply after patch_v1066.py on project root.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf-8')

def one(old,new,label):
    global s
    n=s.count(old)
    if n != 1:
        raise SystemExit(f'v1067 {label}: expected 1 occurrence, got {n}')
    s=s.replace(old,new,1)

one('// @version      8.8.73','// @version      8.8.74','userscript meta')
one("const VERSION = '8.8.73';","const VERSION = '8.8.74';",'js version')
one("const ANDROID_VERSION = '1.0.66';","const ANDROID_VERSION = '1.0.67';",'android js version')
one('  leagueLab.schema=1;', '  leagueLab.schema=2;', 'league schema')
one("if(/^(?:overview|status|schedule|ranking|reward-rates|matches)$/.test(rivals[2])) return true;", 
    "if(/^(?:overview|status|history|schedule|ranking|reward-rates|matches)$/.test(rivals[2])) return true;",'official rival history path')

module=Path(__file__).with_name('league_rivals_v1067.js').read_text(encoding='utf8')
one('  function leagueLabSave(){',module+'\n  function leagueLabSave(){','insert league v2 parser')
one('''    const matchRows=leagueLabNormalizeMatches(data,path);
    leagueLabCaptureIndividual(url,data,meta);''', '''    const matchRows=[...leagueLabNormalizeMatches(data,path),...leagueLabV2NormalizeMatches(data,path)];
    // Oddzielne walki graczy sa odczytywane tylko z jednoznacznych
    // obiektow /api/rivals/:id/{overview,history,status,matches/:id/attacks}.
    leagueLabV2IngestIndividual(data,path);
    leagueLabCaptureIndividual(url,data,meta);''','parse league v2 match and personal history')
one("    if(leagueLab.errors.length>20) leagueLab.errors=leagueLab.errors.slice(-20);", 
    "    if(leagueLab.errors.length>20) leagueLab.errors=leagueLab.errors.slice(-20);\n    if(Array.isArray(leagueLab.individualFights) && leagueLab.individualFights.length>1200) leagueLab.individualFights=leagueLab.individualFights.slice(-1200);",'cap fights')
one(r'''    const paths=Object.values(leagueLab.endpoints).filter(x=>x?.method==='GET' && leagueLabPathMatches(x.path) &&
      !/\/api\/rivals\/\d+\/matches\/\d+\/attacks(?:\?|$)/i.test(x.path))
      .sort((a,b)=>Number(b.lastAt||0)-Number(a.lastAt||0))
      .map(x=>x.path).filter((x,i,a)=>a.indexOf(x)===i).slice(0,12);''', r'''    const paths=Object.values(leagueLab.endpoints).filter(x=>x?.method==='GET' && leagueLabPathMatches(x.path) &&
      !/\/api\/rivals\/\d+\/matches\/\d+\/attacks(?:\?|$)/i.test(x.path))
      .sort((a,b)=>Number(b.lastAt||0)-Number(a.lastAt||0))
      .map(x=>x.path).filter((x,i,a)=>a.indexOf(x)===i).slice(0,12);
    // Gra wykonala GET historii podczas ostatniego skanu. Endpoint jest
    // potwierdzony w seenPaths, wiec mozemy go uzyc w sync (tylko GET).
    const hist='/api/rivals/'+Number(pvpLabOwnId()||0)+'/history';
    if(leagueLab.seenPaths?.[hist] && !paths.includes(hist)) paths.push(hist);''','sync history GET observed')
one("    const out={type:'liga-meneli-lab',schema:1,exportedAt:nowIso()", 
    "    const out={type:'liga-meneli-lab',schema:2,exportedAt:nowIso()",'export schema')
one('''    leagueLab={schema:1,characterId:pvpLabOwnId(),startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,''',
    '''    leagueLab={schema:2,characterId:pvpLabOwnId(),startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,''','clear v2 schema')
one('''    const rows=arr.slice(-30).reverse().map(x=>`<tr><td>${new Date(x.at).toLocaleString('pl-PL')}</td><td>${esc(x.opponent||'ID '+x.opponentId)}</td><td>${x.won===true?'WYGRANA':x.won===false?'PRZEGRANA':'brak wyniku'}</td><td>${x.leagueXpChange==null?'—':x.leagueXpChange}</td></tr>`).join('');
    return `<div class="section table-wrap"><div class="section-title">Liga Meneli — walki indywidualne (${resolved.length})</div>
      <div class="sub">Bilans: ${wins} wygranych / ${resolved.length-wins} przegranych. Wpis tylko gdy odpowiedź gry potwierdza tryb ligi / dominacji. Liga nie miesza się z prestiżem.</div>
      <table><thead><tr><th>Data</th><th>Rywal</th><th>Wynik</th><th>XP</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Brak ligowych pojedynkow. Wykonaj w grze Okradnij → Pokaż dominację i otwórz eksport.</td></tr>'}</tbody></table></div>`;''',
    '''    const pending=arr.filter(x=>x.state==='pending').length;
    const cancelled=arr.filter(x=>x.state==='cancelled').length;
    const ordered=arr.slice().sort((a,b)=>Number(b.at||0)-Number(a.at||0));
    const rows=ordered.slice(0,35).map(x=>{
      const result=x.won===true?'WYGRANA':x.won===false?'PRZEGRANA':x.state==='cancelled'?'ANULOWANA':x.state==='pending'?'W TOKU':'brak wyniku';
      const stamp=Number(x.at||0)>0?new Date(x.at).toLocaleString('pl-PL'):'—';
      const xp=x.leagueXpChange==null?'—':((x.leagueXpChange>0?'+':'')+x.leagueXpChange);
      return `<tr><td>${stamp}</td><td class="left">${esc(x.opponent||'ID '+x.opponentId)}</td><td>${result}</td><td>${xp}</td></tr>`;
    }).join('');
    const summary=leagueLabV2OpponentSummary();
    return `<div class="section table-wrap"><div class="section-title">Liga Meneli — walki indywidualne (${resolved.length})</div>
      <div class="sub">Bilans: <b>${wins} zwycięstw / ${resolved.length-wins} porażek</b> • ${pending} w toku • ${cancelled} anulowanych. Dane z oficjalnego API historii ligi, oddzielone od prestiżu.</div>
      <table><thead><tr><th>Data</th><th>Rywal</th><th>Wynik</th><th>XP</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Brak historii ligi. Otwórz Ligę Meneli albo wykonaj synchronizację.</td></tr>'}</tbody></table>
      <div class="section-title" style="margin-top:14px">Bilans z rywalami Ligi Meneli</div>
      <div class="sub">Zapisane zwycięstwa nie gwarantują kolejnej wygranej. Liga ma osobną historię i nie zasila automatycznie ataków o prestiż.</div>
      <table><thead><tr><th>Rywal</th><th>Wygrane</th><th>Przegrane</th></tr></thead><tbody>${summary||'<tr><td colspan="3">Za mało danych.</td></tr>'}</tbody></table></div>`;''','render individual league & rival summaries')
one('''      <div class="section table-wrap"><div class="section-title">Zebrane mecze (${leagueLab.matches.length})</div><table><thead><tr><th>Data / kolejka</th><th>Gangi</th><th>XP 1</th><th>XP 2</th><th>Zwycięzca / status</th></tr></thead>''',
    '''      <div class="section table-wrap"><div class="section-title">Zebrane mecze (${leagueLab.matches.length})</div>
      <div class="sub">XP pokazuje aktualny bilans meczu. Przy stanie „open” wynik nie jest jeszcze rozstrzygnięty.</div>
      <table><thead><tr><th>Data / kolejka</th><th>Gangi</th><th>XP 1</th><th>XP 2</th><th>Zwycięzca / status</th></tr></thead>''','UI XP explanation')
p.write_text(s,encoding='utf8')

g=root/'app/build.gradle.kts'
z=g.read_text(encoding='utf8')
if z.count('versionCode = 10066')!=1 or z.count('versionName = "1.0.66"')!=1:
    raise SystemExit('v1067 requires 1.0.66 source')
g.write_text(z.replace('versionCode = 10066','versionCode = 10067',1).replace('versionName = "1.0.66"','versionName = "1.0.67"',1),encoding='utf8')
r=root/'README.md'
if r.exists():
    r.write_text(r.read_text(encoding='utf8')+'''\n\n## v1.0.67 / userscript 8.8.74
- Liga Meneli v2: oficjalna historia z /api/rivals/:id/overview.history i /history, z deduplikacja po ID, rozroznieniem wygrana/przegrana/w toku/anulowana.
- 2026-11-18: rzeczywisty eksport zawiera 50 zdarzen (41 wygranych, 8 przegranych, 1 anulowane); bez mieszania z PvP-prestizem.
- Mecze gangow rozpoznawane przez snake_case gang_a_name, gang_b_name, xp_balance_a, day_key, state, winner_gang_id; brak zgadywania zwyciezcy otwartego meczu.
- Bilans z rywalami Ligi Meneli; sync oficjalnego /history tylko jezeli gra wczesniej pobrala ten adres.
- Bez zmiany zasad autoatakow prestizowych; historia ligowa nie daje gwarancji wygranych.
''',encoding='utf8')
print('OK 1.0.67 / 8.8.74')