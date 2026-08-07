/**
 * A glob matcher covering what test runners actually put in their configs.
 *
 * This exists because Jest's *default* `testMatch` is
 *
 *     **&#47;__tests__&#47;**&#47;*.[jt]s?(x)
 *     **&#47;?(*.)+(spec|test).[jt]s?(x)
 *
 * which uses three extglob forms in one line. A matcher that handles only `*`
 * and `**` cannot evaluate the default configuration of the most widely used
 * runner, so it would be wrong on the majority of projects before reading a
 * single line of anyone's config.
 *
 * Supported: `**`, `*`, `?`, character classes `[abc]` and `[!abc]`, brace
 * alternation `{a,b}`, and the extglobs `?(…)`, `*(…)`, `+(…)`, `@(…)`, `!(…)`.
 *
 * The approach is compilation to a regular expression, done once per pattern.
 * The one subtlety worth knowing about is that `*` must not cross a `/` while
 * `**` must, which is why the two are compiled separately rather than as a
 * repetition of the same piece.
 */

const SPECIAL = new Set(['.', '+', '^', '$', '|', '(', ')', '[', ']', '{', '}', '\\']);

/** Escape a literal character for use inside a regular expression. */
function escape(char: string): string {
  return SPECIAL.has(char) ? `\\${char}` : char;
}

interface CompileState {
  readonly pattern: string;
  index: number;
}

/**
 * Compile a glob to a regular expression source.
 *
 * Anchored by the caller, so this returns the body only.
 */
function compile(state: CompileState, stopAt?: ReadonlySet<string>): string {
  let out = '';

  while (state.index < state.pattern.length) {
    const char = state.pattern[state.index] as string;

    if (stopAt?.has(char)) return out;

    // Extglob: a quantifier character immediately followed by `(`.
    if ('?*+@!'.includes(char) && state.pattern[state.index + 1] === '(') {
      state.index += 2;
      const alternatives: string[] = [];
      for (;;) {
        alternatives.push(compile(state, new Set(['|', ')'])));
        const next = state.pattern[state.index];
        state.index += 1;
        if (next === ')' || next === undefined) break;
      }

      const body = alternatives.join('|');
      switch (char) {
        case '?':
          out += `(?:${body})?`;
          break;
        case '*':
          out += `(?:${body})*`;
          break;
        case '+':
          out += `(?:${body})+`;
          break;
        case '@':
          out += `(?:${body})`;
          break;
        case '!':
          // Negation is approximated: "anything that is not one of these,
          // within a path segment". Exact `!(…)` semantics need backtracking
          // this deliberately avoids.
          out += `(?!(?:${body})$)[^/]*`;
          break;
      }
      continue;
    }

    if (char === '{') {
      state.index += 1;
      const alternatives: string[] = [];
      for (;;) {
        alternatives.push(compile(state, new Set([',', '}'])));
        const next = state.pattern[state.index];
        state.index += 1;
        if (next === '}' || next === undefined) break;
      }
      out += `(?:${alternatives.join('|')})`;
      continue;
    }

    if (char === '[') {
      const close = state.pattern.indexOf(']', state.index + 1);
      if (close === -1) {
        out += '\\[';
        state.index += 1;
        continue;
      }
      let body = state.pattern.slice(state.index + 1, close);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      out += `[${body}]`;
      state.index = close + 1;
      continue;
    }

    if (char === '*') {
      const isGlobstar = state.pattern[state.index + 1] === '*';
      if (isGlobstar) {
        state.index += 2;
        // `**/` may match nothing at all, so `**/a` matches `a`. Consuming the
        // following slash here is what makes that work.
        if (state.pattern[state.index] === '/') {
          state.index += 1;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
        continue;
      }
      out += '[^/]*';
      state.index += 1;
      continue;
    }

    if (char === '?') {
      out += '[^/]';
      state.index += 1;
      continue;
    }

    out += escape(char);
    state.index += 1;
  }

  return out;
}

const cache = new Map<string, RegExp>();

/** Compile a glob into an anchored regular expression, memoised. */
export function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached !== undefined) return cached;

  const state: CompileState = { pattern: normalise(pattern), index: 0 };
  const compiled = new RegExp(`^${compile(state)}$`);
  cache.set(pattern, compiled);
  return compiled;
}

/**
 * Normalise a pattern to the form paths are compared in.
 *
 * Paths are always root-relative and POSIX-separated, so a leading `./` and a
 * leading `<rootDir>/` — which Jest configs use constantly — both mean "from
 * here" and are stripped.
 */
function normalise(pattern: string): string {
  return pattern
    .replace(/\\/g, '/')
    .replace(/^<rootDir>\/?/, '')
    .replace(/^\.\//, '');
}

/** True when a root-relative POSIX path matches the glob. */
export function matchesGlob(filePath: string, pattern: string): boolean {
  return globToRegExp(pattern).test(filePath.replace(/\\/g, '/'));
}

/** The first pattern that matches, or undefined. */
export function firstMatch(filePath: string, patterns: readonly string[]): string | undefined {
  return patterns.find((pattern) => matchesGlob(filePath, pattern));
}

/**
 * Match a path against a regular-expression string, as Jest's `testRegex` and
 * `testPathIgnorePatterns` use.
 *
 * These are unanchored by design, so `node_modules` as an ignore pattern
 * matches anywhere in the path. An invalid expression is treated as matching
 * nothing rather than throwing — a broken pattern in someone's config should
 * not stop the whole report.
 */
export function matchesRegex(filePath: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(filePath.replace(/\\/g, '/'));
  } catch {
    return false;
  }
}
