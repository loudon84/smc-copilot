import json,sys,tempfile,unittest
from pathlib import Path
from prd_profile import scan
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'smc-work-router/scripts'))
from work_router import REQUIRED,RISKS
def fixture(profile='FULL'):
 facts={**dict.fromkeys(REQUIRED,True),**dict.fromkeys(RISKS,False),'governed':True}
 return '---\ngovernance_profile: '+profile+'\ngrounded_commit: abcdef01234567\n---\n'+''.join('## '+h+'\n\nExisting grounded scope.\n\n' for h in ('Objective','Out of Scope','Production Owner','Change Classification','Acceptance Criteria','Source Anchors'))+'## Routing Facts\n\n'+json.dumps(facts)+'\n'
class PRDTests(unittest.TestCase):
 def check(self,text):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'prd.md';p.write_text(text,encoding='utf-8');return scan(p)
 def test_empty_lean_rejected(self):self.assertFalse(self.check('---\ngovernance_profile: LEAN\n---\n')['valid'])
 def test_explicit_lean_passes(self):self.assertTrue(self.check(fixture('LEAN'))['valid'])
 def test_full_with_minimum_passes(self):self.assertTrue(self.check(fixture())['valid'])
 def test_open_high_blocks(self):self.assertFalse(self.check(fixture()+'\n## Clarification Ledger\n\n| ID | Impact | Status |\n|---|---|---|\n| Q1 | HIGH | OPEN |\n')['valid'])
 def test_no_downgrade(self):self.assertFalse(self.check(fixture('LEAN').replace('grounded_commit:','previous_governance_profile: FULL\ngrounded_commit:'))['valid'])
 def test_unknown_risk_full(self):self.assertFalse(self.check(fixture('LEAN').replace('"live_acceptance": false','"live_acceptance": null'))['valid'])
if __name__=='__main__':unittest.main()
