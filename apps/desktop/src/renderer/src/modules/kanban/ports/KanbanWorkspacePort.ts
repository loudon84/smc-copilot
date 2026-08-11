export interface KanbanWorkspacePort {
  pickDirectory(): Promise<string | null>;
}
