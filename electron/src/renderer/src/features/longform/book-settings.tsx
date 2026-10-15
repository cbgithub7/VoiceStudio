import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadIcon, ImagePlusIcon, TrashIcon, PlusIcon, UploadIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PipelineFailure } from '@/components/pipeline-failure';
import { apiJson, describeError } from '@/lib/api/client';
import { saveLocalFile } from '@/lib/local-export';
import { parsePronunciationImport } from '@/features/settings/parse-pronunciation-import';
import { metadataFields, duplicateWords } from './book-options';
import type { Draft } from './longform-session';

function lexiconRows(entries: unknown[]): { word: string; pronunciation: string }[] {
  const rows: { word: string; pronunciation: string }[] = [];
  for (const row of entries) {
    if (!row || typeof row !== 'object') throw new Error('invalid pronunciation import');
    const entry = row as { term?: unknown; replacement?: unknown };
    if (typeof entry.term !== 'string' || typeof entry.replacement !== 'string') {
      throw new Error('invalid pronunciation import');
    }
    const word = entry.term.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    const next = { word, pronunciation: entry.replacement };
    const index = rows.findIndex((item) => item.word.toLowerCase() === key);
    if (index >= 0) rows[index] = next;
    else rows.push(next);
  }
  if (rows.length === 0) throw new Error('invalid pronunciation import');
  return rows;
}
export function BookSettings({
  draft,
  disabled,
  pronunciation,
  onChange,
  onBusy,
}: {
  draft: Draft;
  disabled: boolean;
  pronunciation: boolean;
  onChange: (value: Partial<Draft>) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const lexiconFile = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [replaceLexicon, setReplaceLexicon] = useState(false);
  const [lexiconError, setLexiconError] = useState('');
  const [lexiconNotice, setLexiconNotice] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const upload = async (file: File) => {
    if (disabled || controller.current) return;
    const current = new AbortController();
    controller.current = current;
    onBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('cover', file);
      const result = await apiJson<{ path: string }>('/audiobook/cover', {
        method: 'POST',
        body,
        signal: current.signal,
      });
      if (!current.signal.aborted) {
        onChange({ cover: { path: result.path, name: file.name } });
        setPreview(URL.createObjectURL(file));
      }
    } catch (cause) {
      if (!current.signal.aborted) setError(describeError(cause));
    } finally {
      if (controller.current === current) {
        controller.current = null;
        onBusy(false);
      }
    }
  };
  return (
    <div className="space-y-5">
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-medium">{t('audiobook.details')}</summary>
        {metadataFields.map((field) => (
          <label key={field} className="block space-y-1 text-xs text-muted-foreground">
            {t('audiobook.meta_' + field)}
            <Input
              disabled={disabled}
              value={draft.metadata[field] || ''}
              onChange={(e) =>
                onChange({
                  metadata: { ...draft.metadata, [field]: e.target.value },
                })
              }
            />
          </label>
        ))}
        <input
          ref={input}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
        {preview && draft.cover && (
          <img
            src={preview}
            alt={t('audiobook.cover')}
            className="h-32 w-24 rounded-md object-cover"
          />
        )}
        {draft.cover && (
          <p className="break-all text-xs text-muted-foreground">{draft.cover.name}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ImagePlusIcon />
            {t('audiobook.cover_add')}
          </Button>
          {draft.cover && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onChange({ cover: null });
                setPreview('');
              }}
            >
              {t('audiobook.cover_remove')}
            </Button>
          )}
        </div>
        {error && <PipelineFailure fallback={error} onDismiss={() => setError(null)} />}
      </details>
      <details className="space-y-2">
        <summary className="cursor-pointer text-sm font-medium">{t('audiobook.loudness')}</summary>
        {(['off', 'acx', 'podcast'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            className="w-full justify-start"
            disabled={disabled}
            variant={draft.loudness === value ? 'secondary' : 'ghost'}
            onClick={() => onChange({ loudness: value })}
          >
            {t('audiobook.loudness_' + value)}
          </Button>
        ))}
      </details>
      {pronunciation && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-medium">{t('audiobook.lexicon')}</summary>
          <div className="flex items-center gap-2">
            <Switch
              id="audiobook-lexicon-replace"
              checked={replaceLexicon}
              disabled={disabled}
              aria-label={t('pronunciation.import_replace')}
              onCheckedChange={setReplaceLexicon}
            />
            <label htmlFor="audiobook-lexicon-replace" className="text-xs">
              {t('pronunciation.import_replace')}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => lexiconFile.current?.click()}
            >
              <UploadIcon />
              {t('pronunciation.import')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const entries = draft.lexicon
                  .filter((row) => row.word.trim())
                  .map((row) => ({ term: row.word, replacement: row.pronunciation }));
                void saveLocalFile(
                  new Blob([JSON.stringify({ entries }, null, 2)], { type: 'application/json' }),
                  'audiobook-lexicon.json',
                );
              }}
            >
              <DownloadIcon />
              {t('pronunciation.export')}
            </Button>
          </div>
          <input
            ref={lexiconFile}
            hidden
            type="file"
            accept="application/json,.json"
            aria-label={t('pronunciation.import')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file || disabled) return;
              setLexiconError('');
              setLexiconNotice('');
              void file.text().then(
                (text) => {
                  try {
                    const incoming = lexiconRows(parsePronunciationImport(text));
                    const next = replaceLexicon ? [] : draft.lexicon.map((row) => ({ ...row }));
                    for (const row of incoming) {
                      const key = row.word.toLowerCase();
                      const index = next.findIndex(
                        (item) => item.word.trim().toLowerCase() === key,
                      );
                      if (index >= 0) next[index] = row;
                      else next.push(row);
                    }
                    onChange({ lexicon: next });
                    setLexiconNotice(t('pronunciation.import_done', { count: incoming.length }));
                  } catch (cause) {
                    setLexiconError(
                      cause instanceof SyntaxError
                        ? describeError(cause)
                        : t('pronunciation.import_error'),
                    );
                  }
                },
                (cause) => setLexiconError(describeError(cause) || t('pronunciation.import_error')),
              );
            }}
          />
          {lexiconError && (
            <p role="alert" className="text-xs text-destructive">
              {lexiconError}
            </p>
          )}
          {lexiconNotice && (
            <p role="status" className="text-xs text-muted-foreground">
              {lexiconNotice}
            </p>
          )}
          {draft.lexicon.map((row, index) => (
            <div key={index} className="space-y-1">
              <Input
                aria-label={t('audiobook.lex_word')}
                placeholder={t('audiobook.lex_word')}
                value={row.word}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    lexicon: draft.lexicon.map((item, i) =>
                      i === index ? { ...item, word: e.target.value } : item,
                    ),
                  })
                }
              />
              <div className="flex gap-1">
                <Input
                  aria-label={t('audiobook.lex_say')}
                  placeholder={t('audiobook.lex_say')}
                  value={row.pronunciation}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      lexicon: draft.lexicon.map((item, i) =>
                        i === index ? { ...item, pronunciation: e.target.value } : item,
                      ),
                    })
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('audiobook.lex_remove')}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      lexicon: draft.lexicon.filter((_, i) => i !== index),
                    })
                  }
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({
                lexicon: [...draft.lexicon, { word: '', pronunciation: '' }],
              })
            }
          >
            <PlusIcon />
            {t('audiobook.lex_add')}
          </Button>
          {duplicateWords(draft.lexicon) && (
            <p role="alert" className="text-xs text-destructive">
              {t('audiobook.lex_duplicate')}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
