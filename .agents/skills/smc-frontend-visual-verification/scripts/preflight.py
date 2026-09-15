#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,sys
from pathlib import Path

def find_root(p:Path):
    q=p.resolve();q=q.parent if q.is_file() else q
    for c in (q,*q.parents):
        if (c/'.agents/ges/profile.json').is_file():return c
    raise ValueError('FRONTEND_PROFILE_NOT_FOUND')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('plan',type=Path);ap.add_argument('--require',action='append',default=[]);ap.add_argument('--json',action='store_true');a=ap.parse_args()
    try:
        root=find_root(a.plan);profile=json.loads((root/'.agents/ges/profile.json').read_text(encoding='utf-8'));commands=profile.get('quality_commands',{})
        required=a.require or ['lint','typecheck','unit']
        missing=[x for x in required if not commands.get(x)]
        payload={"pass":not missing,"required":required,"missing":missing,"commands":{x:commands.get(x) for x in required}}
    except Exception as exc:
        payload={"pass":False,"required":a.require,"missing":[],"error":str(exc)}
    print(json.dumps(payload,ensure_ascii=False,indent=2) if a.json else ("FRONTEND_PREFLIGHT PASS" if payload['pass'] else f"FRONTEND_PREFLIGHT_BLOCKED: {payload}"))
    return 0 if payload['pass'] else 2
if __name__=='__main__':raise SystemExit(main())
