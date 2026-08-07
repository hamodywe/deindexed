/**
 * The machine-readable report.
 *
 * `schemaVersion` is the contract. Anything that would break a consumer reading
 * this — removing a field, changing a type, changing what a value means —
 * increments it and is listed in the CHANGELOG. Adding a field does not, so
 * consumers should ignore keys they do not recognise.
 *
 * `summary.indexable` against `summary.pages` is the pair worth recording per
 * deploy. A drop between two builds is the incident, and it is visible here
 * before it is visible anywhere else.
 */

import type { Report } from '../types.ts';

export interface JsonOptions {
  readonly pretty?: boolean;
}

export function renderJson(report: Report, options: JsonOptions = {}): string {
  const payload = {
    schemaVersion: report.schemaVersion,
    tool: report.tool,
    site: report.site,
    summary: report.summary,
    warnings: report.warnings,
    robots: report.robots,
    headerRules: report.headerRules,
    pages: report.pages.map((page) => ({
      path: page.path,
      route: page.route,
      noindex: page.noindex,
      allowed: page.allowed,
      directives: page.directives,
      ...(page.canonical !== undefined ? { canonical: page.canonical } : {}),
      ...(page.canonicalHost !== undefined ? { canonicalHost: page.canonicalHost } : {}),
    })),
    findings: report.findings,
  };

  return options.pretty === false ? JSON.stringify(payload) : `${JSON.stringify(payload, null, 2)}\n`;
}
