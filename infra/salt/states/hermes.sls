# Hermes Agent signed install — prepare only; owner claim is smc_handover.commit.

{% set smc = pillar.get('smc', {}) %}
{% set hermes = smc.get('hermes', {}) %}
{% set artifact = hermes.get('artifact', {}) %}
{% set migrate_mode = hermes.get('migrate_mode', True) %}

{% if not smc %}

hermes_waiting_desired_state:
  test.show_notification:
    - text: "waiting_desired_state: empty smc pillar; refuse Hermes changes"

{% elif not artifact.get('url') or not artifact.get('sha256') or not artifact.get('signature') or not artifact.get('key_id') or not artifact.get('public_key') %}

hermes_missing_signed_artifact:
  test.fail_without_changes:
    - name: signed artifact url/sha256/signature/key_id/public_key required

{% else %}

sync_smc_modules:
  module.run:
    - name: saltutil.sync_all
    - refresh: True

hermes_prepared:
  smc_hermes.prepared:
    - version: {{ hermes.get('version', '') | tojson }}
    - artifact_url: {{ artifact.get('url', '') | tojson }}
    - artifact_sha256: {{ artifact.get('sha256', '') | tojson }}
    - artifact_signature: {{ artifact.get('signature', '') | tojson }}
    - key_id: {{ artifact.get('key_id', '') | tojson }}
    - public_key: {{ artifact.get('public_key', '') | tojson }}
    - hermes_home: {{ hermes.get('home', '') | tojson }}
    - migrate_mode: {{ migrate_mode }}
    - require:
      - module: sync_smc_modules

{% endif %}
