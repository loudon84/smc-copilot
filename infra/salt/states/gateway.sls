# Windows logon scheduled task owns Gateway lifecycle (Salt, not apps/work).

{% set task_name = pillar.get('smc', {}).get('gateway', {}).get('task_name', 'SMC Hermes Gateway') %}
{% set hermes_home = pillar.get('smc', {}).get('hermes', {}).get('home', '%LOCALAPPDATA%\\hermes') %}

{% if grains.get('os', '') == 'Windows' or grains.get('os_family') == 'Windows' %}

smc_hermes_gateway_task:
  task.present:
    - name: {{ task_name }}
    - force: True
    - action_type: Execute
    - cmd: '{{ hermes_home }}\hermes-agent\venv\Scripts\pythonw.exe'
    - arguments: '-m hermes_cli.main gateway'
    - trigger_type: OnLogon
    - user_name: {{ grains.get('smc_endpoint', {}).get('user', '') or 'System' }}

{% endif %}

hermes_gateway_running:
  smc_hermes.gateway_running:
    - hermes_home: {{ pillar.get('smc', {}).get('hermes', {}).get('home', '') or None }}
