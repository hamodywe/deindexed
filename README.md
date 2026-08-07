# deindexed

**Will this deploy be invisible to Google? Find out before you ship it, not from the traffic graph.**

[![CI](https://github.com/hamodywe/deindexed/actions/workflows/ci.yml/badge.svg)](https://github.com/hamodywe/deindexed/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deindexed.svg)](https://www.npmjs.com/package/deindexed)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

---

## The problem

Somebody adds `noindex` so the staging site stays out of Google. Reasonable, and
correct.

Weeks later it ships. The build succeeds. Every test passes. The deploy is
green. Over the following days the site drops out of search results, and the
first anyone knows is a traffic graph and a panic.

> *A sprint deployed on a Thursday evening accidentally pushed code with noindex
> tags live on every page.*

Recovery takes weeks, because getting re-indexed is not the same speed as
getting de-indexed.

**Every prevention normally offered runs after the deploy** — Search Console,
the robots.txt tester, a crawler. This one runs before it, against the directory
about to ship.

And there are four ways in, living in four different files:

| Where | What |
| --- | --- |
| the HTML | `<meta name="robots" content="noindex">` |
| deploy config | `X-Robots-Tag: noindex` — **invisible from the markup** |
| `robots.txt` | `Disallow: /` |
| the HTML | a canonical pointing at staging — indexable, and handing its ranking away |

The third is the bluntest. The second is the one nobody finds: you can grep the
entire codebase for "noindex", get zero results, and still be invisible, because
it lives in `_headers` or six lines of `netlify.toml`.

The fourth is the cruellest, and it has taken production sites out of the
results **without production changing at all**.

## What it looks like

```console
$ npm run build && npx deindexed dist --site example.com

5 pages · 0 indexable · 5 hidden
                                   0%

critical header-hides-everything _headers
  `X-Robots-Tag: noindex` is applied to every path.
  so: Every page is served with a noindex header, which outranks anything in
      the HTML. Searching the codebase for "noindex" finds nothing, because
      this lives in deploy configuration — that is what makes it so hard to
      trace when the traffic goes.
    _headers:3 — /* → noindex

critical canonical-points-elsewhere contact/index.html
  1 page declares a canonical URL on `acme-site-git-main.vercel.app`.
  so: That page is indexable, crawlable, and voluntarily giving its ranking to
      another host.
    /contact → https://acme-site-git-main.vercel.app/contact
```

The headline is the number to watch: **how many pages a search engine is allowed
to index.** Record it per deploy and a drop is visible before the traffic is.

## Install

```sh
npx deindexed dist --site example.com
```

Or as a dev dependency:

```sh
npm install --save-dev deindexed
```

Requires Node 20.10 or newer. **Zero dependencies.**

## Use it

```sh
deindexed dist --site example.com
deindexed dist --allow thank-you --allow 'admin/**'
deindexed dist --verbose
deindexed dist --json
```

Or put it in `deindexed.config.json` and pass nothing:

```json
{
  "site": "example.com",
  "allowNoindex": ["thank-you", "admin/**"]
}
```

In CI, after the build and before the deploy:

```yaml
- run: npm run build
- run: npx deindexed dist --site example.com
```

Exit codes: `0` clean, `1` findings at or above the threshold, `2` bad usage.

## Severity follows coverage

This is the whole reason it is a tool and not a `grep`.

| Situation | Severity |
| --- | --- |
| every page carries `noindex` | **critical** — this is the incident |
| more than half do | error |
| a handful do | warning — read the list, it is probably fine |
| the ones you declared in `allowNoindex` | info |

Three `noindex` pages in a four-hundred-page build is somebody hiding a
thank-you page. Four hundred out of four hundred is a company's Monday morning.

## What it reads

| | |
| --- | --- |
| **HTML** | `robots`, `googlebot`, `bingbot` meta tags, and `<link rel="canonical">` — `<head>` only, as crawlers do |
| **Headers** | `_headers`, `netlify.toml`, `vercel.json`, `firebase.json`, `staticwebapp.config.json`, `.htaccess`, `nginx.conf` |
| **robots.txt** | `Disallow: /` under `User-agent: *`, plus per-agent blocks |

## The rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `robots-txt-blocks-everything` | critical | `Disallow: /` for every crawler |
| `header-hides-everything` | critical | `X-Robots-Tag: noindex` on every path |
| `every-page-is-noindex` | critical | every page in the build |
| `canonical-points-elsewhere` | critical / error | ranking handed to another host |
| `pages-are-noindex` | error / warning | some pages, by coverage |
| `header-hides-some-paths` | info | scoped header rules, listed because they are invisible in HTML |
| `noindex-allowed` | info | the pages you said were deliberate |

Details: [docs/rules.md](docs/rules.md).

## Try it

```sh
git clone https://github.com/hamodywe/deindexed && cd deindexed
npm install
node src/cli.ts examples/vanished --site example.com   # all four mechanisms
node src/cli.ts examples/indexed                       # silence
```

## Design notes

**It works before you configure it.** Without `--site`, canonicals are still
checked against hosts that are obviously not production — `localhost`, a
`vercel.app` preview, a `staging.` prefix. Pass `--site` and the check becomes
exact.

**A blanket header means zero indexable pages, whatever the markup says.** The
count reflects what a crawler will actually see, not what the HTML hopes.

**Only the `<head>` is read**, both because that is where crawlers look and
because it keeps a scan over a large static build to the first 64 KB per file.

**Deliberate exclusions stay deliberate.** `allowNoindex` moves a page from
finding to information — a login page, a thank-you page and an admin screen
*should* be hidden, and a tool that keeps shouting about them gets ignored.

**Zero dependencies, offline, deterministic.** No crawler, no API, no network.
Two runs over the same build produce identical output.

## Limitations

- **It reads static output.** A page rendered by a server at request time, with
  its robots tag decided by an environment variable, is not visible here. Point
  it at pre-rendered output.
- **It does not fetch the live site.** Whether your CDN adds a header of its own
  is a question only a request can answer.
- **Header patterns are matched loosely.** A rule scoped to `/blog/*` is
  reported as scoped, not resolved against every page — resolving hosting
  pattern dialects exactly is a larger problem than the one this solves.
- **JavaScript-injected robots tags are invisible.** Google executes JavaScript
  and this tool does not.
- **`X-Robots-Tag` from application middleware is not read** — only the deploy
  configuration files listed above.
- **It cannot tell a deliberate site-wide `noindex` from an accident.** A
  genuinely private site should pass `--fail-on critical` or simply not run it.

## FAQ

**We deliberately noindex our staging deploys.**
Then run it only on the production build, or leave it out of the staging
pipeline. The tool has no way to know which environment it is in, and guessing
would be worse than asking.

**Isn't this what Search Console is for?**
Search Console tells you after Google has already dropped the pages. The gap
between the two is the entire value here.

**Does it replace an SEO audit?**
No. It checks four things that can remove a site from the index, and nothing
else. Titles, structured data, performance and link health are somebody else's
tool.

**Does it modify anything?**
No. It only reads.

## Contributing

The most useful issue is a wrong verdict — a page reported as hidden that is
indexed fine, or a clean report on a build that vanished. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © hamodywe

## References

- [Robots meta tag, `data-nosnippet`, and X-Robots-Tag specifications](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) — Google Search Central
- [Accidentally noindexed a website](https://support.google.com/webmasters/thread/3136918?hl=en) — Google Search Central Community
- [Staging environment accidentally indexed and removed production site via Google-selected canonical](https://support.google.com/webmasters/thread/185486224) — the canonical case
- [`noindex`](https://en.wikipedia.org/wiki/Noindex) — Wikipedia
