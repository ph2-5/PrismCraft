import type {
  StoryElement,
  ElementLibrary,
  ElementType,
  AssetBinding,
} from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";

type UpdateListener = () => void;

export class ElementManager {
  private listeners: UpdateListener[] = [];

  subscribe(listener: UpdateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  async getLibrary(): Promise<ElementLibrary> {
    return container.elementStorage.getLibrary();
  }

  async createElement(
    type: ElementType,
    name: string,
    description: string = "",
  ): Promise<StoryElement> {
    try {
      const element = await container.elementStorage.createElement(type, name, description);
      this.notify();
      return element;
    } catch (error) {
      errorLogger.warn("[ElementManager] 创建元素失败:", extractErrorMessage(error));
      throw error;
    }
  }

  async bindAsset(
    elementId: string,
    asset: AssetBinding,
  ): Promise<StoryElement> {
    try {
      const element = await container.elementStorage.getElement(elementId);
      if (!element) throw new Error(`Element ${elementId} not found`);
      const updated = await container.elementStorage.updateElement(elementId, {
        bindings: [...element.bindings, asset],
      });
      this.notify();
      return updated;
    } catch (error) {
      errorLogger.warn("[ElementManager] 绑定资源失败:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  async unbindAsset(
    elementId: string,
    assetUrl: string,
  ): Promise<StoryElement> {
    try {
      const element = await container.elementStorage.getElement(elementId);
      if (!element) throw new Error(`Element ${elementId} not found`);
      const updated = await container.elementStorage.updateElement(elementId, {
        bindings: element.bindings.filter(
          (a: AssetBinding) => a.url !== assetUrl,
        ),
      });
      this.notify();
      return updated;
    } catch (error) {
      errorLogger.warn("[ElementManager] 解绑资源失败:", extractErrorMessage(error));
      throw error;
    }
  }

  async getElement(elementId: string): Promise<StoryElement | undefined> {
    return container.elementStorage.getElement(elementId);
  }

  async getAllElements(): Promise<StoryElement[]> {
    return container.elementStorage.getAllElements();
  }

  async getElementsByType(type: ElementType): Promise<StoryElement[]> {
    return container.elementStorage.getElementsByType(type);
  }

  async deleteElement(elementId: string): Promise<void> {
    try {
      await container.elementStorage.deleteElement(elementId);
      this.notify();
    } catch (error) {
      errorLogger.warn("[ElementManager] 删除元素失败:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  async updateElement(
    elementId: string,
    updates: Partial<StoryElement>,
  ): Promise<StoryElement> {
    try {
      const updated = await container.elementStorage.updateElement(elementId, updates);
      this.notify();
      return updated;
    } catch (error) {
      errorLogger.warn("[ElementManager] 更新元素失败:", extractErrorMessage(error));
      throw error;
    }
  }
}

export const elementManager = new ElementManager();
