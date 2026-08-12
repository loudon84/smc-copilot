{% set smc = pillar.get('smc', {}) %}
{% set hermes_home = smc.get('hermes', {}).get('home', '') %}
{% set account = smc.get('user', {}).get('windows_account', '') %}
{% set port = smc.get('gateway', {}).get('port', 8642) %}

default_hermes_profile:
  smc_hermes.profile_present:
    - hermes_home: {{ hermes_home }}
    - port: {{ port }}
    - windows_account: {{ account or None }}
