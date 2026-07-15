export const DomainEvents = {
  CHARACTER_CREATED: "character:created",
  CHARACTER_UPDATED: "character:updated",
  CHARACTER_DELETED: "character:deleted",
  SCENE_CREATED: "scene:created",
  SCENE_UPDATED: "scene:updated",
  SCENE_DELETED: "scene:deleted",
  STORY_CREATED: "story:created",
  STORY_UPDATED: "story:updated",
  STORY_DELETED: "story:deleted",
  ASSET_CREATED: "asset:created",
  ASSET_DELETED: "asset:deleted",
  VIDEO_TASK_CREATED: "videoTask:created",
  VIDEO_TASK_UPDATED: "videoTask:updated",
  VIDEO_TASK_COMPLETED: "videoTask:completed",
  VIDEO_TASK_FAILED: "videoTask:failed",
  AGENT_THINKING: "agent:thinking",
  AGENT_COMPLETED: "agent:completed",
  AGENT_ERROR: "agent:error",
} as const;

export type DomainEventType = typeof DomainEvents[keyof typeof DomainEvents];

export interface EventPayloadMap {
  [DomainEvents.CHARACTER_CREATED]: { id: string; characterName: string };
  [DomainEvents.CHARACTER_UPDATED]: { id: string; characterName: string };
  [DomainEvents.CHARACTER_DELETED]: { id: string; characterName: string };
  [DomainEvents.SCENE_CREATED]: { id: string; sceneName: string };
  [DomainEvents.SCENE_UPDATED]: { id: string; sceneName: string };
  [DomainEvents.SCENE_DELETED]: { id: string; sceneName: string };
  [DomainEvents.STORY_CREATED]: { id: string; storyTitle: string };
  [DomainEvents.STORY_UPDATED]: { id: string; storyTitle: string };
  [DomainEvents.STORY_DELETED]: { id: string; storyTitle: string };
  [DomainEvents.ASSET_CREATED]: { id: string; assetName?: string };
  [DomainEvents.ASSET_DELETED]: { id: string; assetName?: string };
  [DomainEvents.VIDEO_TASK_CREATED]: { taskId: string };
  [DomainEvents.VIDEO_TASK_UPDATED]: { taskId: string };
  [DomainEvents.VIDEO_TASK_COMPLETED]: { taskId: string; videoUrl?: string };
  [DomainEvents.VIDEO_TASK_FAILED]: { taskId: string; error?: string };
  [DomainEvents.AGENT_THINKING]: { sessionId: string };
  [DomainEvents.AGENT_COMPLETED]: { sessionId: string };
  [DomainEvents.AGENT_ERROR]: { sessionId: string; error: string };
}
