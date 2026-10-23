import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeTemplateStorage } from "../system/TemplateStorage";

describe("persistent user templates", () => {
  let root: string;
  let user: string;
  let backup: string;
  let bundled: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "template-storage-"));
    user = path.join(root, "user");
    backup = path.join(root, "upgrade-backup");
    bundled = path.join(root, "installation");
    await Promise.all([mkdir(backup), mkdir(bundled)]);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("preserves a user-created and a modified template across an installation replacement", async () => {
    await writeFile(path.join(backup, "custom.zpl"), "USER LABEL");
    await writeFile(path.join(backup, "16x13.zpl"), "USER MODIFICATIONS");
    await writeFile(path.join(bundled, "16x13.zpl"), "NEW BUNDLED DEFAULT");
    await writeFile(path.join(bundled, "other.zpl"), "DEFAULT");
    await initializeTemplateStorage(user, [backup, bundled]);
    expect(await readFile(path.join(user, "custom.zpl"), "utf8")).toBe(
      "USER LABEL",
    );
    expect(await readFile(path.join(user, "16x13.zpl"), "utf8")).toBe(
      "USER MODIFICATIONS",
    );
    expect(await readFile(path.join(user, "other.zpl"), "utf8")).toBe(
      "DEFAULT",
    );
    await writeFile(path.join(user, "16x13.zpl"), "LATEST USER EDIT");
    await writeFile(path.join(bundled, "16x13.zpl"), "NEXT UPDATE");
    await initializeTemplateStorage(user, [backup, bundled]);
    expect(await readFile(path.join(user, "16x13.zpl"), "utf8")).toBe(
      "LATEST USER EDIT",
    );
  });

  it("does not resurrect a deleted template at the next launch", async () => {
    await writeFile(path.join(bundled, "remove.zpl"), "DEFAULT");
    await initializeTemplateStorage(user, [bundled]);
    await unlink(path.join(user, "remove.zpl"));
    await initializeTemplateStorage(user, [bundled]);
    await expect(readFile(path.join(user, "remove.zpl"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });

  it("can resume an import without overwriting existing user files", async () => {
    await mkdir(user);
    await writeFile(path.join(user, "existing.zpl"), "USER");
    await writeFile(path.join(bundled, "existing.zpl"), "DEFAULT");
    await writeFile(path.join(bundled, "new.TXT"), "NEW");
    await writeFile(path.join(bundled, "not-a-template.exe"), "SKIP");
    await initializeTemplateStorage(user, [
      path.join(root, "missing"),
      bundled,
    ]);
    expect(await readFile(path.join(user, "existing.zpl"), "utf8")).toBe(
      "USER",
    );
    expect(await readFile(path.join(user, "new.TXT"), "utf8")).toBe("NEW");
    await expect(
      readFile(path.join(user, "not-a-template.exe")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
