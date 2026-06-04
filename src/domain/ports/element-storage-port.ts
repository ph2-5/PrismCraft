import type { StoryElement, ElementType, ElementLibrary } from "@/domain/schemas";

type UpdateListener = () => void;

export interface IElementStorage {
  subscribe(listener: UpdateListener): () => void;
  notify(): void;
  getLibrary(): Promise<ElementLibrary>;
  getElement(elementId: string): Promise<StoryElement | undefined>;
  getAllElements(): Promise<StoryElement[]>;
  getElementsByType(type: ElementType): Promise<StoryElement[]>;
  createElement(type: ElementType, name: string, description?: string): Promise<StoryElement>;
  updateElement(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>;
  deleteElement(elementId: string): Promise<void>;
}
