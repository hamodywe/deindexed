# The rules

Seven rules over four mechanisms. The mechanisms are the ways a page disappears;
the rules split them by **coverage**, because that is what separates a
deliberate choice from an incident.

---

## `robots-txt-blocks-everything` — critical

```
User-agent: *
Disallow: /
```

**What it costs:** no search engine crawls anything on this deploy. Pages
already indexed drop out over the following days.

It also disables the recovery instruction: because crawling stops, the meta tags
on those pages are never read either. A `noindex` you remove later cannot be
seen until the `Disallow` goes.

Only a bare `Disallow: /` under `User-agent: *` fires this. `Disallow: /admin`
is somebody doing their job.

---

## `header-hides-everything` — critical

`X-Robots-Tag: noindex` applied to `/*`, from a deploy configuration file.

**What it costs:** every page is served with a noindex header, which outranks
anything in the HTML.

**Why it is the hardest to trace:** it is not in the markup. A team can search
the entire codebase for "noindex", find nothing, and still be invisible. Read
from `_headers`, `netlify.toml`, `vercel.json`, `firebase.json`,
`staticwebapp.config.json`, `.htaccess` and `nginx.conf`.

---

## `every-page-is-noindex` — critical

Every page in the build carries a blocking robots meta tag.

**What it costs:** the deploy removes the whole site from search results. It
will not fail, no test will catch it, and the first symptom is the traffic graph
several days later.

**Fix:** this is almost never a markup problem. Something built with the staging
configuration — check the environment the build ran in before changing any HTML.

---

## `canonical-points-elsewhere` — critical / error

```html
<link rel="canonical" href="https://acme-git-main.vercel.app/contact">
```

**What it costs:** a canonical tells search engines the real version of this
page is somewhere else. The page is indexable, crawlable, and voluntarily giving
its ranking to another host.

This is the mechanism that has taken production sites out of the results
**without production changing at all** — a staging deploy gets indexed, Google
picks it as the canonical, and the real site loses.

**critical** when the host is obviously not production (`localhost`, a
`vercel.app` preview, a `staging.` prefix), **error** when it is some other real
host, which is more often a deliberate cross-domain choice.

**Fix:** make the canonical relative, or absolute to your production host. Pass
`--site` so the check is exact rather than heuristic.

---

## `pages-are-noindex` — error / warning

Some but not all pages carry a robots noindex.

- **error** when more than half of the build is hidden.
- **warning** otherwise.

**What it costs:** those pages drop out of search results. Correct for a
thank-you page, expensive for anything else — so the list is worth reading
rather than dismissing.

**Fix:** confirm each one, then declare the deliberate ones so they stop
appearing.

---

## `header-hides-some-paths` — info

`X-Robots-Tag: noindex` scoped to specific paths.

Nothing here is wrong. It is listed because a noindex set in deploy
configuration does not appear in the HTML, so the next person wondering why a
page is missing will not find it by searching the source.

---

## `noindex-allowed` — info

Pages matched by `allowNoindex`, hidden on purpose.

Reported so the allowlist stays honest and visible, and never as a problem.

---

## What a clean report means

```
4 pages · 3 indexable · 1 hidden
  ██████████████████████▌         75%
  1 hidden on purpose
```

Every page that should be indexable is, and the one that is not was declared.

The number to record per deploy is `summary.indexable` against `summary.pages`.
A drop between two builds is the incident, and it is visible here days before it
is visible in analytics.

## Severity and exit codes

| Code | Meaning |
| ---: | --- |
| 0 | clean, or nothing at or above the threshold |
| 1 | findings at or above the threshold |
| 2 | bad usage, or a path that could not be read |

The default threshold is `error`, so a handful of deliberately hidden pages
never breaks a build.

## Declaring deliberate exclusions

```json
{
  "site": "example.com",
  "allowNoindex": ["thank-you", "admin/**", "checkout/*"]
}
```

in `deindexed.config.json`, or `--allow` on the command line, repeatable.

The file is looked for both inside the scanned directory and beside it, because
the directory is usually `dist` and the configuration belongs in the repository.

## Why `--site` matters

Without it, canonical URLs are only checked against hosts that are *obviously*
not production:

`localhost` · `127.0.0.1` · `*.local` · `*.test` · `staging.*` · `preview.*` ·
`dev.*` · `*.vercel.app` · `*.netlify.app` · `*.pages.dev` · `*.fly.dev` ·
`*.ngrok.app`

That catches the common accidents with no configuration at all. With `--site`,
any canonical pointing anywhere other than your production host is reported —
including at a real domain that happens to be the wrong one.
