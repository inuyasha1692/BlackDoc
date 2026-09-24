export type UpdateCheckResult =
  | { kind: "available"; version: string; url: string }
  | { kind: "current" }
  | { kind: "unavailable" };

const latestReleaseApi =
  "https://api.github.com/repos/inuyasha1692/BlackDoc/releases/latest";
const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseVersion(version: string): [bigint, bigint, bigint] | null {
  const match = versionPattern.exec(version);
  return match
    ? [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])]
    : null;
}

function isNewer(candidate: bigint[], current: bigint[]): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (candidate[index] !== current[index]) {
      return candidate[index] > current[index];
    }
  }
  return false;
}

function validReleaseUrl(value: unknown, tag: string): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    const prefix = "/inuyasha1692/BlackDoc/releases/tag/";
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(prefix)
    ) {
      return false;
    }

    const encodedTag = url.pathname.slice(prefix.length);
    return !!encodedTag && !encodedTag.includes("/") && decodeURIComponent(encodedTag) === tag;
  } catch {
    return false;
  }
}

export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateCheckResult> {
  const current = parseVersion(currentVersion);
  if (!current) return { kind: "unavailable" };

  try {
    const response = await fetchImpl(latestReleaseApi, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { kind: "unavailable" };

    const release: unknown = await response.json();
    if (typeof release !== "object" || release === null) {
      return { kind: "unavailable" };
    }

    const { tag_name: tag, html_url: url, draft, prerelease } = release as Record<string, unknown>;
    if (draft !== false || prerelease !== false || typeof tag !== "string") {
      return { kind: "unavailable" };
    }

    const latest = parseVersion(tag);
    if (!latest || !validReleaseUrl(url, tag)) {
      return { kind: "unavailable" };
    }

    return isNewer(latest, current)
      ? { kind: "available", version: tag, url }
      : { kind: "current" };
  } catch {
    return { kind: "unavailable" };
  }
}
