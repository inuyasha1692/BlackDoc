import { describe, expect, it, vi } from "vitest";
import { checkForUpdate } from "./updates";

const apiUrl = "https://api.github.com/repos/inuyasha1692/BlackDoc/releases/latest";
const releaseUrl = "https://github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.4";

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: "v1.2.4",
    html_url: releaseUrl,
    draft: false,
    prerelease: false,
    ...overrides,
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe("checkForUpdate", () => {
  it("requests the official latest release and reports a newer version", async () => {
    const fetchImpl = mockFetch(release());
    await expect(checkForUpdate("1.2.3", fetchImpl)).resolves.toEqual({
      kind: "available",
      version: "v1.2.4",
      url: releaseUrl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
  });

  it.each([
    ["v1.2.4", "v1.2.4"],
    ["1.2.5", "v1.2.4"],
    ["1.3.0", "v1.2.4"],
    ["2.0.0", "v1.2.4"],
    ["1.2.3", "1.2.3"],
  ])("treats %s as current relative to %s", async (current, tag) => {
    const url = `https://github.com/inuyasha1692/BlackDoc/releases/tag/${tag}`;
    await expect(checkForUpdate(current, mockFetch(release({
      tag_name: tag,
      html_url: url,
    })))).resolves.toEqual({ kind: "current" });
  });

  it("compares version components numerically, even beyond safe integers", async () => {
    await expect(checkForUpdate("1.9.99", mockFetch(release({
      tag_name: "1.10.0",
      html_url: "https://github.com/inuyasha1692/BlackDoc/releases/tag/1.10.0",
    })))).resolves.toEqual({
      kind: "available",
      version: "1.10.0",
      url: "https://github.com/inuyasha1692/BlackDoc/releases/tag/1.10.0",
    });
    await expect(checkForUpdate("9007199254740992.0.0", mockFetch(release({
      tag_name: "9007199254740993.0.0",
      html_url: "https://github.com/inuyasha1692/BlackDoc/releases/tag/9007199254740993.0.0",
    })))).resolves.toMatchObject({ kind: "available" });
  });

  it.each([404, 403, 429, 500])("returns unavailable for HTTP %i", async (status) => {
    await expect(checkForUpdate("1.2.3", mockFetch(release(), status)))
      .resolves.toEqual({ kind: "unavailable" });
  });

  it("returns unavailable for network and JSON failures", async () => {
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(checkForUpdate("1.2.3", offline)).resolves.toEqual({ kind: "unavailable" });
    const malformed = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
    } as unknown as Response);
    await expect(checkForUpdate("1.2.3", malformed))
      .resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    "1.2",
    "1.2.3-beta.1",
    "v1.02.3",
    " 1.2.3",
    "1.2.3.4",
  ])("rejects invalid current version %s without a request", async (current) => {
    const fetchImpl = mockFetch(release());
    await expect(checkForUpdate(current, fetchImpl))
      .resolves.toEqual({ kind: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["1.2", "v1.2.4-rc.1", "v01.2.4", "v1.2.4+build"])(
    "rejects invalid release tag %s",
    async (tag) => {
      await expect(checkForUpdate("1.2.3", mockFetch(release({
        tag_name: tag,
        html_url: `https://github.com/inuyasha1692/BlackDoc/releases/tag/${tag}`,
      })))).resolves.toEqual({ kind: "unavailable" });
    },
  );

  it.each([
    { draft: true },
    { prerelease: true },
    { draft: undefined },
    { prerelease: undefined },
    { tag_name: undefined },
  ])("rejects draft, prerelease, or incomplete metadata: %j", async (overrides) => {
    await expect(checkForUpdate("1.2.3", mockFetch(release(overrides))))
      .resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    "http://github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.4",
    "https://evil.example/inuyasha1692/BlackDoc/releases/tag/v1.2.4",
    "https://github.com.evil.example/inuyasha1692/BlackDoc/releases/tag/v1.2.4",
    "https://github.com/other/BlackDoc/releases/tag/v1.2.4",
    "https://github.com/inuyasha1692/BlackDoc/issues/1",
    "https://github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.5",
    "https://github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.4?next=evil",
    "https://github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.4#fragment",
    "https://user@github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.4",
    "https://github.com/inuyasha1692/BlackDoc/releases/tag/v1.2.4/extra",
  ])("rejects untrusted release URL %s", async (url) => {
    await expect(checkForUpdate("1.2.3", mockFetch(release({ html_url: url }))))
      .resolves.toEqual({ kind: "unavailable" });
  });

  it("rejects malformed release data", async () => {
    await expect(checkForUpdate("1.2.3", mockFetch(null)))
      .resolves.toEqual({ kind: "unavailable" });
    await expect(checkForUpdate("1.2.3", mockFetch(release({ html_url: 42 }))))
      .resolves.toEqual({ kind: "unavailable" });
  });
});
