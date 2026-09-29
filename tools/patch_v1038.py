from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
s = js.read_text(encoding="utf-8")

# Release sync on top of the current v1.0.37 chain.
s = s.replace("// @version      8.8.44", "// @version      8.8.45", 1)
s = s.replace("const VERSION = '8.8.44';", "const VERSION = '8.8.45';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.37';", "const ANDROID_VERSION = '1.0.38';", 1)

anchor = "  // v8.8.44"
note = """  // v8.8.45 SESSION ECONOMY RELEASE SYNC:
  // - wydanie na aktualnej linii Android 1.0.38, bez cofania poprawek 1.0.25-1.0.37,
  // - zachowuje rozbicie ekonomii sesji wdrożone wcześniej w łańcuchu aktualizacji,
  // - SESJE pokazują osobno źródła przychodu i przepływy: NPC, warsztat/bazar,
  //   napady, MenelMode, puszki i kombinowanie,
  // - wartość niezrealizowanych dropów NPC pozostaje oddzielona od faktycznej gotówki.
"""
if note not in s:
    p = s.find(anchor)
    if p >= 0:
        s = s[:p] + note + s[p:]

js.write_text(s, encoding="utf-8")

bg = root / "app/build.gradle.kts"
t = bg.read_text(encoding="utf-8")
t = t.replace("versionCode = 10037", "versionCode = 10038")
t = t.replace('versionName = "1.0.37"', 'versionName = "1.0.38"')
bg.write_text(t, encoding="utf-8")

readme = root / "README.md"
if readme.exists():
    r = readme.read_text(encoding="utf-8")
    if "## v1.0.38 / userscript 8.8.45" not in r:
        r += """

## v1.0.38 / userscript 8.8.45
- Wydanie na aktualnej linii projektu; nie cofa żadnych poprawek z 1.0.25-1.0.37.
- Zachowuje rozbicie ekonomii sesji według źródła.
- NPC: faktyczna gotówka i wartość niezrealizowanych dropów są liczone osobno.
- Warsztat/bazar pozostają rozdzielone tak, aby nie dublować tego samego zarobku.
"""
    readme.write_text(r, encoding="utf-8")

print("v1.0.38 patch applied")
