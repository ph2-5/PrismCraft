import type {
  StoryElement,
  ElementLibrary,
  ElementType,
  AssetBinding,
} from "@/domain/schemas";

/**
 * Callback type for element update notifications
 */
type UpdateListener = () => void;

/**
 * Port interface for ElementManager operations.
 * Provides element lifecycle management, asset binding, and update notifications.
 */
export interface IElementManager {
  /**
   * Subscribes to element update notifications.
   * @param listener - Callback function invoked when elements change
   * @returns Unsubscribe function to remove the listener
   */
  subscribe(listener: UpdateListener): () => void;

  /**
   * Retrieves the complete element library.
   * @returns Promise resolving to the full element library
   */
  getLibrary(): Promise<ElementLibrary>;

  /**
   * Creates a new story element.
   * @param type - The type of element to create
   * @param name - Name identifier for the element
   * @param description - Optional description for the element
   * @returns Promise resolving to the newly created story element
   */
  createElement(
    type: ElementType,
    name: string,
    description?: string,
  ): Promise<StoryElement>;

  /**
   * Binds an asset to an existing element.
   * @param elementId - Unique identifier of the target element
   * @param asset - Asset binding configuration
   * @returns Promise resolving to the updated story element
   */
  bindAsset(
    elementId: string,
    asset: AssetBinding,
  ): Promise<StoryElement>;

  /**
   * Unbinds an asset from an existing element.
   * @param elementId - Unique identifier of the target element
   * @param assetUrl - URL of the asset to unbind
   * @returns Promise resolving to the updated story element
   */
  unbindAsset(
    elementId: string,
    assetUrl: string,
  ): Promise<StoryElement>;

  /**
   * Retrieves a single element by ID.
   * @param elementId - Unique identifier of the element
   * @returns Promise resolving to the story element or undefined if not found
   */
  getElement(elementId: string): Promise<StoryElement | undefined>;

  /**
   * Retrieves all story elements.
   * @returns Promise resolving to an array of all story elements
   */
  getAllElements(): Promise<StoryElement[]>;

  /**
   * Retrieves all elements of a specific type.
   * @param type - Element type filter
   * @returns Promise resolving to an array of matching story elements
   */
  getElementsByType(type: ElementType): Promise<StoryElement[]>;

  /**
   * Deletes an element by ID.
   * @param elementId - Unique identifier of the element to delete
   * @returns Promise resolving when deletion is complete
   */
  deleteElement(elementId: string): Promise<void>;

  /**
   * Updates an existing element with partial changes.
   * @param elementId - Unique identifier of the element to update
   * @param updates - Partial updates to apply to the element
   * @returns Promise resolving to the updated story element
   */
  updateElement(
    elementId: string,
    updates: Partial<StoryElement>,
  ): Promise<StoryElement>;
}
