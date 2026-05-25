import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";
import { setupElectronApiMock, resetElectronApiMock } from "../mocks/electron-api";

interface CustomRenderOptions extends RenderOptions {
  diOverrides?: Record<string, unknown>;
}

export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {},
) {
  const electronApi = setupElectronApiMock();

  if (options.diOverrides && Object.keys(options.diOverrides).length > 0) {
    vi.doMock("@/infrastructure/di", () => ({
      container: { ...electronApi, ...options.diOverrides },
    }));
  }

  const result = render(ui);

  return {
    ...result,
    electronApi,
  };
}

export function cleanupProviders() {
  resetElectronApiMock();
  vi.unmock("@/infrastructure/di");
}
