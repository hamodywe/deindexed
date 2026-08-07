# indexed

The same site, deployable.

- No `noindex` anywhere except `/thank-you`, which is declared in
  `deindexed.config.json` under `allowNoindex` — so it is reported as
  deliberate rather than as a finding.
- Canonicals are either absolute to the production host or relative.
- `robots.txt` disallows `/admin/` and nothing else.
- No `X-Robots-Tag` anywhere.

deindexed reports nothing here, and the suite asserts it. A rule that fired on
the deploy doing everything right would fire everywhere.
