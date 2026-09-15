"""Single contract-to-validator resolver shared by Delivery runtime gates."""
from __future__ import annotations
from pathlib import Path
CURRENT_PLAN_CONTRACT='smc.plan.v3.7'
VALIDATORS={
 'smc.plan.v3.3':'validate_plan_v33.py',
 'smc.plan.v3.4':'validate_plan_v34.py',
 'smc.plan.v3.5':'validate_plan_v35.py',
 'smc.plan.v3.6':'validate_plan_v36.py',
 'smc.plan.v3.7':'validate_plan_v37.py',
}
def validator_name(contract):return VALIDATORS.get(contract)
def validator_path(root:Path,contract:str):
 n=validator_name(contract);return root/'.agents/skills/smc-plan-validator/scripts'/n if n else None
