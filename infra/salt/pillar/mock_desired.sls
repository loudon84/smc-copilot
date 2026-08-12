smc:
  endpoint_id: lab-minion-01
  user_id: user-demo
  department: engineering
  role: expert
  config_version: "1"
  hermes:
    version: "0.16.0"
    artifact_path: ""
    home: ""
  gateway:
    task_name: SMC Hermes Gateway
    port: 8642
  secrets:
    api_server_key_ref: vault://lab/api-server-key
