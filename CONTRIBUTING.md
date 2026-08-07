# Contributing

Thank you for considering it. This tool answers one question: after this deploy,
can search engines still see the site? The most valuable contribution is telling
us when the answer is wrong.

## The most useful issue you can open

A **wrong verdict**:

- a page reported as hidden that is indexed perfectly well, or
- a clean report on a build that then disappeared from search results.

The second is the dangerous one. A tool that misses a site-wide `noindex` is
worse than no tool, because the whole point is to be the thing that catches it.

Include the page's `<head>`, and any deploy configuration file that sets
headers.

## Getting set up

```sh
git clone https://github.com/hamodywe/deindexed
cd deindexed
npm install
npm test
```

No build step for development:

```sh
node src/cli.ts examples/vanished --site example.com
node src/cli.ts examples/indexed
```

Node 22.18 or newer is needed to run the TypeScript sources directly. The
published package is compiled and supports Node 20.10.

## Before opening a pull request

```sh
npm run typecheck   # must be clean
npm test            # must be green
npm run build       # must succeed
```

## House rules

**Zero runtime dependencies.** Including the HTML reading, which is deliberately
not a parser: it looks for two tags and reads two attributes, because that is
the whole question.

**Severity follows coverage.** Three hidden pages and four hundred hidden pages
are different events, and collapsing them into one severity would make the
report useless in both directions.

**Work before configuration.** The canonical check must keep catching
`localhost` and preview hosts with no `--site` given. A tool that needs setting
up before it can catch the accident will not be installed before the accident.

**Deliberate exclusions stay deliberate.** Anything matched by `allowNoindex` is
information, never a finding.

**The indexed fixture must stay silent.** `examples/indexed` does everything
right and the suite asserts it produces nothing above `info`. A rule that fires
there fires everywhere.

**Deterministic and offline.** No crawler, no API, no network, nothing written.
Two runs over the same build produce identical output.

## Adding a header format

`src/scan/deploy.ts`. Each format is scanned for one header rather than parsed
completely — that is the point, and it keeps this file a hundred lines instead
of three dependencies.

1. Add the filename to `HEADER_FILES`.
2. Write a parser returning `HeaderRule[]`, with the path pattern as written.
3. If the pattern dialect has a new spelling for "everything", add it to
   `coversEverything` — getting that wrong turns a critical finding into an
   informational one.
4. Add a test using a real example of that format.

## Adding a rule

1. Emit it from `buildFindings` in `src/analyze.ts`.
2. Write `consequence` as what happens to the traffic, and to whom.
3. Add a test that it fires, and a test that it does **not** fire on
   `examples/indexed`.
4. Document it in `docs/rules.md` and the README table.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Types in use:
`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.

Breaking changes use `!` and a `BREAKING CHANGE:` footer.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
