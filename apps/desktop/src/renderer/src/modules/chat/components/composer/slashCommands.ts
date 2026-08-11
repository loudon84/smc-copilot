/** Slash command catalog for CopilotChatInput (desktop-local subset). */

export type SlashCommand = {
  name: string;
  description: string;
  args?: string;
  category?: string;
};

export const DESKTOP_SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "clear",
    description: "Clear the current composer text",
    category: "Desktop",
  },
  {
    name: "new",
    description: "Start a new chat session",
    category: "Desktop",
  },
  {
    name: "help",
    description: "Show available slash commands",
    category: "Desktop",
  },
  {
    name: "model",
    description: "Open model picker",
    args: "[query]",
    category: "Desktop",
  },
];

export function filterSlashCommands(
  commands: SlashCommand[],
  query: string,
): SlashCommand[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  if (!q) return commands;
  return commands.filter(
    (c) =>
      c.name.toLowerCase().startsWith(q) ||
      c.description.toLowerCase().includes(q),
  );
}

export function groupSlashCommands(
  commands: SlashCommand[],
): Array<{ category: string; items: SlashCommand[] }> {
  const map = new Map<string, SlashCommand[]>();
  for (const cmd of commands) {
    const cat = cmd.category || "Commands";
    const list = map.get(cat) || [];
    list.push(cmd);
    map.set(cat, list);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}
