from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
print("=== TARGETED_V1045_BEGIN ===")
print("### KOTLIN/JAVA")
for p in sorted(list((root/"app/src/main").rglob("*.kt"))+list((root/"app/src/main").rglob("*.java"))):
    s=p.read_text(encoding="utf-8",errors="replace")
    print("FILE",p)
    if "JavascriptInterface" in s or "addJavascriptInterface" in s or "AndroidBridge" in s or "WebView" in s:
        print(s)
print("### JS BAZAAR BUY CALLS")
p=root/"app/src/main/assets/pomagier.user.js"
s=p.read_text(encoding="utf-8")
for m in re.finditer(r"/api/bazaar/[^\n]{0,160}/buy|quantity\s*:\s*1",s):
    i=m.start(); line=s.count("\n",0,i)+1
    print(f"--- line {line} ---")
    print(s[max(0,i-800):min(len(s),i+1800)])
print("### JS PURCHASE ENDPOINTS")
for m in re.finditer(r"/purchase|garden_buy_seeds|buyResourceSourceOne|collectionShopBuyOne|bazaarBuyBatch",s):
    i=m.start(); line=s.count("\n",0,i)+1
    print(f"--- line {line} {m.group(0)} ---")
    print(s[max(0,i-500):min(len(s),i+1200)])
print("=== TARGETED_V1045_END ===")
