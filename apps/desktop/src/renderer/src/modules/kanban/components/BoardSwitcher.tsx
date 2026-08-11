import type { KanbanController } from "../controller/useKanbanController";

interface Props {
  controller: KanbanController;
}

export function BoardSwitcher({ controller }: Props) {
  const { state, actions } = controller;
  return (
    <div className="board-switcher">
      {state.boards.map((board) => (
        <button
          key={board.slug}
          type="button"
          className={`board-chip${state.selectedBoardSlug === board.slug ? " active" : ""}`}
          onClick={() => actions.selectBoard(board.slug)}
        >
          <span>{board.name || board.slug}</span>
          <span>{board.total}</span>
        </button>
      ))}
      <button
        type="button"
        className="board-chip"
        onClick={() => actions.openCreateBoard(true)}
      >
        + New Board
      </button>
    </div>
  );
}
