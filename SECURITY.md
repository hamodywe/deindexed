# Security Policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](https://github.com/hamodywe/deindexed/security/advisories/new)
rather than as a public issue.

Expect an acknowledgement within 72 hours and an assessment within seven days.

## Supported versions

The latest minor release receives security fixes. This project is pre-1.0.

## Scope

deindexed reads a build directory and prints text. The following are in scope:

- **Code execution while scanning.** Nothing in a scanned directory should ever
  be executed. HTML is read as text and never rendered; configuration files are
  parsed as data.
- **Denial of service.** A crafted page or directory tree that makes a scan hang
  or exhaust memory. Only the first 64 KB of each file is read and directory
  descent is capped.
- **Report injection.** Terminal escape sequences in a file path, a canonical
  URL or a robots directive that rewrite the screen. Evidence is excerpted and
  length-capped for that reason.
- **Path traversal.** A construction that gets the walker to read outside the
  scanned directory.
- **Silent under-reporting.** A construction that hides a site-wide `noindex`
  from the analysis. Because this tool is used as a gate before a deploy, a
  reliable way to produce a false clean report is worth more to an attacker than
  a crash.

## Out of scope

- **A wrong verdict.** A missed mechanism or a false alarm is a correctness bug
  and a genuinely useful report, but it is not a security issue.
- **The SEO configuration of sites deindexed scans.** That is the finding.

## This tool's posture

- **No network access.** It never fetches the site, never contacts a search
  engine, and never resolves a host.
- **Nothing is executed.** JavaScript in a scanned page is never run — which is
  also a documented limitation, since Google does run it.
- **Read-only.** deindexed never writes to the directory it scans.
- **Zero runtime dependencies.** Installing it does not widen your supply chain.
- **No install script.**
