from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
p=root/"app/src/main/assets/pomagier.user.js"
s=p.read_text(encoding="utf-8")
print("=== FINAL_V1043_INSPECT_BEGIN ===")
needles=[
 "Wysypisko Lab","wysypisko-ai","solo-wysypisko","/wysypisko/",
 "dumpLab","wysypiskoLab","scanZones","labScan","leaseId",
 "garden_buy_seeds","localAiTakeItemFromMelinaByItemId"
]
seen=set()
for needle in needles:
    start=0
    while True:
        i=s.find(needle,start)
        if i<0: break
        line=s.count("\n",0,i)+1
        key=(needle,line)
        if key not in seen:
            seen.add(key)
            a=max(0,i-1200); b=min(len(s),i+4200)
            print(f"--- {needle!r} around line {line} ---")
            print(s[a:b])
        start=i+len(needle)
        if sum(1 for x in seen if x[0]==needle)>=8: break
print("=== FINAL_V1043_INSPECT_END ===")
