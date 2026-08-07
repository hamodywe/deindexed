# Roadmap

A small tool with one question to answer before a deploy.

## Now — 0.1.x

- Header format coverage. An `X-Robots-Tag` this tool cannot read is a site-wide
  `noindex` it will miss, which is the only failure mode here that really
  matters.
- Windows path handling, exercised on CI.

## Next — 0.2

- **Compare two builds.** `deindexed dist --baseline previous.json`, failing
  when the indexable count drops. That is the check this problem actually wants:
  not "is anything hidden" but "did this deploy hide something the last one did
  not".
- **Header pattern resolution.** A rule scoped to `/blog/*` is currently
  reported as scoped rather than resolved against each page, so a rule that
  happens to cover every page is under-reported.
- **Framework metadata.** Next.js `metadata.robots`, and the Astro and SvelteKit
  equivalents, so an answer is possible without pre-rendering first.
- **Sitemaps.** A sitemap listing URLs on a staging host is the same family of
  mistake, and it is read from the same place.

## Considering

Say so in an issue if one of these matters to you.

- **A live check**, fetching a handful of deployed URLs to see what the CDN
  actually returns. It answers a question static analysis cannot, and it would
  be the first network access in the tool — so opt-in, and probably a separate
  command.
- **`hreflang` consistency**, which fails in the same silent way.
- **A GitHub Action** that comments the indexable count on a pull request, so a
  change that hides pages is visible in review rather than after deploy.

## Ruled out

- **Becoming an SEO audit tool.** Titles, structured data, performance, link
  health: all worth checking, none of them capable of removing a site from the
  index overnight. This tool checks the four things that are.
- **Crawling the live site.** Search Console and every SEO crawler already do
  that, and by the time they report it the pages are gone.
- **Rendering JavaScript.** It would mean shipping a browser, which is a very
  large dependency for a tool whose selling point is running in two seconds
  before a deploy. The limitation is documented instead.
- **Guessing the environment.** The tool cannot know whether it is looking at a
  staging build that *should* be hidden, and guessing would be worse than
  asking — so a genuinely private site raises the threshold or does not run it.

## When this tool is finished

When build-to-build comparison exists, the header formats cover what people
actually deploy with, and the false-verdict rate on real builds is near zero.

After that, releases only when a search engine changes what it honours.

## Versioning

The `--json` report carries a `schemaVersion`; breaking changes to it are listed
in the [CHANGELOG](CHANGELOG.md).
