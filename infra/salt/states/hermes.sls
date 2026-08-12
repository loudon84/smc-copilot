# Hermes Agent signed install (artifact url/sha256/signature from pillar).

{% set hermes = pillar.get('smc', {}).get('hermes', {}) %}
{% set artifact = hermes.get('artifact', {}) %}

sync_smc_modules:
  module.run:
    - name: saltutil.sync_all
    - refresh: True

hermes_control_owner:
  file.serialize:
    - name: {{ salt['environ.get']('SMC_CONTROL_OWNER_PATH', 'C:/ProgramData/SMC/control-owner.json') }}
    - dataset:
        hermes: salt
    - formatter: json
    - makedirs: True

hermes_installed:
  smc_hermes.installed:
    - version: {{ hermes.get('version', '') }}
    - artifact_url: {{ artifact.get('url', hermes.get('artifact_path', '')) }}
    - artifact_sha256: {{ artifact.get('sha256', '') }}
    - artifact_signature: {{ artifact.get('signature', '') }}
    - hermes_home: {{ hermes.get('home', '') or None }}
    - require:
      - module: sync_smc_modules
      - file: hermes_control_owner
