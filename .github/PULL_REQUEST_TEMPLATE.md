## What and why

<!-- What changes, and what problem it solves. The diff says what; this is for why. -->

Closes #

## Checks

- [ ] `npm run typecheck` is clean
- [ ] `npm test` is green
- [ ] `npm run build` succeeds

## House rules

- [ ] No new runtime dependencies (`dependencies` is still empty)
- [ ] Nothing in a scanned directory is executed — HTML is still read as text
      and never rendered
- [ ] No network access, no writes — two runs still produce identical output

## If this changes what is reported

- [ ] `examples/indexed` still produces nothing above `info`. A rule that fires
      on the deploy doing everything right fires everywhere
- [ ] `examples/vanished` still reports all four mechanisms and 0 indexable
      pages
- [ ] The canonical check still catches a preview host **without** `--site` —
      a tool that needs configuring before it can catch the accident will not be
      installed before the accident
- [ ] Severity still follows coverage: every page hidden is critical, a handful
      is a warning
- [ ] `docs/rules.md` and the README table updated

## If this adds a header format

- [ ] Scanned for the one header rather than parsed completely
- [ ] Any new spelling of "everything" added to `coversEverything` — getting
      that wrong turns a critical finding into an informational one
- [ ] A test using a real example of the format

## If this changes the `--json` report

- [ ] Fields were added, not removed or retyped — or `schemaVersion` was
      incremented and the CHANGELOG says so
