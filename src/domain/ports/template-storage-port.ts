export interface ITemplateStorage {
  getVideoTemplates<T = Record<string, unknown>>(): Promise<T[]>;
  createVideoTemplate(template: Record<string, unknown>): Promise<void>;
  saveASTTemplate(meta: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    genre?: string;
    tone?: string;
    tags?: string;
    author?: string;
    totalDuration: number;
    beatsCount: number;
    charactersCount?: number;
    scenesCount?: number;
    astFilePath?: string;
    astFileSize?: number;
    isPublic?: boolean;
    parentTemplateId?: string;
  }): Promise<void>;
  getASTTemplate(id: string): Promise<Record<string, unknown> | null>;
  getASTTemplates(filters?: {
    category?: string;
    search?: string;
    sortBy?: "created" | "usage" | "name";
    limit?: number;
  }): Promise<Record<string, unknown>[]>;
  deleteASTTemplate(id: string): Promise<boolean>;
  incrementASTTemplateUsage(id: string): Promise<void>;
}
