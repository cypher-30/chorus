import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const LOCAL_STORAGE_ROUTE_PREFIX = "/storage";

const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_DIR?.trim()
  ? path.resolve(process.env.LOCAL_STORAGE_DIR.trim())
  : path.resolve(import.meta.dir, "../../uploads");

export const getLocalStorageRoot = (): string => LOCAL_STORAGE_ROOT;

const normalizeKey = (key: string): string =>
  key.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();

const resolveKeyPath = (key: string): { key: string; absolutePath: string } => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey || normalizedKey.includes("..")) {
    throw new Error("Invalid storage key");
  }

  const absolutePath = path.resolve(LOCAL_STORAGE_ROOT, normalizedKey);
  const rootWithSep = LOCAL_STORAGE_ROOT.endsWith(path.sep)
    ? LOCAL_STORAGE_ROOT
    : `${LOCAL_STORAGE_ROOT}${path.sep}`;

  if (absolutePath !== LOCAL_STORAGE_ROOT && !absolutePath.startsWith(rootWithSep)) {
    throw new Error("Storage key escapes local storage root");
  }

  return { key: normalizedKey, absolutePath };
};

const ensureParentDirectory = async (absolutePath: string) => {
  await mkdir(path.dirname(absolutePath), { recursive: true });
};

const exists = async (absolutePath: string): Promise<boolean> => {
  try {
    await access(absolutePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolvePublicBaseUrl = (origin?: string): string => {
  const base =
    origin?.trim() ||
    process.env.CHORUS_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:8080";

  return base.replace(/\/+$/, "");
};

export const getRoomObjectKey = (roomId: string, fileName: string): string =>
  `room-${roomId}/${fileName}`;

export const getPublicUrlForStorageKey = (
  key: string,
  origin?: string
): string => {
  const base = resolvePublicBaseUrl(origin);
  const { key: normalizedKey } = resolveKeyPath(key);
  return `${base}${LOCAL_STORAGE_ROUTE_PREFIX}/${normalizedKey}`;
};

export const getStorageKeyFromRoutePath = (pathname: string): string | null => {
  const prefix = `${LOCAL_STORAGE_ROUTE_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;

  try {
    const raw = decodeURIComponent(pathname.slice(prefix.length));
    const { key } = resolveKeyPath(raw);
    return key;
  } catch {
    return null;
  }
};

export const getStorageKeyFromPublicUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return getStorageKeyFromRoutePath(parsed.pathname);
  } catch {
    // Non-URL input (e.g. relative path)
    return getStorageKeyFromRoutePath(url);
  }
};

export const putLocalObject = async (
  key: string,
  body: Uint8Array | ArrayBuffer
): Promise<void> => {
  const { absolutePath } = resolveKeyPath(key);
  await ensureParentDirectory(absolutePath);
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  await writeFile(absolutePath, bytes);
};

export const getLocalObjectFile = async (key: string): Promise<Blob | null> => {
  const { absolutePath } = resolveKeyPath(key);
  if (!(await exists(absolutePath))) return null;
  return Bun.file(absolutePath);
};

export const localObjectExistsByKey = async (key: string): Promise<boolean> => {
  const { absolutePath } = resolveKeyPath(key);
  return exists(absolutePath);
};

const walkFiles = async (
  currentDir: string,
  prefix: string = ""
): Promise<string[]> => {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolute, relative)));
      continue;
    }
    if (entry.isFile()) {
      files.push(relative.replace(/\\/g, "/"));
    }
  }

  return files;
};

export interface LocalObjectEntry {
  key: string;
  size: number;
  lastModifiedMs: number;
}

export const listLocalKeysWithPrefix = async (prefix: string): Promise<string[]> => {
  const normalizedPrefix = normalizeKey(prefix);
  const allFiles = await walkFiles(LOCAL_STORAGE_ROOT);
  if (!normalizedPrefix) return allFiles;
  return allFiles.filter((key) => key.startsWith(normalizedPrefix));
};

export const listLocalObjectsWithPrefix = async (
  prefix: string
): Promise<LocalObjectEntry[]> => {
  const keys = await listLocalKeysWithPrefix(prefix);
  const objects = await Promise.all(
    keys.map(async (key) => {
      const { absolutePath } = resolveKeyPath(key);
      const metadata = await stat(absolutePath);
      return {
        key,
        size: metadata.size,
        lastModifiedMs: metadata.mtimeMs,
      };
    })
  );

  return objects;
};

export const deleteLocalByPrefix = async (prefix: string): Promise<number> => {
  const keys = await listLocalKeysWithPrefix(prefix);
  for (const key of keys) {
    const { absolutePath } = resolveKeyPath(key);
    await rm(absolutePath, { force: true });
  }
  return keys.length;
};

export const deleteLocalByKey = async (key: string): Promise<void> => {
  const { absolutePath } = resolveKeyPath(key);
  await rm(absolutePath, { force: true });
};

export const writeLocalJSON = async (key: string, data: object): Promise<void> => {
  const { absolutePath } = resolveKeyPath(key);
  await ensureParentDirectory(absolutePath);
  await writeFile(absolutePath, JSON.stringify(data, null, 2), "utf-8");
};

export const readLocalJSON = async <T = unknown>(key: string): Promise<T | null> => {
  try {
    const { absolutePath } = resolveKeyPath(key);
    if (!(await exists(absolutePath))) return null;
    const json = await readFile(absolutePath, "utf-8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
};
