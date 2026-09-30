from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
files=[
 root/"app/src/main/assets/pomagier.user.js",
 root/"app/src/main/java/com/pomagier/don/MainActivity.kt",
 root/"app/src/main/java/com/pomagier/don/AndroidBridge.kt",
 root/"app/src/main/AndroidManifest.xml",
 root/"app/build.gradle.kts"
]
print("=== INSPECT_V1044_BEGIN ===")
for p in files:
    if not p.exists():
        print("MISSING",p)
        continue
    s=p.read_text(encoding="utf-8",errors="replace")
    print("\n### FILE",p)
    needles=["AndroidBridge","addJavascriptInterface","Blob","dumpLabExport","dumpLabCopy","purchase","quantity:1","quantity: 1","wine","drozd","drożd","yeast","20","daily","buy","shop","market"]
    for needle in needles:
        start=0; n=0
        while True:
            i=s.lower().find(needle.lower(),start)
            if i<0: break
            line=s.count("\n",0,i)+1
            print(f"--- {needle} line {line} ---")
            print(s[max(0,i-1000):min(len(s),i+3600)])
            n+=1
            if n>=12: break
            start=i+len(needle)
print("=== INSPECT_V1044_END ===")
