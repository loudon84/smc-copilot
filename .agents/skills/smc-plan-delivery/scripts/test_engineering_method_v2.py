"""Regression tests for actual v3.7 method and review gates; legacy suite remains separate."""
import json,subprocess,sys,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
sys.path.insert(0,str(HERE.parents[1]/'smc-plan-review/scripts'))
import engineering_method as m
import plan_state,review_record,contract_resolver
from assess_plan_review import classify as review
from build_review_packet import accept,build,snapshot_path
PLAN='''---
plan_contract: smc.plan.v3.7
plan_id: TST
governance_profile: LEAN
todos:
  - id: t1-behavior
    content: "T1 — implement behavior [C01]"
    status: pending
---
# Behavior

## Todo T1 — implement behavior

**Owns Changes**
- C01

**Writes**
- a.txt
- check.py

**Goal**
implement behavior.
'''
class RuntimeV5Tests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.r=Path(self.temp.name)
  subprocess.run(['git','init','-q',str(self.r)],check=True)
  (self.r/'.agents').mkdir();(self.r/'a.txt').write_text('bad',encoding='utf-8')
  (self.r/'check.py').write_text("from pathlib import Path\nassert Path('a.txt').read_text() == 'good'\n",encoding='utf-8')
  self.p=self.r/'p.plan.md';self.p.write_text(PLAN,encoding='utf-8')
  self.cmd='"'+sys.executable+'" check.py'
 def tearDown(self):self.temp.cleanup()
 def cycle(self):
  self.assertEqual(0,m.tdd_run(self.p,'T1','RED',self.cmd)[0])
  (self.r/'a.txt').write_text('good',encoding='utf-8')
  self.assertEqual(0,m.tdd_run(self.p,'T1','GREEN',self.cmd)[0])
 def test_multiline_and_inline_writes(self):
  self.assertEqual(['a.txt','check.py'],m.write_paths(self.p,'T1'))
  self.p.write_text(PLAN.replace('**Writes**\n- a.txt\n- check.py','**Writes:** a.txt, check.py'),encoding='utf-8')
  self.assertEqual(['a.txt','check.py'],m.write_paths(self.p,'T1'))
 def test_actual_cycle_fresh_then_stale(self):
  self.cycle();self.assertEqual(0,m.tdd_check(self.p,'T1')[0])
  (self.r/'check.py').write_text("print('weakened oracle')\n",encoding='utf-8')
  self.assertEqual('TDD_SCOPE_STALE',m.tdd_check(self.p,'T1')[1]['reason'])
 def test_self_declared_events_are_not_proof(self):
  m.tdd_event(self.p,'T1','RED','CONFIRMED',self.cmd)
  m.tdd_event(self.p,'T1','GREEN','PASS',self.cmd)
  self.assertNotEqual(0,m.tdd_check(self.p,'T1')[0])
 def test_unrelated_green_command_rejected(self):
  m.tdd_run(self.p,'T1','RED',self.cmd)
  m.tdd_run(self.p,'T1','GREEN','"'+sys.executable+'" -c "print(1)"')
  self.assertNotEqual(0,m.tdd_check(self.p,'T1')[0])
 def test_receipt_missing_blocks(self):
  self.cycle()
  for f in (m.edir(self.p)/'receipts').glob('*.json'):f.unlink()
  self.assertNotEqual(0,m.tdd_check(self.p,'T1')[0])
 def test_latest_failed_attempt_invalidates_green(self):
  self.cycle();m.tdd_run(self.p,'T1','RED',self.cmd)
  self.assertNotEqual(0,m.tdd_check(self.p,'T1')[0])
 def test_epoch_does_not_resurrect(self):
  a=m.classify(self.p,'T1')['method_epoch']
  self.assertEqual(a,m.classify(self.p,'T1')['method_epoch'])
  m.classify(self.p,'T1',model_override='REASONING')
  self.assertNotEqual(a,m.classify(self.p,'T1')['method_epoch'])
 def test_v1_requires_explicit_migration(self):
  path=m.method_path(self.p,'T1');path.parent.mkdir(parents=True)
  path.write_text(json.dumps({'schema':'smc.execution.engineering-method.v1'}),encoding='utf-8')
  with self.assertRaisesRegex(ValueError,'MIGRATION_REQUIRED'):m.load_method(self.p,'T1')
  m.migrate(self.p,'T1','approved v37 migration')
  self.assertTrue(list((m.edir(self.p)/'history').glob('*.json')))
  loaded=m.load_method(self.p,'T1')
  self.assertEqual(loaded['schema'],'smc.execution.engineering-method.v3')
  self.assertEqual(loaded['profile'],'BOUNDED_BEHAVIOR')
  # BOUNDED_BEHAVIOR uses TDD_PREFERRED (empty ok); force required cycle for gate check.
  m.classify(self.p,'T1',profile_override='BUG_FIX',write=True)
  self.assertNotEqual(0,m.tdd_check(self.p,'T1')[0])
 def test_empty_scope_fails_closed(self):
  self.p.write_text(PLAN.replace('**Writes**','**Reads**'),encoding='utf-8')
  with self.assertRaisesRegex(ValueError,'SCOPE_MISSING'):m.tdd_run(self.p,'T1','RED',self.cmd)
 def test_completion_state_interlock(self):
  # Require focused TDD cycle; keep debug ON_FAILURE so empty debug does not block.
  m.classify(self.p,'T1',profile_override='SENSITIVE_BOUNDED',write=True)
  before=self.p.read_bytes()
  with self.assertRaises(ValueError):plan_state.set_status(self.p,'T1','completed')
  self.assertEqual(before,self.p.read_bytes())
  self.cycle();plan_state.set_status(self.p,'T1','completed')
  self.assertEqual('completed',plan_state.cursor_todos(self.p.read_text(encoding='utf-8'))[0]['status'])
  (self.r/'a.txt').write_text('changed',encoding='utf-8')
  with self.assertRaises(ValueError):m.completion_check(self.p,'T1')
 def test_debug_requires_real_reproduction_and_final_verification(self):
  m.debug_event(self.p,'T1','ROOT_CAUSE','CONFIRMED','cause','invented')
  self.assertNotEqual(0,m.debug_check(self.p,'T1')[0])
  _,rec=m.debug_run(self.p,'T1','REPRODUCTION',self.cmd)
  m.debug_event(self.p,'T1','ROOT_CAUSE','CONFIRMED','bad value in a.txt',rec['evidence_ref'])
  self.assertNotEqual(0,m.debug_check(self.p,'T1')[0])
  (self.r/'a.txt').write_text('good',encoding='utf-8')
  m.debug_run(self.p,'T1','VERIFIED',self.cmd,'PASS')
  self.assertEqual(0,m.debug_check(self.p,'T1')[0])
  m.debug_event(self.p,'T1','FIX_ATTEMPT','FAIL','new failure')
  self.assertNotEqual(0,m.debug_check(self.p,'T1')[0])
 def test_debug_fix_before_root_is_blocked(self):
  m.debug_event(self.p,'T1','FIX_ATTEMPT','PASS','premature')
  _,rec=m.debug_run(self.p,'T1','REPRODUCTION',self.cmd)
  m.debug_event(self.p,'T1','ROOT_CAUSE','CONFIRMED','cause',rec['evidence_ref'])
  (self.r/'a.txt').write_text('good',encoding='utf-8')
  m.debug_run(self.p,'T1','VERIFIED',self.cmd,'PASS')
  self.assertEqual('DEBUG_FIX_BEFORE_ROOT_CAUSE',m.debug_check(self.p,'T1')[1]['reason'])
 def test_stale_revise_cannot_route_none(self):
  review_record.record('plan',self.p,'REVISE','reviewer','fix required')
  self.p.write_text(PLAN+'\nChanged scope.\n',encoding='utf-8')
  self.assertEqual('FULL',review(self.p)['depth'])
  self.assertEqual('FULL',build(self.p,'NONE')['review_depth'])
 def test_snapshot_binding_and_tamper(self):
  review_record.record('plan',self.p,'PASS','reviewer');accept(self.p)
  self.p.write_text(PLAN+'\nSmall change.\n',encoding='utf-8')
  self.assertEqual('DELTA',build(self.p)['review_depth'])
  snapshot_path(self.p).write_text(self.p.read_text(encoding='utf-8'),encoding='utf-8')
  self.assertEqual('FULL',build(self.p)['review_depth'])
 def test_v37_dispatch_and_cursor_content(self):
  self.assertEqual('validate_plan_v37.py',contract_resolver.validator_name('smc.plan.v3.7'))
  self.assertEqual([],plan_state.validate(self.p))
  self.p.write_text(PLAN.replace('    content: "T1 — implement behavior [C01]"\n',''),encoding='utf-8')
  self.assertTrue(plan_state.validate(self.p))
 def test_behavior_cannot_override_to_no_tdd(self):
  with self.assertRaisesRegex(ValueError,'DOWNGRADE_FORBIDDEN'):m.classify(self.p,'T1',profile_override='MECHANICAL',tdd_override='TDD_NOT_APPLICABLE')
 def test_v37_test_asset_reuse_and_staleness(self):
  sys.path.insert(0,str(HERE/'tests'))
  from test_test_assets import TestAssetContractTests,plan_text
  import test_assets
  fixture=TestAssetContractTests();fixture.setUp()
  try:
   text=plan_text('REUSE','| C01 | src/provider.py#approve | PROD | MODIFY | provider | T1 | changed | approval | no |').replace('smc.plan.v3.6','smc.plan.v3.7')
   fixture.plan.write_text(text,encoding='utf-8')
   self.assertEqual([],test_assets.validate_plan(fixture.plan))
   fixture.asset.write_text('changed',encoding='utf-8')
   self.assertIn('TEST_ASSET_DIGEST_STALE',{e['code'] for e in test_assets.validate_plan(fixture.plan)})
  finally:fixture.tearDown()
if __name__=='__main__':unittest.main()
