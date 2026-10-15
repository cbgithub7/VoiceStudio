/** A pronunciation export `{ entries: [...] }` or a bare array of those entries. */
export function parsePronunciationImport(text: string): unknown[] {
  const parsed: unknown = JSON.parse(text);
  const imported = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'entries' in parsed
      ? (parsed as { entries?: unknown }).entries
      : null;
  if (!Array.isArray(imported)) throw new Error('invalid pronunciation import');
  return imported;
}
