/**
 * Normalize free text for fuzzy title/artist matching: lowercase, strip a
 * trailing file extension, collapse everything else to single spaces. Used
 * to match a Telegram caption or a queued Spotify track's title against a
 * candidate audio file's name/tags. Shared by telegram/bot.ts (caption
 * matching) and lib/library.ts (folder-import + resolver matching) so both
 * paths agree on what counts as "the same track".
 */
export const normalizeForMatch = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
