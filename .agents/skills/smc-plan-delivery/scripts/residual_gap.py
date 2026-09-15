#!/usr/bin/env python3
"""Write content-bound Residual Gap Packet after Completion Audit without editing the Plan."""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
from common import atomic_write,find_repo_root,plan_id,semantic_plan_sha256,utc_now
ALLOWED={'missing','partial','contradicts','unrequested'};SEV={'CRITICAL','HIGH','MEDIUM','LOW'}
def scope(plan):
 repo=find_repo_root(plan);text=plan.read_text(encoding='utf-8');paths=[]
 import re
 sec=re.search(r'^##\s+Change Matrix\s*$\n?(.*?)(?=^##\s+|\Z)',text,re.M|re.S)
 if sec:
  for m in re.finditer(r'`?([^|`\s]+(?:\.[A-Za-z0-9]+))(?:#[^|`]*)?`?',sec.group(1)):
   rel=m.group(1).replace('\\','/');p=repo/rel
   if p.is_file():paths.append((rel,hashlib.sha256(p.read_bytes()).hexdigest()))
 return 'sha256:'+hashlib.sha256(json.dumps(sorted(set(paths)),separators=(',',':')).encode()).hexdigest()
def write_packet(plan,inp):
 data=json.loads(inp.read_text(encoding='utf-8'));rows=data if isinstance(data,list) else data.get('gaps',[]);gaps=[]
 for i,r in enumerate(rows,1):
  typ=str(r.get('type','partial')).lower();sev=str(r.get('severity','HIGH')).upper()
  if typ not in ALLOWED or sev not in SEV:raise ValueError(f'RESIDUAL_GAP_INVALID: {i}')
  gaps.append({'id':str(r.get('id') or f'G{i:02d}'),'source':str(r.get('source','')),'type':typ,'severity':sev,'evidence':str(r.get('evidence','')),'suggested_action':str(r.get('suggested_action','PLAN_REVISE'))})
 out={'schema':'smc.delivery.residual-gap.v1','plan_id':plan_id(plan),'plan_semantic_sha256':semantic_plan_sha256(plan),'scope_fingerprint':scope(plan),'created_at':utc_now(),'result':'GAPS_FOUND' if gaps else 'CONVERGED','gaps':gaps}
 p=find_repo_root(plan)/'.smc/runs'/plan_id(plan)/'completion'/'residual-gaps.json';atomic_write(p,json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True)+'\n');return p,out
def main():
 ap=argparse.ArgumentParser();ap.add_argument('plan',type=Path);ap.add_argument('--input',required=True,type=Path);a=ap.parse_args();p,o=write_packet(a.plan.resolve(),a.input.resolve());print(json.dumps({'path':str(p),**o},ensure_ascii=False,indent=2));return 3 if o['gaps'] else 0
if __name__=='__main__':raise SystemExit(main())
