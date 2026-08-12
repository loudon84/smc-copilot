# Hermes Agent signed install — prepare only; owner claim is smc_handover.commit.

{% set hermes = pillar.get('smc', {}).get('hermes', {}) %}
{% set artifact = hermes.get('artifact', {}) %}
{% set migrate_mode = hermes.get('migrate_mode', True) %}

sync_smc_modules:
  module.run:
    - name: saltutil.sync_all
    - refresh: True

hermes_prepared:
  smc_hermes.prepared:
    - version: {{ hermes.get('version', '') }}
    - artifact_url: {{ artifact.get('url', hermes.get('artifact_path', '')) }}
    - artifact_sha256: {{ artifact.get('sha256', '') }}
    - artifact_signature: {{ artifact.get('signature', '') }}
    - hermes_home: {{ hermes.get('home', '') or None }}
    - migrate_mode: {{ migrate_mode }}
    - require:
      - module: sync_smc_modules
