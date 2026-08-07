import type { HermesPanelPresetAction } from "../types";

export const DEFAULT_WEB_OPERATOR_PRESET_ACTIONS: HermesPanelPresetAction[] = [
  { label: "页面摘要", prompt: "请总结当前 Web 页面的主要内容和结构" },
  {
    label: "提取关键信息",
    prompt: "从页面上下文中提取关键字段（表格、表单、联系人等），用 Markdown 列表输出",
  },
  { label: "建议下一步", prompt: "基于当前页面，建议用户可执行的下一步操作" },
];
