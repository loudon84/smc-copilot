import { TaskComposer, type TaskComposerState } from "./TaskComposer";

type Props = {
  initialText?: string;
  isStreaming?: boolean;
  onSubmit: (state: TaskComposerState) => void;
};

/** 任务首页专用 Composer 包装（计划文�?NewTaskComposer�?*/
export function NewTaskComposer(props: Props) {
  return <TaskComposer {...props} />;
}
