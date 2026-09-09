import {
  deleteLocalByKey,
  getLocalStorageRoot,
  listLocalObjectsWithPrefix,
  type LocalObjectEntry,
} from "../lib/localObjectStore";

const args = process.argv.slice(2);

const getArgValue = (name: string): string | null => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return null;
};

const hasFlag = (flag: string): boolean => args.includes(flag);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(2)} ${unit}`;
};

const daysRaw = getArgValue("--days");
const parsedDays = daysRaw === null ? 7 : Number(daysRaw);
if (!Number.isFinite(parsedDays) || parsedDays < 0) {
  console.error("Invalid --days value. Use a number >= 0.");
  process.exit(1);
}

const dryRun = !hasFlag("--apply") && !hasFlag("--yes");
const all = hasFlag("--all");
const prefixes = ["room-", "state-backup/"];

const collect = async (): Promise<LocalObjectEntry[]> => {
  const byKey = new Map<string, LocalObjectEntry>();

  for (const prefix of prefixes) {
    const entries = await listLocalObjectsWithPrefix(prefix);
    entries.forEach((entry) => byKey.set(entry.key, entry));
  }

  return Array.from(byKey.values());
};

const now = Date.now();
const cutoffMs = now - parsedDays * 24 * 60 * 60 * 1000;

const allEntries = await collect();
const targets = all
  ? allEntries
  : allEntries.filter((entry) => entry.lastModifiedMs < cutoffMs);

const totalBytes = targets.reduce((sum, entry) => sum + entry.size, 0);

console.log("Local storage cleanup");
console.log(`Path: ${getLocalStorageRoot()}`);
console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
console.log(`Selection: ${all ? "all files" : `older than ${parsedDays} day(s)`}`);
console.log(`Candidates: ${targets.length} file(s), ${formatBytes(totalBytes)}`);

if (targets.length === 0) {
  console.log("Nothing to clean.");
  process.exit(0);
}

const preview = targets
  .sort((a, b) => a.lastModifiedMs - b.lastModifiedMs)
  .slice(0, 20);

console.log("Preview (up to 20 files):");
preview.forEach((entry) => {
  const when = new Date(entry.lastModifiedMs).toISOString();
  console.log(`- ${entry.key} | ${formatBytes(entry.size)} | ${when}`);
});

if (dryRun) {
  console.log("Dry-run only. Re-run with --apply to delete these files.");
  process.exit(0);
}

let deleted = 0;
for (const entry of targets) {
  await deleteLocalByKey(entry.key);
  deleted += 1;
}

console.log(`Deleted ${deleted} file(s), freed ${formatBytes(totalBytes)}.`);
