// The shape of a task list document and a helper to initialize one. Kept
// separate from the TaskList component so that file only exports components
// (required for React Fast Refresh).

export interface Task {
  title: string;
  done: boolean;
}

export interface TaskList {
  title: string;
  tasks: Task[];
}

// A helper function to consistently initialize a task list.
export function initTaskList(): TaskList {
  return {
    title: `TODO: ${new Date().toLocaleString()}`,
    tasks: [{ done: false, title: "" }],
  };
}
