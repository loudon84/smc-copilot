# Gateway wrapper + OnLogon task. Bound Windows user only — never System.

{% set smc = pillar.get('smc', {}) %}
{% set endpoint_id = smc.get('endpoint_id', '') %}
{% set hermes_home = smc.get('hermes', {}).get('home', '') %}
{% set windows_account = smc.get('user', {}).get('windows_account', '') %}
{% set task_name = smc.get('gateway', {}).get('task_name', 'SMC Hermes Gateway') %}
{% set program_data = salt['environ.get']('ProgramData', 'C:/ProgramData') %}

{% if windows_account and windows_account|lower not in ['system', 'nt authority\\system', 'localsystem'] and endpoint_id %}

smc_hermes_gateway_wrapper:
  smc_hermes.gateway_wrapper_present:
    - endpoint_id: {{ endpoint_id | tojson }}
    - hermes_home: {{ hermes_home | tojson }}
    - windows_account: {{ windows_account | tojson }}
    - program_data: {{ program_data | tojson }}

{% if grains.get('os', '') == 'Windows' or grains.get('os_family') == 'Windows' %}
smc_hermes_gateway_task:
  task.present:
    - name: {{ task_name | tojson }}
    - force: True
    - action_type: Execute
    - cmd: '{{ program_data }}\SMC\bin\hermes-gateway-{{ endpoint_id }}.cmd'
    - trigger_type: OnLogon
    - user_name: {{ windows_account | tojson }}
    - require:
      - smc_hermes: smc_hermes_gateway_wrapper
{% endif %}

hermes_gateway_running:
  smc_hermes.gateway_running:
    - hermes_home: {{ hermes_home | tojson }}
    - require:
      - smc_hermes: smc_hermes_gateway_wrapper

{% else %}

smc_hermes_waiting_user_binding:
  test.show_notification:
    - text: "waiting_user_binding: refuse System Gateway; wait for EndpointUserBinding pillar"

{% endif %}
