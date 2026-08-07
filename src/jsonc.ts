/**
 * Reading `tsconfig.json`, which is not JSON.
 *
 * TypeScript accepts comments and trailing commas in its config files, and
 * essentially every real tsconfig uses at least one of them — the file that
 * ships with `tsc --init` is more comment than configuration. `JSON.parse`
 * refuses all of it, so a tool that reads tsconfig with `JSON.parse` fails on
 * the majority of projects it is pointed at.
 *
 * The stripper below removes comments and trailing commas without disturbing
 * anything inside a string literal, which is the only part that is genuinely
 * fiddly: a `//` inside `"https://example.com"` is not a comment, and an escaped
 * quote inside a string must not end it.
 */

/** Remove comments and trailing commas, preserving offsets is not attempted. */
export function stripJsonComments(source: string): string {
  let out = '';
  let index = 0;

  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 2;
        continue;
      }
      // Newlines are kept so that a later line count still lines up.
      if (char === '\n') out += char;
      index += 1;
      continue;
    }

    if (inString) {
      out += char;
      if (char === '\\') {
        // Copy the escaped character verbatim so `\"` cannot end the string.
        const escaped = source[index + 1];
        if (escaped !== undefined) out += escaped;
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 2;
      continue;
    }

    out += char;
    index += 1;
  }

  return removeTrailingCommas(out);
}

/**
 * Drop commas that sit before a closing brace or bracket.
 *
 * Runs after comment stripping and skips string contents for the same reason:
 * `{"a": "x,"}` must survive untouched.
 */
function removeTrailingCommas(source: string): string {
  let out = '';
  let inString = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] as string;

    if (inString) {
      out += char;
      if (char === '\\') {
        const escaped = source[index + 1];
        if (escaped !== undefined) out += escaped;
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === ',') {
      // Look ahead past whitespace for a closer.
      let ahead = index + 1;
      while (ahead < source.length && /\s/.test(source[ahead] as string)) ahead += 1;
      const following = source[ahead];
      if (following === '}' || following === ']') continue;
    }

    out += char;
  }

  return out;
}

/** Parse a tsconfig-flavoured JSON document. Returns `undefined` rather than throwing. */
export function parseJsonc(source: string): unknown {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  try {
    return JSON.parse(stripJsonComments(text));
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
