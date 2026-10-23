import { constants } from "node:fs";
import { access, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_MARKER = ".user-storage-v1";

/** Import legacy/user templates before defaults, never replacing an existing file. */
export async function initializeTemplateStorage(
  directory: string,
  sources: string[],
): Promise<void> {
  await mkdir(directory, { recursive: true });
  try {
    await access(path.join(directory, MIGRATION_MARKER));
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const source of sources) {
    let files;
    try {
      files = await readdir(source, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const file of files) {
      if (!file.isFile() || !/^[^.].*\.(zpl|txt)$/i.test(file.name)) continue;
      try {
        await copyFile(
          path.join(source, file.name),
          path.join(directory, file.name),
          constants.COPYFILE_EXCL,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
  // Mark only after the import succeeds, so an interrupted migration can resume.
  await writeFile(path.join(directory, MIGRATION_MARKER), "1\n", {
    flag: "wx",
  });
}
