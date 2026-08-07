/**
 * Reading the two tags that decide whether a page can be found.
 *
 * Only the `<head>` matters — a robots meta tag in the body is ignored by
 * crawlers — so only the head is read, which also keeps a scan over a large
 * static build cheap.
 *
 * The parsing is deliberately narrow. This is not an HTML parser; it looks for
 * two specific tags and reads two specific attributes, because that is the
 * whole question and a general parser would be a dependency and a much larger
 * surface for a tool people run on generated output.
 */

/** Robots directives that stop a page being indexed. */
const BLOCKING = new Set(['noindex', 'none']);

/** Meta names crawlers honour. `googlebot` overrides `robots` for Google. */
const ROBOTS_NAMES = new Set(['robots', 'googlebot', 'googlebot-news', 'bingbot']);

export interface HeadInfo {
  /** Every robots directive found, lowercased and de-duplicated. */
  readonly directives: string[];
  readonly noindex: boolean;
  readonly canonical?: string;
}

/** Extract the `<head>`, or the whole document when there is no head element. */
export function headOf(html: string): string {
  const open = /<head[\s>]/i.exec(html);
  if (open === null) return html.slice(0, 16_384);

  const close = /<\/head\s*>/i.exec(html);
  const start = open.index;
  const end = close === null ? Math.min(html.length, start + 16_384) : close.index;
  return html.slice(start, end);
}

/**
 * Read every `<meta>` and `<link>` in a fragment.
 *
 * Attribute order is not assumed — `content` before `name` is just as valid and
 * appears constantly in generated HTML.
 */
function* tags(fragment: string, tagName: string): Generator<Record<string, string>> {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fragment)) !== null) {
    const attributes: Record<string, string> = {};
    const attributePattern = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(match[1] ?? '')) !== null) {
      const key = (attribute[1] ?? '').toLowerCase();
      attributes[key] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    }

    yield attributes;
  }
}

export function readHead(html: string): HeadInfo {
  const head = headOf(html);
  const directives = new Set<string>();
  let canonical: string | undefined;

  for (const attributes of tags(head, 'meta')) {
    const name = (attributes['name'] ?? '').toLowerCase();
    if (!ROBOTS_NAMES.has(name)) continue;

    for (const directive of (attributes['content'] ?? '').split(',')) {
      const trimmed = directive.trim().toLowerCase();
      if (trimmed !== '') directives.add(trimmed);
    }
  }

  for (const attributes of tags(head, 'link')) {
    const rel = (attributes['rel'] ?? '').toLowerCase().trim();
    if (rel !== 'canonical') continue;
    const href = attributes['href'];
    if (href !== undefined && href.trim() !== '') canonical = href.trim();
  }

  const list = [...directives].sort();

  return {
    directives: list,
    noindex: list.some((directive) => BLOCKING.has(directive)),
    ...(canonical !== undefined ? { canonical } : {}),
  };
}

/** True when a robots directive value blocks indexing. */
export function blocksIndexing(value: string): boolean {
  return value
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .some((directive) => BLOCKING.has(directive));
}

/**
 * The URL path a built file serves at.
 *
 * `index.html` at the root is `/`; `about/index.html` is `/about`; and
 * `about.html` is `/about` too, since almost every static host serves it there.
 */
export function routeFor(filePath: string): string {
  const posix = filePath.replace(/\\/g, '/');
  const withoutIndex = posix.replace(/(?:^|\/)index\.html?$/i, '');
  const withoutExtension = withoutIndex.replace(/\.html?$/i, '');
  const trimmed = withoutExtension.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}

/**
 * The host of a canonical URL, when it has one.
 *
 * A relative canonical always points at the current site and is never a
 * problem, so it returns nothing rather than a host.
 */
export function canonicalHost(href: string): string | undefined {
  if (!/^https?:\/\//i.test(href)) return undefined;
  try {
    return new URL(href).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Hosts that are obviously not production.
 *
 * Used when no `--site` was given: a canonical pointing at one of these is
 * wrong whatever the real production host turns out to be, so the check still
 * works without configuration.
 */
const NON_PRODUCTION = [
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
  /^0\.0\.0\.0(:\d+)?$/,
  /^\[::1\](:\d+)?$/,
  /(^|\.)local$/,
  /(^|\.)test$/,
  /(^|\.)invalid$/,
  /^(?:staging|stage|dev|develop|preview|test|qa|uat|beta)\./,
  /\.(?:vercel|netlify|pages\.dev|onrender|fly\.dev|herokuapp)\.app$/,
  /\.netlify\.com$/,
  /\.ngrok(?:-free)?\.app$/,
];

export function looksNonProduction(host: string): boolean {
  return NON_PRODUCTION.some((pattern) => pattern.test(host));
}
