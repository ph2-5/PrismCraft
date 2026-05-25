import * as queries from "./elements/queries";
import * as commands from "./elements/commands";
import type { StoryElement, ElementType, ElementLibrary } from "@/domain/schemas";

type UpdateListener = () => void;

export class ElementStorage {
  private listeners: UpdateListener[] = [];

  subscribe(listener: UpdateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  async getLibrary(): Promise<ElementLibrary> {
    return queries.getLibrary();
  }

  async getElement(elementId: string): Promise<StoryElement | undefined> {
    return queries.getElement(elementId);
  }

  async getAllElements(): Promise<StoryElement[]> {
    return queries.getAllElements();
  }

  async getElementsByType(type: ElementType): Promise<StoryElement[]> {
    return queries.getElementsByType(type);
  }

  async createElement(
    type: ElementType,
    name: string,
    description: string = "",
  ): Promise<StoryElement> {
    return commands.createElement(type, name, description);
  }

  async updateElement(
    elementId: string,
    updates: Partial<StoryElement>,
  ): Promise<StoryElement> {
    return commands.updateElement(elementId, updates);
  }

  async deleteElement(elementId: string): Promise<void> {
    return commands.deleteElement(elementId);
  }
}

export const elementStorage = new ElementStorage();
