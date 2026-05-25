export type IpcArgs = unknown[];
export type IpcResult = unknown;
export interface IpcInvoker {
  (...args: IpcArgs): Promise<IpcResult>;
}
export interface MenuEventCallback {
  (...args: IpcArgs): void;
}
