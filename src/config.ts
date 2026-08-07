/**
 * Configuration.
 *
 * Two settings, and both exist because the tool cannot know them by looking.
 *
 * `site` is the production host. Without it the canonical check can only spot
 * hosts that are obviously not production — `localhost`, a preview domain, a
 * `staging.` prefix — which catches the common cases and misses a canonical
 * pointing at a different real domain.
 *
 * `allowNoindex` is the list of routes that are meant to be hidden. A login
 * page, a thank-you page, an internal admin screen: hiding those is correct,
 * and a tool that keeps reporting them trains people to ignore it.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseJsonc } from './jsonc.ts';

export const CONFIG_FILENAME = 'deindexed.config.json';

export interface Config {
  readonly site?: string;
  readonly allowNoindex: readonly string[];
}

export const DEFAULT_CONFIG: Config = { allowNoindex: [] };

export interface LoadedConfig {
  readonly config: Config;
  readonly file?: string;
  readonly warnings: readonly string[];
}

export function parseConfig(text: string): { config: Config; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = parseJsonc(text);

  if (!isRecord(parsed)) {
    warnings.push('deindexed.config.json is not a JSON object and was ignored');
    return { config: DEFAULT_CONFIG, warnings };
  }

  const site = typeof parsed['site'] === 'string' && parsed['site'].trim() !== ''
    ? parsed['site'].trim()
    : undefined;

  if (parsed['site'] !== undefined && site === undefined) {
    warnings.push('"site" must be a non-empty string; ignoring it');
  }

  const allowNoindex: string[] = [];
  const raw = parsed['allowNoindex'];

  if (raw !== undefined) {
    if (Array.isArray(raw)) {
      for (const value of raw) {
        if (typeof value === 'string' && value.trim() !== '') allowNoindex.push(value.trim());
        else warnings.push('"allowNoindex" entries must be non-empty strings; skipped one');
      }
    } else {
      warnings.push('"allowNoindex" must be an array of route globs; using an empty list');
    }
  }

  return { config: { ...(site !== undefined ? { site } : {}), allowNoindex }, warnings };
}

/**
 * Load configuration.
 *
 * Looked for beside the scanned directory as well as inside it, because the
 * directory scanned is usually `dist` and the configuration belongs in the
 * repository rather than in build output.
 */
export async function loadConfig(root: string): Promise<LoadedConfig> {
  const resolved = path.resolve(root);

  for (const directory of [resolved, path.dirname(resolved)]) {
    const file = path.join(directory, CONFIG_FILENAME);
    const text = await readFile(file, 'utf8').catch(() => undefined);
    if (text === undefined) continue;

    const { config, warnings } = parseConfig(text);
    return { config, file: CONFIG_FILENAME, warnings };
  }

  return { config: DEFAULT_CONFIG, warnings: [] };
}
