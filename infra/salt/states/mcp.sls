{% set smc = pillar.get('smc', {}) %}
{% set mcp = smc.get('mcp', {}) %}

{% if smc %}

smc_mcp_configured:
  smc_hermes.mcp_configured:
    - config: {{ mcp | json }}

{% else %}

mcp_waiting_desired_state:
  test.show_notification:
    - text: "waiting_desired_state: empty smc pillar; refuse MCP changes"

{% endif %}
