"""Pomagier 1.0.65: verified prestige auto-duels + individually logged League Meneli victories and losses."""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf8')
def one(old,new,label):
 global s
 n=s.count(old)
 if n!=1:raise SystemExit(f'{label}: expected 1, got {n}')
 s=s.replace(old,new,1)
one('// @version      8.8.71','// @version      8.8.72','userscript meta')
one("const VERSION = '8.8.71';","const VERSION = '8.8.72';",'version')
one("const ANDROID_VERSION = '1.0.64';","const ANDROID_VERSION = '1.0.65';",'android version')
code=Path(__file__).with_name('prestige_autoplay_v1065.js').read_text(encoding='utf8')
one('  // ============================================================\n  // ANALIZATOR PRZECIWNIKOW PvP',code+'\n  // ============================================================\n  // ANALIZATOR PRZECIWNIKOW PvP','insert prestige/league code')
one("if(kind==='duel_status'){ pvpLabIngestDuelStatus(data); return; }",
    "if(kind==='duel_status'){ pvpLabIngestDuelStatus(data); return; }",'status unchanged') if False else None
one('''        pvpLab.opponentRolls.push({at:Date.now(),opponents:opponents.map(x=>({id:x.id,nickname:x.nickname,level:x.level,prestige:x.prestige,expectedGain:x.expectedGain,expectedLoss:x.expectedLoss}))}); pvpLabSave(); return;''',
    '''        pvpLab.opponentRolls.push({at:Date.now(),opponents:opponents.map(x=>({id:x.id,nickname:x.nickname,level:x.level,prestige:x.prestige,expectedGain:x.expectedGain,expectedLoss:x.expectedLoss}))}); pvpLabSave();
        prestigeAutoObserve('duel_roll',data,meta); return;''','roll observe')
one('''        if(data?.attacker && data?.defender) pvpLabRecordBattle(data,{source:'prestige',direction:'attack',buildCode:pvpLabCurrentBuild(),prestigeChange:data?.prestigeChange,xpGained:data?.xpGained});
        return;''','''        if(data?.attacker && data?.defender) pvpLabRecordBattle(data,{source:'prestige',direction:'attack',buildCode:pvpLabCurrentBuild(),prestigeChange:data?.prestigeChange,xpGained:data?.xpGained});
        prestigeAutoObserve('duel_fight',data,meta);
        return;''','fight observe')
one("      if(kind==='normal_fight'){\n        pvpLabRememberDefenseSnapshot", "      if(kind==='normal_fight'){\n        if(leagueLabCaptureIndividual(url,data,meta)) return;\n        pvpLabRememberDefenseSnapshot",'league classification normal attack')
one('''    const out={...oldF,...newF};
    if(oldF.attributes && !newF.attributes) out.attributes=oldF.attributes;''',
    '''    const out={...oldF,...newF};
    if(Number(oldF.id||0)>0 && !(Number(newF.id||0)>0)) out.id=oldF.id;
    if(oldF.nickname && !newF.nickname) out.nickname=oldF.nickname;
    if(oldF.attributes && !newF.attributes) out.attributes=oldF.attributes;''',
    'preserve opponent ID after replay merge')
one('''      opponent:meta.opponent?{id:pvpLabNum(meta.opponent.id ?? meta.opponent.characterId,0),nickname:String(meta.opponent.nickname||meta.opponent.name||''),level:pvpLabNum(meta.opponent.level,null)}:undefined,''',
    '''      opponent:(meta.opponent && (Number((meta.opponent.id??meta.opponent.characterId??0))>0 || meta.opponent.nickname || meta.opponent.name))?
        {id:pvpLabNum(meta.opponent.id ?? meta.opponent.characterId,0),nickname:String(meta.opponent.nickname||meta.opponent.name||''),level:pvpLabNum(meta.opponent.level,null)}:undefined,''',
    'avoid wiping known opponent ID with empty history meta')
one('''    for(const x of list){ if(x?.battleId) pvpLabMetaRecord({battleId:x.battleId,source:'normal',direction:x.wasAttacker===false?'defense':'attack',won:!!x.won,createdAt:x.createdAt,opponent:{id:x.opponentId,nickname:x.opponentNickname,level:x.opponentLevel}}); }''',
    '''    for(const x of list){
      if(!x?.battleId) continue;
      if(leagueLabCaptureIndividual(`/api/combat/${pvpLabOwnId()}/history`,x,{method:'GET'})) continue;
      pvpLabMetaRecord({battleId:x.battleId,source:'normal',direction:x.wasAttacker===false?'defense':'attack',won:!!x.won,createdAt:x.createdAt,opponent:{id:x.opponentId,nickname:x.opponentNickname,level:x.opponentLevel}});
    }''','league from combat history')
one('''      const source=x.source||x.type||'unknown';
      pvpLabMetaRecord''','''      const source=x.source||x.type||'unknown';
      if(leagueLabCaptureIndividual(`/api/pvp/${pvpLabOwnId()}/battle-history`,x,{method:'GET'})) continue;
      pvpLabMetaRecord''','league from pvp history')
one('''    const matchRows=leagueLabNormalizeMatches(data,path);
    for(const m of matchRows){''','''    const matchRows=leagueLabNormalizeMatches(data,path);
    leagueLabCaptureIndividual(url,data,meta);
    for(const m of matchRows){''','league capture from league endpoints')
one('''    return `<div class="helper-hero"><div><div class="helper-name">🏆 Liga Meneli — rejestr walk gangów</div>''','''    return `<div class="helper-hero"><div><div class="helper-name">🏆 Liga Meneli — rejestr walk gangów</div>''','league hero unchanged') if False else None
one('''      <div class="section table-wrap"><div class="section-title">Zebrane mecze (${leagueLab.matches.length})</div>''','''      ${leagueLabIndividualHTML()}
      <div class="section table-wrap"><div class="section-title">Zebrane mecze (${leagueLab.matches.length})</div>''','league duel table')
one("case 'opponentLab': return opponentLabHTML();", "case 'opponentLab': return opponentLabHTML();\n      case 'prestigeAuto': return prestigeAutoHTML();",'prestige tab render')
one("['opponentLab','🔎 Przeciwnicy'],['leagueLab','🏆 Liga Meneli']", "['opponentLab','🔎 Przeciwnicy'],['prestigeAuto','🎯 Prestiż AUTO'],['leagueLab','🏆 Liga Meneli']",'prestige tab')
one("    if(act==='league-start'){ leagueLabStart(); return; }", """    if(act==='prestige-auto-start'){prestigeAutoStart();return;}
    if(act==='prestige-auto-stop'){prestigeAutoStop('ZATRZYMANY PRZEZ UZYTKOWNIKA');return;}
    if(act==='prestige-auto-check'){await prestigeAutoRefreshTargets();return;}
    if(act==='prestige-auto-export'){await prestigeAutoExport();return;}
    if(act==='league-start'){ leagueLabStart(); return; }""",'actions')
one("    const accountChanged=syncCharacterIdFromGameAuth();\n    if(accountChanged) __mgSessionTemplate=null;\n    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();\n    updateHeader();\n\n    // v8.8.61: termin", """    const accountChanged=syncCharacterIdFromGameAuth();
    if(accountChanged) __mgSessionTemplate=null;
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    updateHeader();
    prestigeAutoGuard();
    if(prestigeAuto.runtimeBusy) return; // wykluczenie innych cykli gdy trwa POST prestizu

    // v8.8.61: termin""",'scheduler busy guard')
one('''    if(pvpLab.syncing) return;

    // Liga Meneli: lekki auto-sync''','''    if(pvpLab.syncing) return;
    if(prestigeAuto.enabled && !prestigeAuto.runtimeBusy && !prestigeAutoBusyElsewhere() &&
       Date.now()-prestigeAuto.lastCheckAt>=60000){
      prestigeAutoCycle({manual:false});
      return;
    }

    // Liga Meneli: lekki auto-sync''','scheduler cycle')
# Keep links/export of League separate; no auto League attacks.
p.write_text(s,encoding='utf8')
g=root/'app/build.gradle.kts';z=g.read_text(encoding='utf8')
if z.count('versionCode = 10064')!=1 or z.count('versionName = "1.0.64"')!=1:raise SystemExit('wrong Android version')
g.write_text(z.replace('versionCode = 10064','versionCode = 10065',1).replace('versionName = "1.0.64"','versionName = "1.0.65"',1),encoding='utf8')
r=root/'README.md'
if r.exists():r.write_text(r.read_text(encoding='utf8')+'''

## v1.0.65 / userscript 8.8.72
- Oddzielne rejestrowanie wygranych i porazek o prestiz oraz jednoznacznie oznaczonych walk ligowych "Pokaz dominacje".
- Prestiż AUTO: aktywacja po zgodzie, autoataki tylko na swiezych legalnych celach po potwierdzonym recznym formacie POST i min. 4 zwyciestwach bez porazki przy aktualnym buildzie.
- Przed atakiem pobranie statusu, ograniczenie 8 atakow na dobe, minimum 30 minut miedzy atakami, stop po przegranej/niepewnym zapisie.
- Bez automatycznego losowania POST, wydawania waluty i obietnicy 100% zwyciestw.
- Eksport AUTO JSON oraz indywidualnych walk Ligi Meneli; nie zmieniamy wspolnego rankingu PvP bez potwierdzonego trybu walki.
''',encoding='utf8')
print('OK 1.0.65 / 8.8.72')