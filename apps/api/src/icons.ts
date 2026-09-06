import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type IconObject = {
  body: Buffer;
  contentType: string;
};

export type IconStore = {
  put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<IconObject | null>;
};

function fileName(key: string) {
  const name = basename(key);
  if (!name || name !== key.replace(/^icons\//, "")) {
    throw new Error("invalid icon key");
  }
  return name;
}

export async function createDiskIcons(dir: string): Promise<IconStore> {
  await mkdir(dir, { recursive: true });
  return {
    async put(key, body, _contentType) {
      const target = join(dir, fileName(key));
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
      await writeFile(target, bytes);
    },
    async get(key) {
      try {
        const body = await readFile(join(dir, fileName(key)));
        return { body, contentType: iconContentType(fileName(key)) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
  };
}

export async function uploadIcon(
  store: IconStore,
  appId: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const filename = `${appId}.${ext}`;
  await store.put(`icons/${filename}`, body, contentType);
  return `/media/icons/${filename}`;
}

export function iconContentType(file: string) {
  const ext = file.split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}
