from pathlib import Path
import sys, shutil
site = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd()
public=site/"public"
if not public.is_dir():
    raise SystemExit("ERROR: Run in project root (must have a public folder), or provide path to project root.")
names = ['15-minute-typing-test.html', '35-wpm-typing-challenge.html', '35-wpm-typing-test.html', 'english-typing-test.html', 'government-exam-typing-practice.html', 'hindi-typing-test.html', 'railway-typing-test.html', 'ssc-typing-test.html', 'typing-accuracy-calculator.html', 'typing-test.html', 'up-police-computer-operator-typing-practice-guide.html', 'up-police-computer-operator-typing-test.html', 'up-police-typing-test.html', 'uppco-typing-test.html', 'wpm-calculator.html']
insert = '<link rel="stylesheet" href="/seo-brand.css"><script defer src="/seo-brand.js"></script>'
missing=[name for name in names if not (public/name).is_file()]
if missing:
    raise SystemExit("STOP: Missing HTML files: "+", ".join(missing)+"\\nNo changes have been made.")
for name in names:
    p=public/name
    text=p.read_text(encoding="utf-8")
    if insert not in text and "</head>" not in text.lower():
        raise SystemExit("STOP: missing </head> in "+name)
print("Checking complete. Creating backups and applying styling...")
for name in names:
    p=public/name
    t=p.read_text(encoding="utf-8")
    if insert in t:
        print("Already patched:",name)
        continue
    backup=p.with_suffix(p.suffix+".branding-backup")
    if not backup.exists(): shutil.copy2(p,backup)
    idx=t.lower().index("</head>")
    p.write_text(t[:idx]+insert+t[idx:], encoding="utf-8")
    print("Updated:",name)
for name in ("seo-brand.css","seo-brand.js"):
    src=Path(__file__).resolve().parent/"public"/name
    shutil.copy2(src,public/name)
print("DONE. 15 HTML files patched and 2 shared files copied; server/database untouched.")
