#!/usr/bin/env node
/**
 * The command line.
 *
 * Exit codes:
 *   0  clean, or nothing at or above the threshold
 *   1  findings at or above the threshold
 *   2  bad usage, or a path that could not be read
 */

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { analyze, VERSION } from './analyze.ts';
import { loadConfig } from './config.ts';
import { renderJson } from './report/json.ts';
import { createStyler } from './report/style.ts';
import { renderTerminal } from './report/terminal.ts';
import { isAtLeast, SEVERITIES, type Severity } from './types.ts';

const EXIT_OK = 0;
const EXIT_FOUND = 1;
const EXIT_USAGE = 2;

const HELP = `deindexed — will this deploy be invisible to Google?

A noindex added for staging survives into production. The deploy succeeds.
Every test passes. Over the next few days the site disappears from search
results, and the first anyone knows is the traffic graph.

Every prevention normally offered — Search Console, the robots.txt tester, a
crawler — runs after the deploy. This runs before it, against the directory
about to ship.

Four ways a page vanishes, and they live in four different files:

  <meta name="robots" content="noindex">    in the HTML
  X-Robots-Tag: noindex                     in deploy config, invisible in HTML
  Disallow: /                               in robots.txt
  <link rel="canonical" href="staging...">  indexable, and handing away its rank

USAGE
  deindexed <directory> [options]

OPTIONS
  --site <host>        your production host, for exact canonical checks
  --allow <glob>       route allowed to be noindex; repeatable
  --json               machine-readable report
  --verbose            list every page and its directives
  --fail-on <level>    critical | error | warning | info    (default: error)
  -h, --help
  -v, --version

EXIT CODES
  0  clean, or nothing at or above the threshold
  1  findings at or above the threshold
  2  bad usage, or a path that could not be read

Run it on the directory you actually deploy, after the build:

  npm run build && npx deindexed dist --site example.com

https://github.com/hamodywe/deindexed`;

interface Options {
  root: string;
  site?: string;
  allow: string[];
  json: boolean;
  verbose: boolean;
  failOn: Severity;
}

class UsageError extends Error {}

export function parseArgs(argv: readonly string[]): Options | 'help' | 'version' {
  const options: Options = { root: '.', allow: [], json: false, verbose: false, failOn: 'error' };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;

    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }

    const equals = token.indexOf('=');
    const name = equals > 0 ? token.slice(0, equals) : token;
    const inline = equals > 0 ? token.slice(equals + 1) : undefined;
    const takeValue = (): string => {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`${name} needs a value`);
      return value;
    };

    switch (name) {
      case '-h':
      case '--help':
        return 'help';
      case '-v':
      case '--version':
        return 'version';
      case '--json':
        options.json = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--site':
        options.site = takeValue();
        break;
      case '--allow':
        options.allow.push(takeValue());
        break;
      case '--fail-on': {
        const value = takeValue();
        if (!(SEVERITIES as readonly string[]).includes(value)) {
          throw new UsageError(`--fail-on expects one of ${SEVERITIES.join(', ')}, got "${value}"`);
        }
        options.failOn = value as Severity;
        break;
      }
      default:
        throw new UsageError(`unknown option: ${token}`);
    }
  }

  if (positionals.length > 1) throw new UsageError(`unexpected argument: ${positionals[1]}`);
  options.root = positionals[0] ?? '.';
  return options;
}

export async function main(argv: readonly string[]): Promise<number> {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`deindexed: ${error.message}\n\nTry \`deindexed --help\`.\n`);
      return EXIT_USAGE;
    }
    throw error;
  }

  if (options === 'help') {
    process.stdout.write(`${HELP}\n`);
    return EXIT_OK;
  }
  if (options === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return EXIT_OK;
  }

  const config = await loadConfig(options.root);

  let report;
  try {
    report = await analyze({
      root: options.root,
      ...((options.site ?? config.config.site) !== undefined
        ? { site: (options.site ?? config.config.site) as string }
        : {}),
      allowNoindex: [...config.config.allowNoindex, ...options.allow],
    });
  } catch (error) {
    process.stderr.write(`deindexed: could not read ${options.root}: ${(error as Error).message}\n`);
    return EXIT_USAGE;
  }

  if (options.json) {
    process.stdout.write(renderJson(report));
  } else {
    process.stdout.write(renderTerminal(report, process.stdout, { verbose: options.verbose }));
  }

  const gating = report.findings.filter((finding) => isAtLeast(finding.severity, options.failOn));
  if (gating.length === 0) return EXIT_OK;

  // The verdict goes to stderr so `deindexed --json > report.json` stays clean.
  const style = createStyler(process.stderr);
  const hidden = report.summary.pages - report.summary.indexable;
  process.stderr.write(
    `${style('red', 'deindexed: fail')} — ${hidden} of ${report.summary.pages} page${report.summary.pages === 1 ? '' : 's'} would not be indexed\n`,
  );
  return EXIT_FOUND;
}

// Run only when invoked as a program, so the fixture suite can import `main`.
// `pathToFileURL` is what makes this correct on Windows.
const entryPoint = process.argv[1];
// npm installs bins as symlinks and Node resolves the main module to its real
// path, so comparing against the raw argv[1] would never match on Linux or
// macOS — the CLI would print nothing and exit 0.
const entryUrl = (): string => {
  try {
    return pathToFileURL(realpathSync(entryPoint as string)).href;
  } catch {
    return pathToFileURL(entryPoint as string).href;
  }
};

if (entryPoint !== undefined && import.meta.url === entryUrl()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`deindexed: ${(error as Error).stack ?? String(error)}\n`);
      process.exitCode = EXIT_USAGE;
    },
  );
}
