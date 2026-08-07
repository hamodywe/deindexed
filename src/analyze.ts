/**
 * The question: after this deploy, can search engines still see the site?
 *
 * The headline is a count — how many pages in this build are indexable — and
 * the severity of everything below it depends on **coverage**. Three pages
 * carrying `noindex` in a four-hundred-page build is somebody hiding a
 * thank-you page. Four hundred out of four hundred is the incident.
 *
 * That distinction is the whole reason this is a tool and not a grep.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { readHeaderRules, readRobots } from './scan/deploy.ts';
import { canonicalHost, looksNonProduction, readHead, routeFor } from './scan/html.ts';
import { matchesGlob } from './scan/glob.ts';
import {
  SEVERITIES,
  type Finding,
  type HeaderRule,
  type Page,
  type Report,
  type RobotsTxt,
  type Severity,
  type Summary,
} from './types.ts';

export const VERSION = '0.1.0';

/** Enough of a page to hold its head; the rest cannot contain a robots tag. */
const MAX_HEAD_BYTES = 64 * 1024;

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.cache', 'coverage']);
const MAX_DEPTH = 24;

export interface AnalyzeOptions {
  /** The directory about to be deployed. */
  readonly root: string;
  /** The production host, for the canonical check — `example.com`. */
  readonly site?: string;
  /** Route globs allowed to carry `noindex`. */
  readonly allowNoindex?: readonly string[];
}

export async function analyze(options: AnalyzeOptions): Promise<Report> {
  const root = path.resolve(options.root);
  const warnings: string[] = [];

  const site = normaliseHost(options.site);
  const allow = options.allowNoindex ?? [];

  const files = await collectHtml(root);
  if (files.length === 0) {
    warnings.push(`no HTML files found under ${path.basename(root)}`);
  }

  const pages: Page[] = [];

  for (const file of files) {
    const head = readHead(file.source);
    const host = head.canonical === undefined ? undefined : canonicalHost(head.canonical);
    const route = routeFor(file.path);

    const foreign =
      host !== undefined && (site !== null ? host !== site : looksNonProduction(host));

    pages.push({
      path: file.path,
      route,
      bytes: file.bytes,
      directives: head.directives,
      noindex: head.noindex,
      ...(head.canonical !== undefined ? { canonical: head.canonical } : {}),
      ...(foreign && host !== undefined ? { canonicalHost: host } : {}),
      allowed: allow.some((pattern) => matchesGlob(route.replace(/^\//, ''), pattern.replace(/^\//, ''))),
    });
  }

  pages.sort((a, b) => a.route.localeCompare(b.route));

  const deploy = await readHeaderRules(root);
  warnings.push(...deploy.warnings);

  const robots = await readRobots(root);

  if (site === null && pages.some((page) => page.canonical !== undefined)) {
    warnings.push(
      'no --site given, so canonical URLs are only checked against obviously non-production hosts',
    );
  }

  const findings = buildFindings(pages, deploy.rules, robots, site);

  return {
    schemaVersion: 1,
    tool: { name: 'deindexed', version: VERSION },
    root,
    site,
    pages,
    headerRules: deploy.rules,
    robots,
    findings,
    summary: summarise(pages, deploy.rules, findings),
    warnings,
  };
}

function buildFindings(
  pages: readonly Page[],
  rules: readonly HeaderRule[],
  robots: RobotsTxt | null,
  site: string | null,
): Finding[] {
  const findings: Finding[] = [];

  // 1. robots.txt blocking everything. One line, whole site, and it is the
  //    first thing a crawler reads.
  if (robots?.disallowsEverything === true) {
    findings.push({
      ruleId: 'robots-txt-blocks-everything',
      severity: 'critical',
      location: robots.file,
      line: 1,
      message: 'robots.txt disallows every path for every crawler.',
      consequence:
        'No search engine will crawl anything on this deploy. Pages already indexed drop out over the following days, and because crawling stops, the meta tags on those pages are never read either — which is why this also disables any recovery instruction you put in the HTML.',
      remediation:
        'Remove the `Disallow: /` under `User-agent: *`. If this file came from a staging build, the deploy pipeline is copying the wrong one.',
      evidence: ['User-agent: *', 'Disallow: /'],
    });
  }

  // 2. A header rule hiding everything. Invisible from the markup entirely.
  const blanket = rules.filter((rule) => rule.noindex && coversEverything(rule.pattern));
  if (blanket.length > 0) {
    const first = blanket[0] as HeaderRule;
    findings.push({
      ruleId: 'header-hides-everything',
      severity: 'critical',
      location: first.file,
      line: first.line,
      message: `\`X-Robots-Tag: ${first.value}\` is applied to every path.`,
      consequence:
        'Every page is served with a noindex header, which outranks anything in the HTML. Searching the codebase for "noindex" finds nothing, because this lives in deploy configuration — that is what makes it so hard to trace when the traffic goes.',
      remediation:
        'Remove the rule, or scope it to the paths that should be hidden. A staging-only header belongs in staging-only configuration.',
      evidence: blanket.map((rule) => `${rule.file}:${rule.line} — ${rule.pattern} → ${rule.value}`),
    });
  }

  // 3. Meta noindex. Severity by coverage: this is the distinction that makes
  //    the difference between a deliberate choice and an incident.
  const hidden = pages.filter((page) => page.noindex && !page.allowed);
  if (hidden.length > 0) {
    const everything = hidden.length === pages.length;
    const most = hidden.length / Math.max(1, pages.length) >= 0.5;

    findings.push({
      ruleId: everything ? 'every-page-is-noindex' : 'pages-are-noindex',
      severity: everything ? 'critical' : most ? 'error' : 'warning',
      location: hidden[0]?.path ?? '.',
      line: 1,
      message: everything
        ? `Every one of the ${pages.length} pages in this build carries a \`noindex\` robots tag.`
        : `${hidden.length} of ${pages.length} pages carry a \`noindex\` robots tag.`,
      consequence: everything
        ? 'This deploy removes the entire site from search results. It will not fail, no test will catch it, and the first symptom is the traffic graph several days later — by which time recovery takes weeks.'
        : 'These pages will be dropped from search results. That is correct for a thank-you page or an admin screen, and expensive for anything else — so the list is worth reading rather than dismissing.',
      remediation: everything
        ? 'Something is building with the staging configuration. Check the environment the build ran in before changing any markup.'
        : 'Confirm each page should be hidden. Add the ones that should to `allowNoindex` so they stop appearing here.',
      evidence: hidden.slice(0, 8).map((page) => `${page.route}  (${page.path}) — ${page.directives.join(', ')}`),
    });
  }

  // 4. The canonical case: the site is perfectly indexable and hands its
  //    ranking to another host.
  const foreign = pages.filter((page) => page.canonicalHost !== undefined);
  if (foreign.length > 0) {
    const hosts = [...new Set(foreign.map((page) => page.canonicalHost as string))];
    findings.push({
      ruleId: 'canonical-points-elsewhere',
      severity: hosts.some(looksNonProduction) ? 'critical' : 'error',
      location: foreign[0]?.path ?? '.',
      line: 1,
      message: `${foreign.length} page${foreign.length === 1 ? ' declares' : 's declare'} a canonical URL on ${hosts.map((host) => `\`${host}\``).join(', ')}.`,
      consequence:
        'A canonical tag tells search engines the real version of this page is somewhere else. Every one of these pages is indexable, crawlable, and voluntarily giving its ranking to another host — which is how a staging deploy takes a production site out of the results without either one changing.',
      remediation:
        site === null
          ? 'Pass --site with your production host so this can be checked exactly, then make the canonical absolute to that host or relative.'
          : `Point the canonical at \`${site}\`, or make it relative.`,
      evidence: foreign.slice(0, 8).map((page) => `${page.route} → ${page.canonical}`),
    });
  }

  // 5. Scoped header rules. Not a catastrophe, and worth listing because they
  //    are invisible in the HTML.
  const scoped = rules.filter((rule) => rule.noindex && !coversEverything(rule.pattern));
  if (scoped.length > 0) {
    findings.push({
      ruleId: 'header-hides-some-paths',
      severity: 'info',
      location: scoped[0]?.file ?? '.',
      line: scoped[0]?.line ?? 1,
      message: `${scoped.length} header rule${scoped.length === 1 ? '' : 's'} apply \`X-Robots-Tag: noindex\` to specific paths.`,
      consequence:
        'Nothing here is wrong. It is listed because a noindex set in deploy configuration does not appear in the HTML, so the next person to wonder why a page is missing will not find it by searching the source.',
      remediation: 'No action needed. Confirm the patterns still match what you intend.',
      evidence: scoped.slice(0, 8).map((rule) => `${rule.file}:${rule.line} — ${rule.pattern} → ${rule.value}`),
    });
  }

  // 6. Pages hidden on purpose. Reported so the allowlist stays honest.
  const allowed = pages.filter((page) => page.noindex && page.allowed);
  if (allowed.length > 0) {
    findings.push({
      ruleId: 'noindex-allowed',
      severity: 'info',
      location: allowed[0]?.path ?? '.',
      line: 1,
      message: `${allowed.length} page${allowed.length === 1 ? ' is' : 's are'} hidden on purpose.`,
      consequence: 'Matched by `allowNoindex`, so they are not a finding.',
      remediation: 'Remove entries from `allowNoindex` if a page should be indexed again.',
      evidence: allowed.slice(0, 8).map((page) => page.route),
    });
  }

  return findings.sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.location.localeCompare(b.location),
  );
}

/** True when a header pattern applies to the whole site. */
export function coversEverything(pattern: string): boolean {
  const trimmed = pattern.trim();
  return ['/*', '/**', '*', '/(.*)', '/:path*', '/', '(.*)'].includes(trimmed);
}

function summarise(
  pages: readonly Page[],
  rules: readonly HeaderRule[],
  findings: readonly Finding[],
): Summary {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const finding of findings) bySeverity[finding.severity] += 1;

  const blanketHeader = rules.some((rule) => rule.noindex && coversEverything(rule.pattern));

  return {
    pages: pages.length,
    // A blanket header hides everything regardless of what the markup says.
    indexable: blanketHeader ? 0 : pages.filter((page) => !page.noindex).length,
    metaNoindex: pages.filter((page) => page.noindex).length,
    allowed: pages.filter((page) => page.noindex && page.allowed).length,
    foreignCanonicals: pages.filter((page) => page.canonicalHost !== undefined).length,
    headerRules: rules.length,
    findings: findings.length,
    bySeverity,
  };
}

interface HtmlFile {
  readonly path: string;
  readonly source: string;
  readonly bytes: number;
}

async function collectHtml(root: string): Promise<HtmlFile[]> {
  const files: HtmlFile[] = [];

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;

    let entries: string[];
    try {
      // Sorted, so two scans of the same build produce identical reports.
      entries = (await readdir(directory)).sort();
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRECTORIES.has(entry) || entry.startsWith('.')) continue;

      const absolute = path.join(directory, entry);
      const info = await stat(absolute).catch(() => undefined);
      if (info === undefined) continue;

      if (info.isDirectory()) {
        await walk(absolute, depth + 1);
        continue;
      }
      if (!info.isFile() || !/\.html?$/i.test(entry)) continue;

      const handle = await import('node:fs/promises').then((fs) => fs.open(absolute, 'r'));
      try {
        const length = Math.min(info.size, MAX_HEAD_BYTES);
        const buffer = Buffer.alloc(Math.max(0, length));
        if (length > 0) await handle.read(buffer, 0, length, 0);
        files.push({
          path: toPosix(path.relative(root, absolute)),
          source: buffer.toString('utf8'),
          bytes: info.size,
        });
      } finally {
        await handle.close();
      }
    }
  };

  await walk(root, 0);
  return files;
}

function normaliseHost(site: string | undefined): string | null {
  if (site === undefined || site.trim() === '') return null;

  const text = site.trim();
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).host.toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}
