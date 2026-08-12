{% set mcp = pillar.get('smc', {}).get('mcp', {}) %}

smc_mcp_configured:
  smc_hermes.mcp_configured:
    - config: {{ mcp | json }}
