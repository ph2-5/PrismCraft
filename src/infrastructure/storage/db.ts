export interface AutoSaveRecord {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
}

export interface ErrorLog {
  id?: number;
  message: string;
  stack?: string;
  timestamp: number;
  component?: string;
}

export interface SessionData {
  id: string;
  key: string;
  value: unknown;
  timestamp: number;
}
