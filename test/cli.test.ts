import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { analyze } from '../src/analyze.ts';
import { parseArgs } from '../src/cli.ts';
import { renderJson } from '../src/report/json.ts';
import { renderTerminal } from '../src/report/terminal.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VANISHED = path.join(REPO_ROOT, 'examples', 'vanished');
const INDEXED = path.join(REPO_ROOT, 'examples', 'indexed');

/**
 * Run the CLI as a real process.
 *
 * Capturing output by replacing `process.stdout.write` corrupts the test
 * runner's own output, which writes to the same stream. Spawning tests what
 * users actually run, exit code included.
 */
function run(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(REPO_ROOT, 'src', 'cli.ts'), ...argv],
      { cwd: REPO_ROOT, env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({ code: typeof error?.code === 'number' ? error.code : 0, stdout, stderr });
      },
    );
  });
}

function captureStream(): NodeJS.WriteStream {
  return { isTTY: false, write: () => true } as unknown as NodeJS.WriteStream;
}

describe('argument parsing', () => {
  it('takes a directory and a site', () => {
    const options = parseArgs(['dist', '--site', 'example.com']) as { root: string; site?: string };
    assert.equal(options.root, 'dist');
    assert.equal(options.site, 'example.com');
  });

  it('collects repeated --allow values', () => {
    assert.deepEqual((parseArgs(['--allow', 'a', '--allow', 'b']) as { allow: string[] }).allow, [
      'a',
      'b',
    ]);
  });

  it('accepts a threshold with a space or an equals sign', () => {
    assert.equal((parseArgs(['--fail-on', 'warning']) as { failOn: string }).failOn, 'warning');
    assert.equal((parseArgs(['--fail-on=critical']) as { failOn: string }).failOn, 'critical');
  });

  it('returns help and version first', () => {
    assert.equal(parseArgs(['--help']), 'help');
    assert.equal(parseArgs(['-v']), 'version');
  });

  it('rejects unknown options and bad values', () => {
    assert.throws(() => parseArgs(['--nope']));
    assert.throws(() => parseArgs(['--fail-on', 'fatal']));
    assert.throws(() => parseArgs(['--site']));
    assert.throws(() => parseArgs(['a', 'b']));
  });
});

describe('reporters', () => {
  it('emits JSON that declares its schema and carries the count', async () => {
    const payload = JSON.parse(renderJson(await analyze({ root: VANISHED, site: 'example.com' })));
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.tool.name, 'deindexed');
    assert.equal(payload.summary.pages, 5);
    assert.equal(payload.summary.indexable, 0);
  });

  it('keeps every path relative to the scanned directory', async () => {
    const payload = JSON.parse(renderJson(await analyze({ root: VANISHED })));
    for (const page of payload.pages) assert.ok(!path.isAbsolute(page.path));
  });

  it('writes plain text when the stream is not a terminal', async () => {
    const text = renderTerminal(await analyze({ root: VANISHED, site: 'example.com' }), captureStream());
    assert.ok(!text.includes('['), 'expected no ANSI escapes');
    assert.match(text, /robots-txt-blocks-everything/);
  });

  it('leads with how many pages can be indexed', async () => {
    const text = renderTerminal(await analyze({ root: VANISHED, site: 'example.com' }), captureStream());
    assert.match(text, /5 pages/);
    assert.match(text, /0 indexable/);
  });

  it('states plainly when a build is fine', async () => {
    const text = renderTerminal(await analyze({ root: INDEXED, site: 'example.com' }), captureStream());
    assert.match(text, /Every page in this build can be indexed|indexable/);
  });

  it('says when no production host was given', async () => {
    const text = renderTerminal(await analyze({ root: INDEXED }), captureStream());
    assert.match(text, /no production host given/);
  });
});

describe('the command line, end to end', () => {
  it('prints the version and the help', async () => {
    const version = await run(['--version']);
    assert.equal(version.code, 0);
    assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);

    const help = await run(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /deindexed/);
    assert.match(help.stdout, /X-Robots-Tag/);
  });

  it('exits 2 on bad usage', async () => {
    const { code, stderr } = await run(['--nope']);
    assert.equal(code, 2);
    assert.match(stderr, /unknown option/);
  });

  it('exits 1 on the vanished fixture and states the damage', async () => {
    const { code, stdout, stderr } = await run([VANISHED, '--site', 'example.com']);
    assert.equal(code, 1);
    assert.match(stdout, /critical/);
    assert.match(stderr, /5 of 5 pages would not be indexed/);
  });

  it('exits 0 on the indexed fixture, reading its config file', async () => {
    // The fixture carries deindexed.config.json, so no flags are needed.
    const { code } = await run([INDEXED]);
    assert.equal(code, 0);
  });

  it('keeps JSON on stdout clean while the verdict goes to stderr', async () => {
    const { code, stdout, stderr } = await run([VANISHED, '--site', 'example.com', '--json']);
    assert.equal(code, 1);
    assert.doesNotThrow(() => JSON.parse(stdout));
    assert.match(stderr, /would not be indexed/);
  });

  it('honours --allow from the command line', async () => {
    const loud = await run([INDEXED, '--site', 'example.com', '--fail-on', 'warning']);
    const quiet = await run([
      INDEXED,
      '--site',
      'example.com',
      '--allow',
      'thank-you',
      '--fail-on',
      'warning',
    ]);
    assert.equal(quiet.code, 0);
    assert.ok(quiet.code <= loud.code);
  });

  it('lists pages under --verbose', async () => {
    const { stdout } = await run([VANISHED, '--site', 'example.com', '--verbose']);
    assert.match(stdout, /Pages/);
    assert.match(stdout, /\/blog\/launch/);
  });
});
