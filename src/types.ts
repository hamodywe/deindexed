/**
 * The vocabulary.
 *
 * One question: **after this deploy, can search engines still see the site?**
 *
 * The failure is famous and expensive. A `noindex` added to a staging build
 * survives into production, the deploy succeeds, every test passes, and the
 * site quietly disappears from Google over the following days. Nobody finds out
 * from CI. They find out from a traffic graph, and by then the recovery takes
 * weeks.
 *
 * Every prevention people are usually offered — Search Console, the robots.txt
 * tester, a crawler — runs *after* the deploy. This runs before it, against the
 * directory about to ship.
 *
 * Four mechanisms can hide a page, and they are kept apart because they live in
 * different files and are fixed by different people:
 *
 *  - a `noindex` robots meta tag in the HTML,
 *  - an `X-Robots-Tag: noindex` response header, set in deploy config,
 *  - `Disallow: /` in robots.txt,
 *  - a canonical URL pointing at a host that is not this site — which hands
 *    the ranking to staging, and is the one people never suspect.
 */

export const SEVERITIES = ['critical', 'error', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b);
}

export function isAtLeast(severity: Severity, threshold: Severity): boolean {
  return compareSeverity(severity, threshold) <= 0;
}

/** How a page ends up hidden. */
export type BlockKind =
  /** `<meta name="robots" content="noindex">` or the googlebot variant. */
  | 'meta-noindex'
  /** `X-Robots-Tag: noindex`, from a headers configuration file. */
  | 'header-noindex'
  /** `Disallow: /` in robots.txt. */
  | 'robots-disallow-all'
  /** A canonical URL pointing at another host. */
  | 'foreign-canonical';

export interface Page {
  /** Path relative to the scanned directory, POSIX-separated. */
  readonly path: string;
  /** The URL path this file serves at — `about/index.html` becomes `/about`. */
  readonly route: string;
  readonly bytes: number;
  /** The robots directives found in the document, lowercased. */
  readonly directives: readonly string[];
  /** True when a directive prevents indexing. */
  readonly noindex: boolean;
  /** The canonical URL as written, when there is one. */
  readonly canonical?: string;
  /** Set when the canonical points at a different host. */
  readonly canonicalHost?: string;
  /** True when the page was explicitly allowed to be hidden. */
  readonly allowed: boolean;
}

/** A rule from a deploy configuration that sets `X-Robots-Tag`. */
export interface HeaderRule {
  /** The configuration file it came from, relative to the root. */
  readonly file: string;
  /** The path pattern it applies to, as written. */
  readonly pattern: string;
  readonly value: string;
  readonly noindex: boolean;
  readonly line: number;
}

/** What robots.txt says. */
export interface RobotsTxt {
  readonly file: string;
  /** True when `User-agent: *` is followed by a bare `Disallow: /`. */
  readonly disallowsEverything: boolean;
  /** User agents blocked entirely, when narrower than everything. */
  readonly blockedAgents: readonly string[];
  readonly sitemaps: readonly string[];
}

export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly location: string;
  readonly line: number;
  readonly message: string;
  /** What it costs, concretely. */
  readonly consequence: string;
  readonly remediation: string;
  readonly evidence: readonly string[];
}

export interface Summary {
  readonly pages: number;
  /** Pages a search engine would be allowed to index. */
  readonly indexable: number;
  /** Pages hidden by a meta tag. */
  readonly metaNoindex: number;
  /** Pages hidden and explicitly allowed to be. */
  readonly allowed: number;
  readonly foreignCanonicals: number;
  readonly headerRules: number;
  readonly findings: number;
  readonly bySeverity: Readonly<Record<Severity, number>>;
}

export interface Report {
  readonly schemaVersion: 1;
  readonly tool: { readonly name: string; readonly version: string };
  readonly root: string;
  /** The production host, when one was given. Canonical checks need it. */
  readonly site: string | null;
  readonly pages: readonly Page[];
  readonly headerRules: readonly HeaderRule[];
  readonly robots: RobotsTxt | null;
  readonly findings: readonly Finding[];
  readonly summary: Summary;
  readonly warnings: readonly string[];
}
