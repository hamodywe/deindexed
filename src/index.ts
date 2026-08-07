/**
 * The library surface.
 *
 * Everything the CLI does is reachable from here, so a deploy pipeline can
 * compare `summary.indexable` between two builds and refuse the deploy when it
 * drops — which is the check this problem actually wants.
 */

export { analyze, coversEverything, VERSION, type AnalyzeOptions } from './analyze.ts';

export {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  loadConfig,
  parseConfig,
  type Config,
  type LoadedConfig,
} from './config.ts';

export {
  blocksIndexing,
  canonicalHost,
  headOf,
  looksNonProduction,
  readHead,
  routeFor,
  type HeadInfo,
} from './scan/html.ts';

export {
  parseJsonHeaders,
  parseNetlifyHeaders,
  parseTextConfig,
  parseToml,
  readHeaderRules,
  readRobots,
  type DeployConfig,
} from './scan/deploy.ts';

export { matchesGlob, globToRegExp } from './scan/glob.ts';
export { parseJsonc, isRecord } from './jsonc.ts';

export { renderJson, type JsonOptions } from './report/json.ts';
export { renderTerminal, type TerminalOptions } from './report/terminal.ts';

export type {
  BlockKind,
  Finding,
  HeaderRule,
  Page,
  Report,
  RobotsTxt,
  Severity,
  Summary,
} from './types.ts';

export { SEVERITIES, compareSeverity, isAtLeast } from './types.ts';
