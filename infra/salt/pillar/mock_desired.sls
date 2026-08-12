smc:
  endpoint_id: lab-minion-01
  user:
    user_id: user-demo
    windows_account: DOMAIN\zhangsan
    windows_sid: S-1-5-21-1000-2000-3000-1001
    profile_dir: C:\Users\zhangsan
  department: engineering
  role: expert
  config_version: "1"
  hermes:
    version: "0.20.0"
    home: C:\Users\zhangsan\AppData\Local\hermes
    artifact:
      url: ""
      sha256: ""
      signature: ""
  gateway:
    task_name: SMC Hermes Gateway
    port: 8642
  mcp:
    mcpServers:
      - name: fs
        command: npx
  secrets:
    DASHSCOPE_API_KEY:
      ref: smc://providers/dashscope
