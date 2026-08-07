import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { analyze, coversEverything } from '../src/analyze.ts';
import { parseConfig } from '../src/config.ts';
import {
  blocksIndexing,
  canonicalHost,
  looksNonProduction,
  readHead,
  routeFor,
} from '../src/scan/html.ts';
import {
  parseJsonHeaders,
  parseNetlifyHeaders,
  parseTextConfig,
  parseToml,
} from '../src/scan/deploy.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VANISHED = path.join(REPO_ROOT, 'examples', 'vanished');
const INDEXED = path.join(REPO_ROOT, 'examples', 'indexed');

function ruleIds(findings: readonly { ruleId: string }[]): string[] {
  return [...new Set(findings.map((finding) => finding.ruleId))].sort();
}

const html = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`;

describe('reading the head', () => {
  it('finds a robots noindex', () => {
    const info = readHead(html('<meta name="robots" content="noindex, nofollow">'));
    assert.equal(info.noindex, true);
    assert.deepEqual(info.directives, ['nofollow', 'noindex']);
  });

  it('honours the googlebot variant, which overrides robots for Google', () => {
    assert.equal(readHead(html('<meta name="googlebot" content="noindex">')).noindex, true);
  });

  it('treats "none" as blocking, because it means noindex, nofollow', () => {
    assert.equal(readHead(html('<meta name="robots" content="none">')).noindex, true);
  });

  it('leaves an indexable page alone', () => {
    const info = readHead(html('<meta name="robots" content="index, follow">'));
    assert.equal(info.noindex, false);
  });

  it('does not care about attribute order', () => {
    // Generated HTML puts these either way round constantly.
    assert.equal(readHead(html('<meta content="noindex" name="robots">')).noindex, true);
  });

  it('accepts single quotes and no quotes', () => {
    assert.equal(readHead(html("<meta name='robots' content='noindex'>")).noindex, true);
    assert.equal(readHead(html('<meta name=robots content=noindex>')).noindex, true);
  });

  it('ignores a robots tag outside the head, as crawlers do', () => {
    const body = '<html><head><title>a</title></head><body><meta name="robots" content="noindex"></body></html>';
    assert.equal(readHead(body).noindex, false);
  });

  it('ignores an unrelated meta tag', () => {
    assert.equal(readHead(html('<meta name="description" content="noindex is a word">')).noindex, false);
  });

  it('reads a canonical link', () => {
    const info = readHead(html('<link rel="canonical" href="https://example.com/a">'));
    assert.equal(info.canonical, 'https://example.com/a');
  });

  it('ignores a link that is not canonical', () => {
    assert.equal(readHead(html('<link rel="alternate" href="https://other.com/">')).canonical, undefined);
  });
});

describe('directive parsing', () => {
  it('recognises the blocking values', () => {
    assert.equal(blocksIndexing('noindex'), true);
    assert.equal(blocksIndexing('none'), true);
    assert.equal(blocksIndexing('all'), false);
    assert.equal(blocksIndexing('nofollow'), false, 'nofollow alone still allows indexing');
  });

  it('handles a list with spacing and case', () => {
    assert.equal(blocksIndexing('  NoIndex , nofollow '), true);
  });
});

describe('routes and hosts', () => {
  it('maps files to the paths they serve at', () => {
    assert.equal(routeFor('index.html'), '/');
    assert.equal(routeFor('about/index.html'), '/about');
    assert.equal(routeFor('about.html'), '/about');
    assert.equal(routeFor('blog/launch/index.html'), '/blog/launch');
  });

  it('reads the host from an absolute canonical only', () => {
    assert.equal(canonicalHost('https://example.com/a'), 'example.com');
    // A relative canonical always points at this site and is never a problem.
    assert.equal(canonicalHost('/a'), undefined);
  });

  it('recognises hosts that are obviously not production', () => {
    for (const host of [
      'localhost:3000',
      'staging.example.com',
      'preview.example.com',
      'acme-git-main.vercel.app',
      'site.netlify.app',
      'app.local',
    ]) {
      assert.equal(looksNonProduction(host), true, host);
    }

    assert.equal(looksNonProduction('example.com'), false);
    assert.equal(looksNonProduction('www.example.com'), false);
  });
});

describe('deploy configuration', () => {
  it('reads Netlify _headers, scoping each rule to its path block', () => {
    const rules = parseNetlifyHeaders(
      '/*\n  X-Robots-Tag: noindex\n\n/blog/*\n  Cache-Control: max-age=60\n',
      '_headers',
    );
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.pattern, '/*');
    assert.equal(rules[0]?.noindex, true);
  });

  it('reads netlify.toml', () => {
    const rules = parseToml(
      '[[headers]]\n  for = "/admin/*"\n  [headers.values]\n    X-Robots-Tag = "noindex"\n',
      'netlify.toml',
    );
    assert.equal(rules[0]?.pattern, '/admin/*');
    assert.equal(rules[0]?.noindex, true);
  });

  it('reads a vercel.json headers array', () => {
    const source = JSON.stringify({
      headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }],
    });
    const rules = parseJsonHeaders(JSON.parse(source), 'vercel.json', source);
    assert.equal(rules[0]?.pattern, '/(.*)');
    assert.equal(rules[0]?.noindex, true);
  });

  it('reads nginx and htaccess forms', () => {
    assert.equal(parseTextConfig('add_header X-Robots-Tag "noindex";', 'nginx.conf')[0]?.noindex, true);
    assert.equal(
      parseTextConfig('Header always set X-Robots-Tag "noindex"', '.htaccess')[0]?.noindex,
      true,
    );
  });

  it('ignores a header that is not X-Robots-Tag', () => {
    assert.deepEqual(parseNetlifyHeaders('/*\n  X-Frame-Options: DENY\n', '_headers'), []);
  });

  it('knows which patterns cover the whole site', () => {
    for (const pattern of ['/*', '/**', '/(.*)', '/:path*', '/']) {
      assert.equal(coversEverything(pattern), true, pattern);
    }
    assert.equal(coversEverything('/admin/*'), false);
  });
});

describe('configuration', () => {
  it('reads a site and an allowlist', () => {
    const { config, warnings } = parseConfig('{"site":"example.com","allowNoindex":["thank-you"]}');
    assert.equal(config.site, 'example.com');
    assert.deepEqual(config.allowNoindex, ['thank-you']);
    assert.deepEqual(warnings, []);
  });

  it('warns and falls back on a bad value', () => {
    const { config, warnings } = parseConfig('{"allowNoindex":"nope"}');
    assert.deepEqual(config.allowNoindex, []);
    assert.equal(warnings.length, 1);
  });
});

describe('the vanished fixture', () => {
  it('finds all four mechanisms', async () => {
    const report = await analyze({ root: VANISHED, site: 'example.com' });
    const rules = ruleIds(report.findings);

    assert.ok(rules.includes('robots-txt-blocks-everything'));
    assert.ok(rules.includes('header-hides-everything'));
    assert.ok(rules.includes('canonical-points-elsewhere'));
    assert.ok(rules.some((id) => id.includes('noindex')));
  });

  it('reports nothing as indexable, because the header alone hides everything', async () => {
    const report = await analyze({ root: VANISHED, site: 'example.com' });
    assert.equal(report.summary.indexable, 0);
    assert.equal(report.summary.pages, 5);
  });

  it('rates a preview-host canonical as critical', async () => {
    const report = await analyze({ root: VANISHED, site: 'example.com' });
    const finding = report.findings.find((entry) => entry.ruleId === 'canonical-points-elsewhere');
    assert.equal(finding?.severity, 'critical');
  });

  it('still catches the preview canonical without --site', async () => {
    // The non-production host list is what makes the tool useful before
    // anybody configures it.
    const report = await analyze({ root: VANISHED });
    assert.ok(ruleIds(report.findings).includes('canonical-points-elsewhere'));
  });
});

describe('the indexed fixture', () => {
  it('reports only the deliberate exclusion', async () => {
    const report = await analyze({
      root: INDEXED,
      site: 'example.com',
      allowNoindex: ['thank-you', 'admin/**'],
    });

    assert.deepEqual(ruleIds(report.findings), ['noindex-allowed']);
    assert.equal(report.findings[0]?.severity, 'info');
  });

  it('counts the allowed page as hidden but not as a problem', async () => {
    const report = await analyze({
      root: INDEXED,
      site: 'example.com',
      allowNoindex: ['thank-you'],
    });
    assert.equal(report.summary.pages, 4);
    assert.equal(report.summary.indexable, 3);
    assert.equal(report.summary.allowed, 1);
  });

  it('accepts a relative canonical and one on the production host', async () => {
    const report = await analyze({ root: INDEXED, site: 'example.com' });
    assert.equal(report.summary.foreignCanonicals, 0);
  });

  it('does not report a robots.txt that blocks only one path', async () => {
    const report = await analyze({ root: INDEXED, site: 'example.com' });
    assert.equal(report.robots?.disallowsEverything, false);
    assert.ok(!ruleIds(report.findings).includes('robots-txt-blocks-everything'));
  });

  it('reports the allowed page as a finding only at info', async () => {
    const report = await analyze({ root: INDEXED, site: 'example.com', allowNoindex: ['thank-you'] });
    assert.equal(report.findings.filter((entry) => entry.severity !== 'info').length, 0);
  });

  it('produces the same report twice', async () => {
    assert.equal(
      JSON.stringify(await analyze({ root: INDEXED, site: 'example.com' })),
      JSON.stringify(await analyze({ root: INDEXED, site: 'example.com' })),
    );
  });
});

describe('a directory with nothing to check', () => {
  it('says so rather than reporting clean', async () => {
    const report = await analyze({ root: path.join(REPO_ROOT, 'src') });
    assert.equal(report.summary.pages, 0);
    assert.equal(report.warnings.length, 1);
  });
});
