#!/usr/bin/env python3
"""GES 5 Engineering Method Runtime v2: deterministic routing + content-bound TDD/debug evidence."""
from __future__ import annotations
import argparse,hashlib,json,re,subprocess,sys,uuid
from pathlib import Path
from common import append_jsonl, atomic_write, find_repo_root, plan_id, read_jsonl, semantic_plan_sha256, utc_now
_git_repo_root = find_repo_root
def find_repo_root(path):
 # Avoid repeated git subprocesses inside one gate; walk current filesystem on every call.
 p=Path(path).resolve()
 for candidate in (p.parent,*p.parents):
  if (candidate/'.git').exists():return candidate
 return _git_repo_root(path)
PROFILES={'MECHANICAL','BOUNDED_BEHAVIOR','SENSITIVE_BOUNDED','BUG_FIX','HIGH_RISK','BEHAVIOR_CHANGE'}
CANONICAL_PROFILES={'MECHANICAL','BOUNDED_BEHAVIOR','SENSITIVE_BOUNDED','BUG_FIX','HIGH_RISK'}
PROFILE_ALIASES={'BEHAVIOR_CHANGE':'BOUNDED_BEHAVIOR'}
TDD={'TDD_REQUIRED','TDD_PREFERRED','TDD_NOT_APPLICABLE','TDD_FOCUSED_REQUIRED'}
DEBUG={'REQUIRED','ON_FAILURE'};MODELS={'FAST','STANDARD','REASONING'};REVIEWS={'UNIFIED','INDEPENDENT'}
METHOD_SCHEMA='smc.execution.engineering-method.v3'
METHOD_SCHEMA_LEGACY='smc.execution.engineering-method.v2'
# Keyword hints only — never alone sufficient for HIGH_RISK (v5.0.6).
HIGH=('auth','authentication','authorization','security','trust boundary','migration','schema','protocol','public api','public contract','concurrency','race','deadlock','idempot','lease','distributed','live','fault','external')
BUG=('bug','fix','regression','failure','failing','error','incorrect','broken','crash','timeout','unexpected','defect')
MECH=('config','configuration','constant','rename','metadata','docs','documentation','comment','generated','version bump','copy','mirror','typo')
BEHAV=('behavior','behaviour','feature','implement','add','support','validate','validation','retry','state transition','endpoint','handler')
NO_TDD=('docs','documentation','comment','generated','metadata','configuration','config','version bump','mirror','typo')
SENSITIVE=('logout','session clear','token clear','credential display','auth state read','existing logout')
BOUNDARY_CHANGE=('new owner','ownership transfer','security boundary change','auth protocol','token ownership','schema migration','breaking protocol','public contract change')


def canon(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def digest(v):return hashlib.sha256(canon(v)).hexdigest()
def norm(todo):
 t=todo.strip().upper()
 if not re.fullmatch(r'T\d+',t):raise ValueError(f'ENGINEERING_TODO_INVALID: {todo}')
 return t
def run_dir(plan):return find_repo_root(plan)/'.smc/runs'/plan_id(plan)
def edir(plan):return run_dir(plan)/'engineering'
def method_path(plan,t):return edir(plan)/f'{norm(t)}-method.json'
def tdd_path(plan,t):return edir(plan)/f'{norm(t)}-tdd.jsonl'
def debug_path(plan,t):return edir(plan)/f'{norm(t)}-debug.jsonl'
def fm(text):
 out={};lines=text.splitlines()
 if not lines or lines[0].strip()!='---':return out
 for line in lines[1:]:
  if line.strip()=='---':break
  if line and not line[0].isspace() and ':' in line:
   k,v=line.split(':',1);out[k.strip()]=v.strip().strip('"\'')
 return out
def todo_slice(plan,todo):
 tid=norm(todo);text=plan.read_text(encoding='utf-8');ms=list(re.finditer(r'^##\s+Todo\s+(T\d+)\b(.*)$',text,re.M|re.I))
 for i,m in enumerate(ms):
  if m.group(1).upper()==tid:
   end=ms[i+1].start() if i+1<len(ms) else len(text);return re.sub(r'^[\s—:\-]+','',m.group(2)).strip(),text[m.end():end].strip()
 raise ValueError(f'ENGINEERING_TODO_NOT_FOUND: {tid}')
def tokens(text,items):
 lo=text.lower();return sorted({x for x in items if x in lo})
def write_paths(plan,todo):
 _,body=todo_slice(plan,todo)
 m=re.search(r'^\*\*Writes(?::\*\*|\*\*:?)\s*([^\n]*)(.*?)(?=^\*\*|^##|\Z)',body,re.M|re.S|re.I)
 if not m:raise ValueError('ENGINEERING_WRITE_SCOPE_MISSING')
 vals=[]
 for raw in re.split(r'[,;\n]',m.group(1)+m.group(2)):
  x=re.sub(r'^\s*[-*]\s+', '',raw).strip().strip('`');x=x.split('#',1)[0].strip()
  if not x or x.lower() in {'-','none','n/a'}:continue
  x=x.replace('\\','/');p=Path(x)
  if p.is_absolute() or '..' in p.parts or any(c in x for c in '*?<>') or not (find_repo_root(plan)/p).resolve().is_relative_to(find_repo_root(plan).resolve()):raise ValueError('ENGINEERING_WRITE_SCOPE_INVALID: '+x)
  vals.append(x)
 if not vals:raise ValueError('ENGINEERING_WRITE_SCOPE_EMPTY')
 return sorted(set(vals))
def scope_fingerprint(plan,todo):
 repo=find_repo_root(plan);rows=[]
 from workspace import planned_files
 for rel in sorted(set(write_paths(plan,todo)) | planned_files(plan)):
  p=repo/rel
  if not p.resolve().is_relative_to(repo.resolve()):raise ValueError('ENGINEERING_SCOPE_OUTSIDE_REPO')
  if p.is_file():h=hashlib.sha256(p.read_bytes()).hexdigest();state='file'
  elif p.is_dir():h=digest([(x.relative_to(p).as_posix(),hashlib.sha256(x.read_bytes()).hexdigest()) for x in sorted(p.rglob('*')) if x.is_file() and '__pycache__' not in x.parts]);state='directory'
  elif p.exists():raise ValueError('ENGINEERING_SCOPE_TYPE_INVALID')
  else:h='';state='missing'
  rows.append({'path':rel,'state':state,'sha256':h})
 return 'sha256:'+digest(rows)
def structured_signals(plan,todo):
 # @lat: [[frontend-context#Engineering Method v3]]
 text=plan.read_text(encoding='utf-8');meta=fm(text);title,body=todo_slice(plan,todo);local=title+'\n'+body
 return {
  'governance_profile':meta.get('governance_profile','FULL').upper(),
  'live_or_fault':bool(re.search(r'\b(LIVE|FAULT|EXTERNAL)\b',local,re.I)),
  # Hard boundary change — not mere keyword presence of auth/security.
  'boundary':bool(re.search(
   r'(security|auth|trust)\s+boundary\s+change|token\s+owner(ship)?\s+(change|transfer)|'
   r'public\s+(api|contract)\s+change|breaking\s+protocol|ownership\s+transfer|new\s+owner',
   local,re.I)),
  'lifecycle':bool(re.search(r'\bschema\s+migration\b|\bdata\s+migration\b|concurr.*lease|idempot.*change',local,re.I)),
  'sensitive_bounded':bool(tokens(local,SENSITIVE)) or bool(re.search(
   r'\b(logout|session\s+clear|existing\s+auth|display\s+email|hide\s+profile)\b',local,re.I)),
  'bug':bool(tokens(local,BUG)),
  'write_count':len(write_paths(plan,todo)),
  'keyword_high_hint':bool(tokens(local,HIGH)),
 }
def _normalize_profile(name):
 name=name.upper()
 return PROFILE_ALIASES.get(name,name)
def classify(plan,todo,profile_override='AUTO',tdd_override='AUTO',debug_override='AUTO',model_override='AUTO',review_override='AUTO',write=True,risk_facts=None):
 # @lat: [[frontend-context#Engineering Method v3]]
 tid=norm(todo);title,body=todo_slice(plan,tid);src=title+'\n'+body;s=structured_signals(plan,tid)
 high=tokens(src,HIGH);bugs=tokens(src,BUG);mech=tokens(src,MECH);beh=tokens(src,BEHAV);no=tokens(src,NO_TDD)
 ov=_normalize_profile(profile_override) if profile_override.upper()!='AUTO' else 'AUTO'
 if ov!='AUTO' and ov not in CANONICAL_PROFILES:raise ValueError(f'ENGINEERING_PROFILE_INVALID: {ov}')
 # Priority: structured signal > domain/risk facts > keyword hint
 hard_from_facts=False
 if isinstance(risk_facts,dict):
  hard_from_facts=any(risk_facts.get(k) is True for k in (
   'security_boundary_change','public_contract_change','new_owner','schema_migration',
   'protocol_change','ownership_transfer','external_live_acceptance','security_boundary'))
  if risk_facts.get('security_boundary_change') is False and risk_facts.get('security_sensitive_touch') is True:
   hard_from_facts=False
 if ov!='AUTO':profile,reason,source=ov,'explicit controller override','override'
 elif s['live_or_fault'] or s['boundary'] or s['lifecycle'] or hard_from_facts:
  profile,reason,source='HIGH_RISK','structured hard-boundary / live signal','structured'
 elif s['bug'] or bugs:profile,reason,source='BUG_FIX','bug/failure signal','structured'
 elif s['sensitive_bounded']:profile,reason,source='SENSITIVE_BOUNDED','sensitive existing-capability touch','structured'
 elif mech and not beh:profile,reason,source='MECHANICAL','mechanical change signal','heuristic'
 else:profile,reason,source='BOUNDED_BEHAVIOR','bounded behavior / default','structured'
 # Keyword-only HIGH hints must NOT force HIGH_RISK.
 if profile=='MECHANICAL':tdd='TDD_NOT_APPLICABLE' if no else 'TDD_PREFERRED';debug='ON_FAILURE';model='FAST';review='UNIFIED'
 elif profile=='BUG_FIX':tdd='TDD_REQUIRED';debug='REQUIRED';model='STANDARD';review='UNIFIED'
 elif profile=='HIGH_RISK':tdd='TDD_REQUIRED';debug='REQUIRED' if (bugs or s['bug']) else 'ON_FAILURE';model='REASONING';review='INDEPENDENT'
 elif profile=='SENSITIVE_BOUNDED':tdd='TDD_FOCUSED_REQUIRED';debug='ON_FAILURE';model='STANDARD';review='UNIFIED'
 else:tdd='TDD_PREFERRED';debug='ON_FAILURE';model='STANDARD';review='UNIFIED'
 def choose(v,allowed,current,label):
  v=v.upper()
  if v=='AUTO':return current
  if v=='BEHAVIOR_CHANGE':v='BOUNDED_BEHAVIOR'
  if v not in allowed:raise ValueError(f'{label}_INVALID: {v}')
  return v
 tdd=choose(tdd_override,TDD,tdd,'TDD_POLICY');debug=choose(debug_override,DEBUG,debug,'DEBUG_POLICY');model=choose(model_override,MODELS,model,'MODEL_TIER');review=choose(review_override,REVIEWS,review,'REVIEW_DEPTH')
 seed={'plan_semantic_sha256':semantic_plan_sha256(plan),'todo':tid,'profile':profile,'tdd_policy':tdd,'debugging_policy':debug,'model_tier':model,'review_depth':review}
 hard_structured=s['live_or_fault'] or s['boundary'] or s['lifecycle'] or hard_from_facts
 if hard_structured and (profile!='HIGH_RISK' or tdd!='TDD_REQUIRED' or review!='INDEPENDENT'):raise ValueError('ENGINEERING_RISK_DOWNGRADE_FORBIDDEN')
 if profile in {'BUG_FIX'} and tdd!='TDD_REQUIRED':raise ValueError('ENGINEERING_TDD_DOWNGRADE_FORBIDDEN')
 if profile=='SENSITIVE_BOUNDED' and tdd not in {'TDD_FOCUSED_REQUIRED','TDD_REQUIRED'}:raise ValueError('ENGINEERING_TDD_DOWNGRADE_FORBIDDEN')
 if profile=='MECHANICAL' and (not mech or beh or bugs):raise ValueError('ENGINEERING_PROFILE_DOWNGRADE_FORBIDDEN')
 if (bugs or s['bug']) and debug!='REQUIRED':raise ValueError('ENGINEERING_DEBUG_DOWNGRADE_FORBIDDEN')
 old=json.loads(method_path(plan,tid).read_text(encoding='utf-8')) if method_path(plan,tid).is_file() else {}
 if old and old.get('schema') not in {METHOD_SCHEMA,METHOD_SCHEMA_LEGACY}:raise ValueError('ENGINEERING_METHOD_MIGRATION_REQUIRED')
 # Migrate legacy BEHAVIOR_CHANGE profile name in-place for seed compare.
 if old.get('profile')=='BEHAVIOR_CHANGE':
  old=dict(old);old['profile']='BOUNDED_BEHAVIOR'
 epoch=old.get('method_epoch') if old and all(old.get(k)==v for k,v in seed.items()) else uuid.uuid4().hex
 result={'schema':METHOD_SCHEMA,'plan_id':plan_id(plan),**seed,'method_epoch':epoch,'classification_source':source,'reason':reason,'signals':{'structured':s,'high_risk':high,'bug':bugs,'mechanical':mech,'behavior':beh,'no_tdd':no,'keyword_hint_only':bool(high) and not hard_structured},'title':title,'updated_at':utc_now(),'working_memory_only':True}
 if write:atomic_write(method_path(plan,tid),json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
 return result
def load_method(plan,todo):
 p=method_path(plan,todo)
 if not p.is_file():return classify(plan,todo)
 try:v=json.loads(p.read_text(encoding='utf-8'))
 except Exception as e:raise ValueError(f'ENGINEERING_METHOD_INVALID: {p}') from e
 if v.get('schema') not in {METHOD_SCHEMA,METHOD_SCHEMA_LEGACY}:raise ValueError('ENGINEERING_METHOD_MIGRATION_REQUIRED')
 if v.get('plan_id')!=plan_id(plan):raise ValueError('ENGINEERING_METHOD_PLAN_ID_MISMATCH')
 if v.get('plan_semantic_sha256')!=semantic_plan_sha256(plan):raise ValueError(f'ENGINEERING_METHOD_PLAN_STALE: {p}; rerun classify')
 if v.get('profile')=='BEHAVIOR_CHANGE':
  v=dict(v);v['profile']='BOUNDED_BEHAVIOR'
 return v
def base_event(plan,todo,schema):
 m=load_method(plan,todo);return {'schema':schema,'at':utc_now(),'plan_id':plan_id(plan),'plan_semantic_sha256':m['plan_semantic_sha256'],'todo':norm(todo),'method_epoch':m['method_epoch'],'scope_fingerprint':scope_fingerprint(plan,todo),'working_memory_only':True,'final_verification':False}
def run_command(plan,cmd):
 r=subprocess.run(cmd,cwd=find_repo_root(plan),shell=True,text=True,encoding='utf-8',errors='replace',capture_output=True)
 output=(r.stdout or '')+(r.stderr or '');return r.returncode,hashlib.sha256(output.encode()).hexdigest(),output[-4000:]
def tdd_event(plan,todo,phase,status,command='',note='',exit_code=None,output_sha256=''):
 phase=phase.upper();status=status.upper()
 if phase not in {'RED','GREEN','REFACTOR'}:raise ValueError(f'TDD_PHASE_INVALID: {phase}')
 rec=base_event(plan,todo,'smc.execution.tdd-event.v2');rec.update({'phase':phase,'status':status,'command':command.strip(),'exit_code':exit_code,'output_sha256':output_sha256,'note':re.sub(r'\s+',' ',note.strip())[:1000]});append_jsonl(tdd_path(plan,todo),rec);return rec
def tdd_run(plan,todo,phase,command):
 phase=phase.upper()
 if phase not in {'RED','GREEN','REFACTOR'} or not command.strip():raise ValueError('TDD_COMMAND_INVALID')
 before=scope_fingerprint(plan,todo);code,oh,tail=run_command(plan,command)
 if before!=scope_fingerprint(plan,todo):raise ValueError('TDD_COMMAND_CHANGED_SOURCE')
 status=('CONFIRMED' if code!=0 else 'FAIL') if phase=='RED' else ('PASS' if code==0 else 'FAIL')
 rec=tdd_event(plan,todo,phase,status,command,tail,code,oh);save_receipt(plan,rec);return (0 if status in {'CONFIRMED','PASS'} else 2),rec
def save_receipt(plan,rec):
 atomic_write(edir(plan)/'receipts'/(digest(rec)+'.json'),json.dumps(rec,sort_keys=True)+'\n')
def command_evidence(plan,rec):
 p=edir(plan)/'receipts'/(digest(rec)+'.json')
 return bool(rec.get('command') and type(rec.get('exit_code')) is int and re.fullmatch('[0-9a-f]{64}',rec.get('output_sha256','')) and p.is_file() and json.loads(p.read_text(encoding='utf-8'))==rec)
def current_rows(plan,todo,path):
 m=load_method(plan,todo);return [r for r in read_jsonl(path) if r.get('plan_semantic_sha256')==m['plan_semantic_sha256'] and r.get('method_epoch')==m['method_epoch']]
def tdd_check(plan,todo):
 tid=norm(todo);m=load_method(plan,tid);policy=m['tdd_policy'];rows=current_rows(plan,tid,tdd_path(plan,tid))
 if policy=='TDD_NOT_APPLICABLE':return 0,{'status':'PASS','reason':'TDD_NOT_APPLICABLE','todo':tid}
 if policy=='TDD_PREFERRED' and not rows:return 0,{'status':'PASS','reason':'TDD_PREFERRED_NOT_USED','todo':tid}
 # TDD_FOCUSED_REQUIRED and TDD_REQUIRED both need a fresh RED→GREEN cycle.
 state='NEW';last_success=None;red_command=None
 for r in rows:
  ph,st=r.get('phase'),r.get('status')
  if not command_evidence(plan,r):state='BLOCKED';last_success=None;continue
  if ph=='RED' and st=='CONFIRMED' and r['exit_code']!=0:state='RED';last_success=None;red_command=r['command']
  elif ph=='GREEN' and st=='PASS' and r['exit_code']==0 and state=='RED' and r['command']==red_command:state='GREEN';last_success=r
  elif ph=='REFACTOR' and st=='PASS' and r['exit_code']==0 and state in {'GREEN','REFACTOR'} and r['command']==red_command:state='REFACTOR';last_success=r
  else:state='BLOCKED';last_success=None
 if state not in {'GREEN','REFACTOR'} or not last_success:return 2,{'status':'BLOCKED','reason':'TDD_CYCLE_INCOMPLETE','todo':tid,'state':state}
 cur=scope_fingerprint(plan,tid)
 if last_success.get('scope_fingerprint')!=cur:return 2,{'status':'BLOCKED','reason':'TDD_SCOPE_STALE','todo':tid,'expected':cur,'actual':last_success.get('scope_fingerprint')}
 reason='TDD_FOCUSED_CYCLE_FRESH' if policy=='TDD_FOCUSED_REQUIRED' else 'TDD_CYCLE_FRESH'
 return 0,{'status':'PASS','reason':reason,'todo':tid,'state':state,'method_epoch':m['method_epoch']}
def debug_event(plan,todo,phase,status,summary='',evidence_ref='',command='',exit_code=None,output_sha256=''):
 phase=phase.upper();status=status.upper()
 if phase not in {'REPRODUCTION','ROOT_CAUSE','PATTERN','HYPOTHESIS','FIX_ATTEMPT','VERIFIED'}:raise ValueError(f'DEBUG_PHASE_INVALID: {phase}')
 rec=base_event(plan,todo,'smc.execution.debug-event.v2');rec.update({'phase':phase,'status':status,'summary':re.sub(r'\s+',' ',summary.strip())[:1200],'evidence_ref':evidence_ref.strip(),'command':command.strip(),'exit_code':exit_code,'output_sha256':output_sha256});append_jsonl(debug_path(plan,todo),rec);return rec
def debug_run(plan,todo,phase,command,expect='FAIL'):
 if phase.upper() not in {'REPRODUCTION','VERIFIED','FIX_ATTEMPT'}:raise ValueError('DEBUG_COMMAND_PHASE_INVALID')
 before=scope_fingerprint(plan,todo);code,oh,tail=run_command(plan,command)
 if before!=scope_fingerprint(plan,todo):raise ValueError('DEBUG_COMMAND_CHANGED_SOURCE')
 expect=expect.upper();ok=(code!=0) if expect=='FAIL' else (code==0);status='PASS' if ok else 'FAIL';rec=debug_event(plan,todo,phase,status,tail,'command:'+oh,command,code,oh);save_receipt(plan,rec);return (0 if ok else 2),rec
def debug_check(plan,todo):
 tid=norm(todo);m=load_method(plan,tid);rows=current_rows(plan,tid,debug_path(plan,tid));fails=sum(1 for r in rows if r.get('phase')=='FIX_ATTEMPT' and r.get('status')=='FAIL')
 if fails>=3:return 3,{'status':'ESCALATE','reason':'DEBUG_ARCHITECTURE_ESCALATION','todo':tid,'failed_fix_attempts':fails}
 if m['debugging_policy']=='ON_FAILURE' and not rows:return 0,{'status':'PASS','reason':'DEBUG_NOT_TRIGGERED','todo':tid}
 reproductions={r.get('evidence_ref'):(i,r) for i,r in enumerate(rows) if r.get('phase')=='REPRODUCTION' and r.get('status')=='PASS' and r.get('exit_code')!=0 and command_evidence(plan,r)}
 roots=[i for i,r in enumerate(rows) if r.get('phase')=='ROOT_CAUSE' and r.get('status')=='CONFIRMED' and r.get('summary') and r.get('evidence_ref') in reproductions and reproductions[r['evidence_ref']][0]<i and r.get('scope_fingerprint')==reproductions[r['evidence_ref']][1].get('scope_fingerprint')]
 if not roots:return 2,{'status':'BLOCKED','reason':'DEBUG_ROOT_CAUSE_EVIDENCE_REQUIRED','todo':tid}
 if any(i<roots[0] for i,r in enumerate(rows) if r.get('phase')=='FIX_ATTEMPT'):return 2,{'status':'BLOCKED','reason':'DEBUG_FIX_BEFORE_ROOT_CAUSE','todo':tid}
 last=rows[-1]
 if last.get('phase')!='VERIFIED' or last.get('status')!='PASS' or last.get('exit_code')!=0 or not command_evidence(plan,last):return 2,{'status':'BLOCKED','reason':'DEBUG_VERIFICATION_REQUIRED','todo':tid}
 if last.get('scope_fingerprint')!=scope_fingerprint(plan,tid):return 2,{'status':'BLOCKED','reason':'DEBUG_SCOPE_STALE','todo':tid}
 return 0,{'status':'PASS','reason':'DEBUG_VERIFIED_FRESH','todo':tid,'failed_fix_attempts':fails}
def completion_check(plan,todo):
 for check in (tdd_check,debug_check):
  rc,result=check(plan,todo)
  if rc:raise ValueError(result['reason']+': '+norm(todo))
def migrate(plan,todo,reason):
 if not reason.strip():raise ValueError('ENGINEERING_MIGRATION_REASON_REQUIRED')
 path=method_path(plan,todo)
 if path.is_file():
  old=json.loads(path.read_text(encoding='utf-8'))
  atomic_write(edir(plan)/'history'/(norm(todo)+'-'+uuid.uuid4().hex+'.json'),json.dumps({'reason':reason,'prior_method':old,'at':utc_now()},sort_keys=True)+'\n')
  path.unlink()
 return classify(plan,todo)

# Old contracts keep their existing method API and evidence semantics.
import engineering_method_v1 as _v1
def _dispatch(name,modern):
 def call(plan,*args,**kwargs):
  target=modern if fm(plan.read_text(encoding='utf-8')).get('plan_contract')=='smc.plan.v3.7' else getattr(_v1,name)
  return target(plan,*args,**kwargs)
 return call
for _name in ('classify','load_method','tdd_event','tdd_run','tdd_check','debug_event','debug_run','debug_check'):
 globals()[_name]=_dispatch(_name,globals()[_name])
def emit(o):print(json.dumps(o,ensure_ascii=False,indent=2,sort_keys=True))
def main():
 ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest='cmd',required=True)
 p=sub.add_parser('migrate');p.add_argument('plan',type=Path);p.add_argument('--todo',required=True);p.add_argument('--reason',required=True)
 p=sub.add_parser('classify');p.add_argument('plan',type=Path);p.add_argument('--todo',required=True);p.add_argument('--profile',default='AUTO');p.add_argument('--tdd',default='AUTO');p.add_argument('--debug',default='AUTO');p.add_argument('--model',default='AUTO');p.add_argument('--review',default='AUTO')
 for n in ('tdd-check','debug-check','show'):
  p=sub.add_parser(n);p.add_argument('plan',type=Path);p.add_argument('--todo',required=True)
 p=sub.add_parser('tdd-event');p.add_argument('plan',type=Path);p.add_argument('--todo',required=True);p.add_argument('--phase',required=True);p.add_argument('--status',required=True);p.add_argument('--command',default='');p.add_argument('--note',default='')
 p=sub.add_parser('tdd-run');p.add_argument('plan',type=Path);p.add_argument('--todo',required=True);p.add_argument('--phase',required=True);p.add_argument('--command',required=True)
 p=sub.add_parser('debug-event');p.add_argument('plan',type=Path);p.add_argument('--todo',required=True);p.add_argument('--phase',required=True);p.add_argument('--status',required=True);p.add_argument('--summary',default='');p.add_argument('--evidence-ref',default='')
 p=sub.add_parser('debug-run');p.add_argument('plan',type=Path);p.add_argument('--todo',required=True);p.add_argument('--phase',required=True);p.add_argument('--command',required=True);p.add_argument('--expect',choices=('PASS','FAIL'),default='FAIL')
 a=ap.parse_args();plan=a.plan.resolve()
 try:
  if a.cmd=='migrate':emit(migrate(plan,a.todo,a.reason));return 0
  if a.cmd=='classify':emit(classify(plan,a.todo,profile_override=a.profile,tdd_override=a.tdd,debug_override=a.debug,model_override=a.model,review_override=a.review));return 0
  if a.cmd=='tdd-event':emit(tdd_event(plan,a.todo,a.phase,a.status,a.command,a.note));return 0
  if a.cmd=='tdd-run':rc,o=tdd_run(plan,a.todo,a.phase,a.command);emit(o);return rc
  if a.cmd=='debug-event':emit(debug_event(plan,a.todo,a.phase,a.status,a.summary,a.evidence_ref));return 0
  if a.cmd=='debug-run':rc,o=debug_run(plan,a.todo,a.phase,a.command,a.expect);emit(o);return rc
  if a.cmd=='tdd-check':rc,o=tdd_check(plan,a.todo);emit(o);return rc
  if a.cmd=='debug-check':rc,o=debug_check(plan,a.todo);emit(o);return rc
  emit(load_method(plan,a.todo));return 0
 except ValueError as e:emit({'status':'ERROR','reason':str(e)});return 2
if __name__=='__main__':raise SystemExit(main())
