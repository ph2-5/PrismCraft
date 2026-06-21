// Re-export from domain layer to maintain backward compatibility.
// The canonical definitions now live in @/domain/video/task-state to break
// the circular dependency between task-management and recovery modules.
export {
  TaskMachine,
  TransitionError,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  STUCK_TASK_THRESHOLD_MS,
  isValidTransition,
  isStuck,
} from "@/domain/video/task-state";
export type { TransitionError as TransitionErrorType } from "@/domain/video/task-state";
