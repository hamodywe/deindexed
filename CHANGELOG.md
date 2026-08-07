# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `--json` report carries a `schemaVersion`. Anything that would break a
consumer reading it — removing a field, changing a type, changing what a value
means — increments that number and is listed here as a breaking change. Adding a
field does not, so consumers should ignore keys they do not recognise.

## [Unreleased]

## [0.1.0] — 2026-08-07

First release.

### Added

- Detection of the four mechanisms that remove a site from search results,
  checked against the directory about to be deployed rather than after the
  fact: robots meta tags, `X-Robots-Tag` response headers set in deploy
  configuration, `robots.txt`, and canonical URLs pointing at another host.
- Severity by **coverage** — every page hidden is critical, a handful is a
  warning — which is what separates a deliberate exclusion from an incident.
- Header rules read from `_headers`, `netlify.toml`, `vercel.json`,
  `firebase.json`, `staticwebapp.config.json`, `.htaccess` and `nginx.conf`,
  because an `X-Robots-Tag` set there appears nowhere in the markup and is the
  hardest instance to trace.
- Canonical checking that works before any configuration: without `--site`,
  hosts that are obviously not production — `localhost`, preview domains,
  `staging.` prefixes — are still caught.
- `allowNoindex`, so pages that should be hidden are reported as deliberate
  rather than as findings.
- A headline count of indexable pages, which is the number worth recording per
  deploy: a drop between two builds is visible here days before it reaches
  analytics.
- Terminal and `--json` reporters, `--verbose`, `--site`, `--allow`,
  `--fail-on`.

[Unreleased]: https://github.com/hamodywe/deindexed/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hamodywe/deindexed/releases/tag/v0.1.0
