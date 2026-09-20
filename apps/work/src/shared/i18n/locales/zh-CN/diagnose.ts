export default {
  title: "配置健康检查",
  description:
    "审计桌面端配置（环境变量、config.yaml、模型）。标出常见会导致对话失败的不一致项，并在安全时可一键自动修复。",
  rerun: "重新审计",
  allGood: "未发现问题。配置看起来一致。",
  banner: {
    lead: "检测到配置问题：",
    errors: "{{count}} 个错误",
    warnings: "{{count}} 个警告",
    infos: "{{count}} 条提示",
    showDetails: "显示详情",
  },
  apiKeyBanner: {
    lead: "未设置 API Server Key — 对话将失败。",
    setNow: "立即设置",
  },
  apiKeyModal: {
    title: "设置 API Server Key",
    description:
      "Hermes 网关需要 API_SERVER_KEY 以认证请求。请立即设置以启用对话。若密钥保存在保险库（KeePassXC、Bitwarden 等）且 Hermes `secrets.provider` 已指向该保险库，可忽略此警告 — 提供方会直接提供密钥。",
    label: "API Server Key",
    placeholder: "sk-… 或任意密钥",
    autoGenerate: "自动生成",
    hint: "可粘贴自有密钥，或生成随机 UUID。",
  },
  fix: {
    apply: "应用修复",
    running: "正在应用…",
    success: "修复已应用。",
    failure: "修复失败。",
  },
};
