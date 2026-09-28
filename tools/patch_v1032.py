from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

s=s.replace("// @version      8.8.38","// @version      8.8.39",1)
s=s.replace("const VERSION = '8.8.38';","const VERSION = '8.8.39';",1)
s=s.replace("const ANDROID_VERSION = '1.0.31';","const ANDROID_VERSION = '1.0.32';",1)

needle="      const pre=pvpLabPrecomputedSkillPlans(meta), attrs=['str','end','agi','vit','prc'], top=[];\n"
insert="""      const pre=pvpLabPrecomputedSkillPlans(meta), attrs=['str','end','agi','vit','prc'], top=[];
      const totalAttributePoints=Math.max(0,Math.round(attrs.reduce((n,k)=>n+Number(currentAttrs[k]||0),0)));
      const tierUnits=Math.floor(totalAttributePoints/5);
      const remainder=totalAttributePoints-tierUnits*5;
      const remainderVectors=(rem)=>{
        const out=[];
        for(let a=0;a<=rem;a++) for(let b=0;b<=rem-a;b++) for(let c=0;c<=rem-a-b;c++) for(let d=0;d<=rem-a-b-c;d++) out.push([a,b,c,d,rem-a-b-c-d]);
        return out;
      };
"""
if needle not in s: raise SystemExit("Brak miejsca na dynamiczna pule")
s=s.replace(needle,insert,1)

s=s.replace("const tp=26-ts-te-ta-tv;","const tp=tierUnits-ts-te-ta-tv;",1)
s=re.sub(r"const rems=\[\[2,0,0,0,0\].*?\];","const rems=remainderVectors(remainder);",s,count=1)
s=s.replace("          if(attrs.some(k=>a[k]>50)) continue;","          if(attrs.some(k=>a[k]>50)) continue;\n          if(attrs.reduce((n,k)=>n+a[k],0)!==totalAttributePoints) continue;",1)

s=s.replace("method:'REAL_PVP_EQUAL_1TO1_COUNTERFACTUAL_V3'","method:'REAL_PVP_EQUAL_1TO1_COUNTERFACTUAL_V4_DYNAMIC_POINTS',totalAttributePoints",1)
s=s.replace("130 pkt na breakpointach + 2 reszty","dynamiczna pula '+totalAttributePoints+' pkt na breakpointach + pelna reszta",1)

old="      const refined=top.slice(0,25).map(refine).sort((a,b)=>b.score-a.score); const best=refined[0]||top[0];"
new="""      const refinedRaw=top.slice(0,35).map(refine).sort((a,b)=>b.score-a.score);
      const refined=[]; const seenBuilds=new Set();
      for(const x of refinedRaw){ const code=pvpLabBuildCode(x.attrs,x.plan); if(seenBuilds.has(code)) continue; seenBuilds.add(code); refined.push(x); }
      const best=refined[0]||top[0];"""
if old in s: s=s.replace(old,new,1)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
t=t.replace("versionCode = 10031","versionCode = 10032")
t=t.replace('versionName = "1.0.31"','versionName = "1.0.32"')
bg.write_text(t,encoding="utf-8")

print("v1.0.32 patch applied")
