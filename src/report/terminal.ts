/**
 * The report.
 *
 * One number leads, and it is the one somebody would want shouted at them:
 * how many pages in this build a search engine is allowed to index. When that
 * number is zero and the previous deploy's was not, this is the most expensive
 * output in the whole portfolio.
 */

import { bar, createStyler, padEnd, padStart, truncate, type StyleName, type Styler } from './style.ts';
import type { Finding, Report, Severity } from '../types.ts';

export interface TerminalOptions {
  /** List every page with its directives. */
  readonly verbose?: boolean;
}

const SEVERITY_COLOUR: Readonly<Record<Severity, StyleName>> = {
  critical: 'red',
  error: 'red',
  warning: 'yellow',
  info: 'grey',
};

export function renderTerminal(
  report: Report,
  stream: NodeJS.WriteStream,
  options: TerminalOptions = {},
): string {
  const style = createStyler(stream);
  const lines: string[] = [];

  lines.push(
    `${style('bold', report.tool.name)} ${style('dim', report.tool.version)} ${style('dim', '·')} ${report.root}`,
  );
  lines.push('');

  for (const warning of report.warnings) lines.push(`${style('yellow', 'note')} ${warning}`);
  if (report.warnings.length > 0) lines.push('');

  const { summary } = report;

  if (summary.pages === 0 && report.headerRules.length === 0 && report.robots === null) {
    lines.push(style('grey', 'Nothing to check here. Point this at the directory you are about to deploy.'));
    lines.push('');
    return lines.join('\n');
  }

  lines.push(...renderHeadline(report, style));
  lines.push('');

  for (const finding of report.findings) lines.push(...renderFinding(finding, style));

  if (report.findings.length === 0) {
    lines.push(style('green', 'Every page in this build can be indexed.'));
    lines.push('');
  }

  if (options.verbose) lines.push(...renderPages(report, style));

  return lines.join('\n');
}

function renderHeadline(report: Report, style: Styler): string[] {
  const { summary } = report;
  const lines: string[] = [];

  if (summary.pages === 0) {
    lines.push(style('dim', 'No HTML pages found — only deploy configuration was checked.'));
  } else {
    const fraction = summary.indexable / summary.pages;
    const allGood = summary.indexable === summary.pages;
    const none = summary.indexable === 0;

    lines.push(
      `${style('bold', String(summary.pages))} page${summary.pages === 1 ? '' : 's'} ` +
        `${style('dim', '·')} ${style(allGood ? 'green' : none ? 'red' : 'yellow', String(summary.indexable))} indexable` +
        (summary.indexable < summary.pages
          ? ` ${style('dim', '·')} ${style('red', `${summary.pages - summary.indexable} hidden`)}`
          : ''),
    );
    lines.push(
      `  ${style(allGood ? 'green' : 'red', bar(fraction, 30))} ${padStart(`${Math.round(fraction * 100)}%`, 4)}`,
    );
  }

  lines.push('');

  const detail: string[] = [];
  if (summary.allowed > 0) detail.push(`${summary.allowed} hidden on purpose`);
  if (summary.foreignCanonicals > 0) {
    detail.push(`${summary.foreignCanonicals} canonical(s) point elsewhere`);
  }
  if (summary.headerRules > 0) detail.push(`${summary.headerRules} X-Robots-Tag rule(s)`);
  if (report.robots !== null) detail.push(`robots.txt read`);
  if (detail.length > 0) lines.push(`  ${style('dim', detail.join(' · '))}`);

  lines.push(
    `  ${style('dim', report.site === null ? 'no production host given — pass --site for exact canonical checks' : `production host: ${report.site}`)}`,
  );

  return lines;
}

function renderFinding(finding: Finding, style: Styler): string[] {
  const lines: string[] = [];

  lines.push(
    `${style(SEVERITY_COLOUR[finding.severity], padEnd(finding.severity, 8))} ` +
      `${style('cyan', finding.ruleId)} ${style('grey', finding.location)}`,
  );
  lines.push(`  ${finding.message}`);
  lines.push(`  ${style('dim', 'so:')} ${finding.consequence}`);
  lines.push(`  ${style('dim', 'fix:')} ${finding.remediation}`);

  for (const evidence of finding.evidence.slice(0, 8)) {
    lines.push(`    ${style('grey', truncate(evidence, 104))}`);
  }

  lines.push('');
  return lines;
}

function renderPages(report: Report, style: Styler): string[] {
  const lines = [style('bold', 'Pages'), ''];
  const width = Math.min(48, Math.max(8, ...report.pages.map((page) => page.route.length)));

  for (const page of report.pages) {
    const mark = page.noindex
      ? page.allowed
        ? style('grey', '·')
        : style('red', '✗')
      : style('green', '✓');

    const notes: string[] = [];
    if (page.directives.length > 0) notes.push(style('dim', page.directives.join(', ')));
    if (page.canonicalHost !== undefined) notes.push(style('yellow', `canonical → ${page.canonicalHost}`));

    lines.push(`  ${mark} ${padEnd(truncate(page.route, width), width)} ${notes.join('  ')}`);
  }

  lines.push('');
  return lines;
}
