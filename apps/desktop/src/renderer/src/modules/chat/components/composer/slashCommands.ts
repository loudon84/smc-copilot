/** Slash command catalog for CopilotChatInput (desktop-local subset). */

export type SlashCommand = {
  name: string;
  description: string;
  args?: string;
};

export const DESKTOP_SLASH_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear the current composer text" },
  { name: "new", description: "Start a new chat session" },
  { name: "help", description: "Show available slash commands" },
  { name: "model", description: "Open model picker", args: "[query]" },
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
