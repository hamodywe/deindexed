/**
 * Reading the deploy configuration that can hide a site without touching a
 * single HTML file.
 *
 * `X-Robots-Tag: noindex` in a headers file outranks everything in the markup
 * and appears in none of it. A team can search the whole codebase for
 * "noindex", find nothing, and still be invisible — because the directive lives
 * in `_headers`, or in six lines of `netlify.toml`, or in an nginx snippet
 * nobody has opened since the site launched.
 *
 * Five formats are read. None is parsed completely: each is scanned for the one
 * header that matters, which keeps this a hundred lines instead of three
 * dependencies.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseJsonc } from '../jsonc.ts';
import { blocksIndexing } from './html.ts';
import type { HeaderRule, RobotsTxt } from '../types.ts';

/** Files that can set response headers on a static deploy. */
const HEADER_FILES = [
  '_headers',
  'public/_headers',
  'static/_headers',
  'dist/_headers',
  'netlify.toml',
  'vercel.json',
  'firebase.json',
  'staticwebapp.config.json',
  '.htaccess',
  'nginx.conf',
];

export interface DeployConfig {
  readonly rules: HeaderRule[];
  readonly warnings: string[];
}

export async function readHeaderRules(root: string): Promise<DeployConfig> {
  const rules: HeaderRule[] = [];
  const warnings: string[] = [];

  for (const relative of HEADER_FILES) {
    const absolute = path.join(root, relative);
    const info = await stat(absolute).catch(() => undefined);
    if (info === undefined || !info.isFile()) continue;

    const source = await readFile(absolute, 'utf8').catch(() => undefined);
    if (source === undefined) continue;

    const base = path.basename(relative).toLowerCase();

    if (base === '_headers') rules.push(...parseNetlifyHeaders(source, relative));
    else if (base === 'netlify.toml') rules.push(...parseToml(source, relative));
    else if (base.endsWith('.json')) {
      const parsed = parseJsonc(source);
      if (parsed === undefined) warnings.push(`${relative} could not be parsed`);
      else rules.push(...parseJsonHeaders(parsed, relative, source));
    } else rules.push(...parseTextConfig(source, relative));
  }

  return { rules, warnings };
}

/**
 * Netlify's `_headers`: a path on its own line, then indented `Name: value`
 * pairs beneath it.
 */
export function parseNetlifyHeaders(source: string, file: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let pattern = '/*';

  for (const [index, raw] of source.split('\n').entries()) {
    const line = raw.replace(/#.*$/, '');
    if (line.trim() === '') continue;

    if (!/^\s/.test(raw)) {
      pattern = line.trim();
      continue;
    }

    const header = /^\s*([A-Za-z-]+)\s*:\s*(.+)$/.exec(line);
    const name = header?.[1]?.toLowerCase();
    const value = header?.[2]?.trim();
    if (name !== 'x-robots-tag' || value === undefined) continue;

    rules.push({ file, pattern, value, noindex: blocksIndexing(value), line: index + 1 });
  }

  return rules;
}

/**
 * `netlify.toml`, read as text.
 *
 * A TOML parser would be a dependency for one header, and the shape here is
 * fixed: a `[[headers]]` table with a `for` key and a `[headers.values]`
 * sub-table. Reading it as text is honest about how narrow the question is.
 */
export function parseToml(source: string, file: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let pattern = '/*';

  for (const [index, raw] of source.split('\n').entries()) {
    const line = raw.replace(/#.*$/, '').trim();

    const forKey = /^for\s*=\s*["']([^"']+)["']/.exec(line);
    if (forKey?.[1] !== undefined) {
      pattern = forKey[1];
      continue;
    }

    const header = /^["']?X-Robots-Tag["']?\s*=\s*["']([^"']+)["']/i.exec(line);
    const value = header?.[1];
    if (value === undefined) continue;

    rules.push({ file, pattern, value, noindex: blocksIndexing(value), line: index + 1 });
  }

  return rules;
}

/**
 * `vercel.json`, `firebase.json` and the Azure Static Web Apps config.
 *
 * All three carry a `headers` array of `{ source | route, headers: [...] }`,
 * and the differences between them do not matter for this one header.
 */
export function parseJsonHeaders(parsed: unknown, file: string, source: string): HeaderRule[] {
  const rules: HeaderRule[] = [];

  const visitList = (list: unknown): void => {
    if (!Array.isArray(list)) return;

    for (const entry of list) {
      if (!isRecord(entry)) continue;

      const pattern =
        (typeof entry['source'] === 'string' && entry['source']) ||
        (typeof entry['route'] === 'string' && entry['route']) ||
        (typeof entry['src'] === 'string' && entry['src']) ||
        '/*';

      const headers = entry['headers'];

      // Either an array of {key, value} or an object of name -> value.
      if (Array.isArray(headers)) {
        for (const header of headers) {
          if (!isRecord(header)) continue;
          const name = String(header['key'] ?? '').toLowerCase();
          const value = header['value'];
          if (name !== 'x-robots-tag' || typeof value !== 'string') continue;
          rules.push({ file, pattern, value, noindex: blocksIndexing(value), line: lineOf(source, value) });
        }
      } else if (isRecord(headers)) {
        for (const [name, value] of Object.entries(headers)) {
          if (name.toLowerCase() !== 'x-robots-tag' || typeof value !== 'string') continue;
          rules.push({ file, pattern, value, noindex: blocksIndexing(value), line: lineOf(source, value) });
        }
      }
    }
  };

  if (isRecord(parsed)) {
    visitList(parsed['headers']);
    visitList(parsed['routes']);

    const hosting = parsed['hosting'];
    if (isRecord(hosting)) visitList(hosting['headers']);
    if (Array.isArray(hosting)) for (const site of hosting) if (isRecord(site)) visitList(site['headers']);

    const globalHeaders = parsed['globalHeaders'];
    if (isRecord(globalHeaders)) {
      for (const [name, value] of Object.entries(globalHeaders)) {
        if (name.toLowerCase() !== 'x-robots-tag' || typeof value !== 'string') continue;
        rules.push({ file, pattern: '/*', value, noindex: blocksIndexing(value), line: lineOf(source, value) });
      }
    }
  }

  return rules;
}

/** `.htaccess` and nginx: `Header set` and `add_header` respectively. */
export function parseTextConfig(source: string, file: string): HeaderRule[] {
  const rules: HeaderRule[] = [];

  for (const [index, raw] of source.split('\n').entries()) {
    const line = raw.replace(/#.*$/, '').trim();

    const match =
      /^Header\s+(?:always\s+)?set\s+["']?X-Robots-Tag["']?\s+["']?([^"';]+)["']?/i.exec(line) ??
      /^add_header\s+X-Robots-Tag\s+["']?([^"';]+)["']?/i.exec(line);

    const value = match?.[1]?.trim();
    if (value === undefined) continue;

    rules.push({ file, pattern: '/*', value, noindex: blocksIndexing(value), line: index + 1 });
  }

  return rules;
}

/**
 * Read robots.txt.
 *
 * The only case that matters is a `Disallow: /` under `User-agent: *` — a bare
 * slash, which blocks everything. `Disallow: /admin` is somebody doing their
 * job, and `Disallow:` with no value explicitly allows everything.
 */
export async function readRobots(root: string): Promise<RobotsTxt | null> {
  for (const relative of ['robots.txt', 'public/robots.txt', 'static/robots.txt']) {
    const absolute = path.join(root, relative);
    const source = await readFile(absolute, 'utf8').catch(() => undefined);
    if (source === undefined) continue;

    let agent = '*';
    let disallowsEverything = false;
    const blockedAgents: string[] = [];
    const sitemaps: string[] = [];

    for (const raw of source.split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (line === '') continue;

      const agentLine = /^user-agent\s*:\s*(.+)$/i.exec(line);
      if (agentLine?.[1] !== undefined) {
        agent = agentLine[1].trim();
        continue;
      }

      const sitemap = /^sitemap\s*:\s*(.+)$/i.exec(line);
      if (sitemap?.[1] !== undefined) {
        sitemaps.push(sitemap[1].trim());
        continue;
      }

      const disallow = /^disallow\s*:\s*(.*)$/i.exec(line);
      if (disallow === null) continue;

      if ((disallow[1] ?? '').trim() === '/') {
        if (agent === '*') disallowsEverything = true;
        else blockedAgents.push(agent);
      }
    }

    return { file: relative, disallowsEverything, blockedAgents, sitemaps };
  }

  return null;
}

function lineOf(source: string, needle: string): number {
  const index = source.indexOf(needle);
  if (index === -1) return 1;

  let line = 1;
  for (let i = 0; i < index; i += 1) if (source.charCodeAt(i) === 10) line += 1;
  return line;
}
