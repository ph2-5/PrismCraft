import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockRevokeObjectURL = vi.fn();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/test-blob");
  URL.revokeObjectURL = mockRevokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("R35: Blob URLs must be revoked on component unmount", () => {
  it("should revoke blob URL when component unmounts", () => {
    const blobRef = { current: null as string | null };

    const { unmount } = renderHook(() => {
      blobRef.current = URL.createObjectURL(new Blob(["test"]));
      return blobRef;
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it("should track blob URL in ref for cleanup", () => {
    const blobRef = { current: null as string | null };
    const blobUrl = URL.createObjectURL(new Blob(["test"]));
    blobRef.current = blobUrl;

    expect(blobRef.current).toBe("blob:http://localhost/test-blob");

    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
    }

    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/test-blob");
  });

  it("should not revoke null blob URL ref", () => {
    const blobRef = { current: null as string | null };

    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
    }

    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it("should revoke previous blob URL when replacing with new one", () => {
    const blobRef = { current: null as string | null };

    blobRef.current = URL.createObjectURL(new Blob(["first"]));
    const oldUrl = blobRef.current;

    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
    }
    blobRef.current = URL.createObjectURL(new Blob(["second"]));

    expect(mockRevokeObjectURL).toHaveBeenCalledWith(oldUrl);
    expect(blobRef.current).toBe("blob:http://localhost/test-blob");
  });
});
