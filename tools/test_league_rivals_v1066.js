const fs=require('fs'),vm=require('vm'),assert=require('assert');
const js=fs.readFileSync(process.argv[2]||'app/src/main/assets/pomagier.user.js','utf8');
const a=js.indexOf('  // LIGA MENELI LAB v8.8.67'),b=js.indexOf('  // PvP ENGINE V2 SCANNER v8.8.55',a);
assert(a>=0&&b>a,'module marker');
const data={},calls=[];
const ctx={URL,URLSearchParams,Date,JSON,Number,String,Object,Array,Math,Set,Map,RegExp,
 location:{href:'https://menelgame.online/',origin:'https://menelgame.online'},
 pvpLabUrl:u=>new URL(u,'https://menelgame.online/'),
 loadJSON:(key,d)=>data[key]||d,saveJSON:(key,v)=>{data[key]=JSON.parse(JSON.stringify(v))},
 pvpLabOwnId:()=>462,document:{querySelector:()=>({innerText:'Liga Meneli'})},
 esc:x=>String(x),render:()=>{},confirm:()=>true,alert:()=>{},sleep:async()=>{},
 nowIso:()=>new Date().toISOString(),ANDROID_VERSION:'1.0.66',VERSION:'8.8.73',
 pomagierSaveJsonNative:async()=>true,pomagierBrowserDownload:()=>{},
 tryHydrateSessionFromGameAuth:()=>true,__mgSessionTemplate:{},
 apiActive:async p=>{calls.push(p);return {success:true,results:[]}}};
vm.createContext(ctx);
vm.runInContext(js.slice(a,b)+ '\nthis.test={path:leagueLabPathMatches,capture:leagueLabCapture,sync:leagueLabSync,lab:()=>leagueLab}',ctx);
let t=ctx.test;
for(const path of ['overview','matches','schedule','ranking','reward-rates','status','matches/404/attacks']){
 assert(t.path('/api/rivals/462/'+path),'missing real League route '+path);
 const sample={success:true,source:'server',matches:[]};
 assert(t.capture('/api/rivals/462/'+path,sample,{method:'GET',source:'native-fetch'}),'capture '+path);
}
for(const path of ['/api/rivals/112/overview','/api/rivals/462/private','/api/duels/462/fight','/api/combat/462/history','/api/gangs/462/applications']){
 assert(!t.path(path),'incorrect League classification '+path);
 assert(!t.capture(path,{success:true,attributes:{str:50}},{method:'GET'}),'incorrect capture '+path);
}
assert.equal(Object.keys(t.lab().endpoints).length,7);
assert.equal(t.lab().matches.length,0,'unknown schema should not fabricate result');
assert.equal(t.capture('/api/rivals/462/matches',{success:true,matches:[{id:404,homeGang:{name:'Zubereck'},awayGang:{name:'Marudy'},homeScore:10,awayScore:8,status:'finished'}]},{method:'GET'}),true);
assert.equal(t.lab().matches.length,1,'known match shape parse');
assert.equal(t.lab().matches[0].home,'Zubereck');
assert.equal(t.lab().matches[0].away,'Marudy');
// Private values not included in captured export.
t.capture('/api/rivals/462/overview',{success:true,token:'SECRET',authorization:'Bearer SECRET',results:[]},{method:'GET'});
assert(!JSON.stringify(t.lab().endpoints).includes('SECRET'));
(async()=>{
 await t.sync();
 assert(!calls.some(p=>p.endsWith('/matches/404/attacks')),'dynamic match detail sync blocked');
 assert(calls.some(p=>p.endsWith('/matches')),'league matches sync');
 console.log('PASS: 7 Liga routes, capture, isolation, dedup, redaction, sync excludes stale details');
})().catch(e=>{console.error(e);process.exitCode=1});