const fs=require('fs'),vm=require('vm'),assert=require('assert');
const js=fs.readFileSync(process.argv[2]||'app/src/main/assets/pomagier.user.js','utf8');
const a=js.indexOf('  // LIGA MENELI LAB v8.8.67'), b=js.indexOf('  // PvP ENGINE V2 SCANNER v8.8.55',a);
assert(a>=0&&b>a,'League module missing');
const code=js.slice(a,b);
const saved={};
const ctx={
  URL,URLSearchParams,Date,JSON,Number,String,Object,Array,Math,Set,Map,RegExp,
  location:{href:'https://menelgame.online/',origin:'https://menelgame.online'},
  pvpLabUrl:(u)=>new URL(u,'https://menelgame.online/'),
  loadJSON:(key,fallback)=>saved[key]||fallback,
  saveJSON:(key,val)=>saved[key]=JSON.parse(JSON.stringify(val)),
  pvpLabOwnId:()=>462,document:{querySelector:()=>({innerText:'Gang - Liga Meneli'})},
  esc:x=>String(x),render:()=>{},confirm:()=>true,alert:()=>{},sleep:async()=>{},
  nowIso:()=>new Date().toISOString(),ANDROID_VERSION:'1.0.60',VERSION:'8.8.67',
  pomagierSaveJsonNative:async()=>true,pomagierBrowserDownload:()=>{},
  tryHydrateSessionFromGameAuth:()=>true,__mgSessionTemplate:{},
};
vm.createContext(ctx);
vm.runInContext(code+'\nthis.__test={leagueLabCapture,leagueLabNormalizeMatches,leagueLabShapeMatches,leagueLabPathMatches,leagueLabSanitize,leagueLabHTML,leagueLabSave,leagueLabStart,leagueLabExport,leagueLabSync,getLab:()=>leagueLab};',ctx);
const f=ctx.__test;
assert(f.leagueLabPathMatches('https://menelgame.online/api/gang-league/today'));
assert(!f.leagueLabPathMatches('/api/pvp/462/summary'));
let accepted=f.leagueLabCapture('/api/gang-league/today',{success:true,league:{today:[{matchId:11,season:2026,week:2,homeGang:'Zubereck',awayGang:'marudy',homeXp:48630,awayXp:-48630,status:'finished'}]}},{method:'GET'});
assert(accepted,'League endpoint not captured');
assert.strictEqual(f.getLab().matches.length,1);
assert.strictEqual(f.getLab().matches[0].homeXp,48630);
assert.strictEqual(f.getLab().matches[0].awayXp,-48630);
f.leagueLabCapture('/api/gang-league/today',{success:true,league:{today:[{matchId:11,season:2026,week:2,homeGang:'Zubereck',awayGang:'marudy',homeXp:48630,awayXp:-48630,status:'finished'}]}},{method:'GET'});
assert.strictEqual(f.getLab().matches.length,1,'Dedupe broken');
accepted=f.leagueLabCapture('/api/gangs/462/some-generic',{data:{leagueMatches:[{id:25,gangA:{name:'A'},gangB:{name:'B'},xpA:123,xpB:-123}]}},{method:'GET'});
assert(accepted,'Schema discovery not captured');
assert.strictEqual(f.getLab().matches.length,2);
accepted=f.leagueLabCapture('/api/pvp/462/summary',{success:true,attributes:{str:50},token:'secret'},{method:'GET'});
assert(!accepted,'PvP leakage into league');
const clean=f.leagueLabSanitize({token:'SECRET',authorization:'Bearer X',email:'me@example.com',league:[{name:'A'}]});
assert(!('token' in clean) && !('authorization' in clean) && !('email' in clean));
const html=f.leagueLabHTML();assert(html.includes('Zubereck')&&html.includes('Liga Meneli'));
assert(!html.includes('SECRET'));
console.log('League v1.0.60 tests passed: 2 match shapes; dedup; source isolation; token redaction; UI');