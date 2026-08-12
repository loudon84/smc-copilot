# Hermes Agent desired install (repo-only artifact path from pillar).

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
    - version: {{ pillar.get('smc', {}).get('hermes', {}).get('version', 'latest') }}
    - artifact_path: {{ pillar.get('smc', {}).get('hermes', {}).get('artifact_path', '') }}
    - hermes_home: {{ pillar.get('smc', {}).get('hermes', {}).get('home', '') or None }}
    - require:
      - module: sync_smc_modules
      - file: hermes_control_owner
