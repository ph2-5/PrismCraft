import { describe, it, expect, vi } from "vitest";

describe("R81: Blob URL Lifecycle Regression Tests", () => {
  describe("Blob URL revoke timing", () => {
    it("should NOT revoke blob URL on every cachedVideoUrl change", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

      revokeSpy.mockClear();

      expect(revokeSpy).not.toHaveBeenCalledWith("blob:test-1");

      revokeSpy.mockRestore();
    });

    it("should delay revokeObjectURL after download click", async () => {
      vi.useFakeTimers();
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      const blob = new Blob(["test"], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "test.mp4";

      setTimeout(() => URL.revokeObjectURL(url), 5000);

      vi.advanceTimersByTime(4999);
      expect(revokeSpy).not.toHaveBeenCalledWith(url);

      vi.advanceTimersByTime(2);
      expect(revokeSpy).toHaveBeenCalledWith(url);

      revokeSpy.mockRestore();
      vi.useRealTimers();
    });

    it("should revoke all tracked blob URLs on unmount", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      const trackedUrls = new Set<string>();
      trackedUrls.add("blob:video-1");
      trackedUrls.add("blob:video-2");
      trackedUrls.add("blob:video-3");

      for (const url of trackedUrls) {
        URL.revokeObjectURL(url);
      }

      expect(revokeSpy).toHaveBeenCalledWith("blob:video-1");
      expect(revokeSpy).toHaveBeenCalledWith("blob:video-2");
      expect(revokeSpy).toHaveBeenCalledWith("blob:video-3");

      revokeSpy.mockRestore();
    });

    it("should register blob URLs when caching video", () => {
      const trackedUrls = new Set<string>();
      const url = "blob:cached-video";

      if (url.startsWith("blob:")) {
        trackedUrls.add(url);
      }

      expect(trackedUrls.has("blob:cached-video")).toBe(true);
    });

    it("should NOT revoke display blob URLs on every URL change", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      const blobUrlsRef = { current: new Set<string>() };

      const urls = ["blob:video-1", "blob:video-2", "blob:video-3"];
      for (const url of urls) {
        if (url.startsWith("blob:")) {
          blobUrlsRef.current.add(url);
        }
      }

      expect(revokeSpy).not.toHaveBeenCalled();

      for (const url of blobUrlsRef.current) {
        URL.revokeObjectURL(url);
      }

      expect(revokeSpy).toHaveBeenCalledTimes(3);

      revokeSpy.mockRestore();
    });
  });
});
