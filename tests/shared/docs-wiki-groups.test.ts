import { describe, expect, it } from "vitest";
import { groupFilesBySubsystem, DEFAULT_MAX_FILES } from "../../src/docs/wiki-groups.js";

describe("groupFilesBySubsystem", () => {
  it("groups by the first two path segments", () => {
    const g = groupFilesBySubsystem([
      "xarray/backends/api.py",
      "xarray/backends/zarr.py",
      "xarray/core/dataset.py",
    ]);
    expect(g.map((x) => x.key)).toEqual(["xarray/backends", "xarray/core"]);
    expect(g[0].files).toEqual(["xarray/backends/api.py", "xarray/backends/zarr.py"]);
  });

  it("goes one level deeper under a src/ root (src/pkg/core, not src/pkg)", () => {
    const g = groupFilesBySubsystem(["src/docs/write.ts", "src/docs/read.ts", "src/graph/diff.ts"]);
    expect(g.map((x) => x.key)).toEqual(["src/docs", "src/graph"]);
  });

  it("root-level files group under their first segment", () => {
    const g = groupFilesBySubsystem(["setup.py", "conftest.py"]);
    expect(g.map((x) => x.key).sort()).toEqual(["conftest.py", "setup.py"]);
  });

  it("splits an oversized group one directory level deeper", () => {
    const files = [
      ...Array.from({ length: 3 }, (_, i) => `pkg/big/sub1/f${i}.py`),
      ...Array.from({ length: 3 }, (_, i) => `pkg/big/sub2/g${i}.py`),
    ];
    const g = groupFilesBySubsystem(files, { maxFiles: 4 });
    expect(g.map((x) => x.key)).toEqual(["pkg/big/sub1", "pkg/big/sub2"]);
    expect(g[0].files).toHaveLength(3);
  });

  it("keeps files with no deeper directory in the parent when splitting", () => {
    const files = [
      "pkg/big/top.py", // no deeper dir → must stay under pkg/big
      ...Array.from({ length: 5 }, (_, i) => `pkg/big/sub/f${i}.py`),
    ];
    const g = groupFilesBySubsystem(files, { maxFiles: 4 });
    const keys = g.map((x) => x.key);
    expect(keys).toContain("pkg/big");
    expect(keys).toContain("pkg/big/sub");
    expect(g.find((x) => x.key === "pkg/big")!.files).toEqual(["pkg/big/top.py"]);
  });

  it("output is deterministic: sorted keys, sorted members", () => {
    const a = groupFilesBySubsystem(["z/x/b.py", "z/x/a.py", "a/y/c.py"]);
    const b = groupFilesBySubsystem(["a/y/c.py", "z/x/a.py", "z/x/b.py"]);
    expect(a).toEqual(b);
    expect(a[0].key < a[1].key).toBe(true);
    expect(a.find((g) => g.key === "z/x")!.files).toEqual(["z/x/a.py", "z/x/b.py"]);
  });

  it("default cap bounds every group's prompt size", () => {
    expect(DEFAULT_MAX_FILES).toBe(40);
  });
});
