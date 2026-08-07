/** Merge class names (portal / shadcn pattern, no extra deps). */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}
