{% set smc = pillar.get('smc', {}) %}
{% set hermes_home = smc.get('hermes', {}).get('home', '') %}
{% set account = smc.get('user', {}).get('windows_account', '') %}
{% set port = smc.get('gateway', {}).get('port', 8642) %}

{% if smc and hermes_home %}

default_hermes_profile:
  smc_hermes.profile_present:
    - hermes_home: {{ hermes_home | tojson }}
    - port: {{ port }}
    - windows_account: {{ account | tojson }}

{% else %}

profiles_waiting_desired_state:
  test.show_notification:
    - text: "waiting_desired_state: empty smc pillar; refuse profile changes"

{% endif %}
