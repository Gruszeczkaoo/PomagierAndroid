from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")
print("=== PURCHASE_INSPECT_BEGIN ===")
for needle in [
  "collectionShopBuyOne","/api/bazaar/","isWineYeastItem","Drożdże winiarskie",
  "wineYeast","purchaseRemaining","purchaseLimit","quantity:1","quantity: 1",
  "marketBuy","bazaarBuy"
]:
    pos=0; count=0
    while True:
        i=s.find(needle,pos)
        if i<0 or count>=12: break
        line=s.count("\n",0,i)+1
        print(f"--- {needle} line {line} ---")
        print(s[max(0,i-900):min(len(s),i+2400)])
        pos=i+len(needle); count+=1
print("=== ANDROID_FILES ===")
for p in root.rglob("*"):
    if not p.is_file(): continue
    n=p.name.lower()
    if n in ("mainactivity.kt","androidbridge.kt","mainactivity.java") or ("bridge" in n and p.suffix in (".kt",".java")):
        print("FILE",p.relative_to(root))
        try: print(p.read_text(encoding="utf-8")[:30000])
        except Exception as e: print("ERR",e)
print("=== PURCHASE_INSPECT_END ===")
