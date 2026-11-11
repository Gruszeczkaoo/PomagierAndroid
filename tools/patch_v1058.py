from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
gradle = root / "app/build.gradle.kts"
if not js.exists() or not gradle.exists():
    raise SystemExit("Brak plikow projektu Android")

s = js.read_text(encoding="utf-8")
old_version = "// @version      8.8.64"
if old_version not in s or "const VERSION = '8.8.64';" not in s:
    raise SystemExit("Oczekiwano userscriptu 8.8.64")
if "const ANDROID_VERSION = '1.0.57';" not in s:
    raise SystemExit("Oczekiwano Android 1.0.57")
s = s.replace(old_version, "// @version      8.8.65", 1)
s = s.replace("const VERSION = '8.8.64';", "const VERSION = '8.8.65';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.57';", "const ANDROID_VERSION = '1.0.58';", 1)

note = """  // v8.8.65 PVP JSON EXPORT FIX:
  // - eksport skanera PvP nie zalezy od usunietego Wysypisko Lab,
  // - niezalezny helper zapisuje przez AndroidBridge porcjami i fallback do download,
  // - skaner nadal jest read-only i zachowuje dotychczasowy format JSON,
  // - brak odtworzenia rejestratora Wysypiska ani jego localStorage.
"""
anchor = "  // v8.8.64 RAID EXECUTE ENDPOINT FIX:"
if anchor not in s:
    raise SystemExit("Brak kotwicy poprzedniej wersji")
s = s.replace(anchor, note + anchor, 1)

marker = "  async function pvpEngineScanExport(){"
if s.count(marker) != 1:
    raise SystemExit("Nie odnaleziono jednoznacznie funkcji eksportu PvP")

helpers = """  // Niezalezny od usunietego Wysypisko Lab zapis JSON dla PvP.
  async function pomagierSaveJsonNative(fileName,raw){
    const bridge=window.AndroidBridge;
    if(ANDROID_APP && bridge){
      if(typeof bridge.beginTextFile==='function' &&
         typeof bridge.appendTextFileChunk==='function' &&
         typeof bridge.finishTextFile==='function'){
        let begun=false;
        try{
          begun=!!bridge.beginTextFile(String(fileName));
          if(!begun) throw new Error('Android nie rozpoczal zapisu JSON.');
          const chunkSize=24000;
          for(let i=0;i<raw.length;i+=chunkSize){
            if(!bridge.appendTextFileChunk(raw.slice(i,i+chunkSize)))
              throw new Error('Android przerwal zapis JSON.');
            await sleep(0);
          }
          if(!bridge.finishTextFile()) throw new Error('Android nie zakonczyl zapisu JSON.');
          return true;
        }catch(e){
          try{if(begun && typeof bridge.abortTextFile==='function') bridge.abortTextFile();}catch(_){}
          throw e;
        }
      }
      if(typeof bridge.saveTextFile==='function'){
        const ok=bridge.saveTextFile(String(fileName),String(raw));
        if(ok===false) throw new Error('Android odmowil zapisu JSON.');
        return true;
      }
    }
    return false;
  }

  function pomagierBrowserDownload(fileName,raw){
    const blob=new Blob([raw],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=String(fileName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

"""
s = s.replace(marker, helpers + marker, 1)
old_native = "const nativeSaved=await dumpLabSaveJsonNative(fileName,raw);"
old_browser = "if(!nativeSaved) dumpLabBrowserDownload(fileName,raw);"
if s.count(old_native) != 1 or s.count(old_browser) != 1:
    raise SystemExit("Nie znaleziono starych wywolan eksportu PvP")
s = s.replace(old_native, "const nativeSaved=await pomagierSaveJsonNative(fileName,raw);", 1)
s = s.replace(old_browser, "if(!nativeSaved) pomagierBrowserDownload(fileName,raw);", 1)

for required in [
    "// @version      8.8.65",
    "const ANDROID_VERSION = '1.0.58';",
    "async function pomagierSaveJsonNative(",
    "function pomagierBrowserDownload(",
    "const nativeSaved=await pomagierSaveJsonNative(fileName,raw);",
    "if(!nativeSaved) pomagierBrowserDownload(fileName,raw);",
    "pvpEngineScanExportObject()",
    "pomagier_pvp_engine_v2_",
]:
    if required not in s:
        raise SystemExit("REGRESJA: brak " + required)
if "const DUMP_LAB_KEY=" in s or "function dumpLabHTML(" in s:
    raise SystemExit("REGRESJA: Wysypisko Lab zostalo przywrocone")
if "await dumpLabSaveJsonNative(" in s or "dumpLabBrowserDownload(fileName,raw);" in s:
    raise SystemExit("REGRESJA: eksport nadal uzywa usunietego helpera")

js.write_text(s,encoding="utf-8")
g = gradle.read_text(encoding="utf-8")
if "versionCode = 10057" not in g or 'versionName = "1.0.57"' not in g:
    raise SystemExit("Oczekiwano Gradle 1.0.57")
g = g.replace("versionCode = 10057", "versionCode = 10058", 1)
g = g.replace('versionName = "1.0.57"', 'versionName = "1.0.58"', 1)
gradle.write_text(g,encoding="utf-8")

readme = root / "README.md"
if readme.exists():
    r = readme.read_text(encoding="utf-8")
    r += """

## v1.0.58 / userscript 8.8.65 - PvP Engine JSON export fix
- Naprawiono ReferenceError: dumpLabSaveJsonNative is not defined.
- Eksport skanu PvP do JSON zapisuje plik przez AndroidBridge do Pobrane/PomagierByDon.
- Zachowany fallback przegladarkowy i skan read-only.
- Wysypisko Lab pozostaje usuniete.
"""
    readme.write_text(r,encoding="utf-8")
print("OK: Pomagier Android 1.0.58 / userscript 8.8.65")
print("OK: eksport PvP JSON ma niezalezne helpery")
