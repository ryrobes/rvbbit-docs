export type SqlTokenType =
  | "comment"
  | "function"
  | "keyword"
  | "number"
  | "operator"
  | "string"
  | "type"
  | "variable";

export type SqlToken = {
  value: string;
  type?: SqlTokenType;
};

const keywords = new Set([
  "all",
  "alter",
  "and",
  "array",
  "as",
  "asc",
  "begin",
  "between",
  "by",
  "case",
  "cast",
  "commit",
  "create",
  "cross",
  "delete",
  "desc",
  "distinct",
  "do",
  "drop",
  "else",
  "end",
  "except",
  "exists",
  "extension",
  "false",
  "filter",
  "from",
  "full",
  "function",
  "group",
  "having",
  "if",
  "in",
  "inner",
  "insert",
  "intersect",
  "interval",
  "into",
  "is",
  "join",
  "lateral",
  "left",
  "like",
  "limit",
  "materialized",
  "not",
  "null",
  "offset",
  "on",
  "or",
  "order",
  "outer",
  "over",
  "partition",
  "recursive",
  "replace",
  "returning",
  "right",
  "rollback",
  "schema",
  "select",
  "set",
  "table",
  "then",
  "true",
  "union",
  "update",
  "values",
  "when",
  "where",
  "with"
]);

const types = new Set([
  "bigint",
  "boolean",
  "date",
  "double",
  "float",
  "int",
  "integer",
  "json",
  "jsonb",
  "numeric",
  "real",
  "regclass",
  "serial",
  "smallint",
  "text",
  "time",
  "timestamp",
  "timestamptz",
  "uuid",
  "varchar"
]);

function isWordStart(char: string) {
  return /[A-Za-z_]/.test(char);
}

function isWordPart(char: string) {
  return /[A-Za-z0-9_$]/.test(char);
}

function readWhile(input: string, start: number, predicate: (char: string) => boolean) {
  let index = start;
  while (index < input.length && predicate(input[index])) index += 1;
  return index;
}

function nextMeaningfulChar(input: string, start: number) {
  let index = start;
  while (index < input.length && /\s/.test(input[index])) index += 1;
  return input[index];
}

function readQuoted(input: string, start: number, quote: "'" | "\"") {
  let index = start + 1;
  while (index < input.length) {
    if (input[index] === quote) {
      if (input[index + 1] === quote) {
        index += 2;
        continue;
      }
      index += 1;
      break;
    }
    if (input[index] === "\\" && quote === "'") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
}

function readDollarQuoted(input: string, start: number) {
  const match = input.slice(start).match(/^\$[A-Za-z_]*\$/);
  if (!match) return start;
  const marker = match[0];
  const end = input.indexOf(marker, start + marker.length);
  return end === -1 ? input.length : end + marker.length;
}

export function tokenizeSql(input: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    const next = input[index + 1];

    if (/\s/.test(char)) {
      const end = readWhile(input, index, (value) => /\s/.test(value));
      tokens.push({ value: input.slice(index, end) });
      index = end;
      continue;
    }

    if (char === "-" && next === "-") {
      const end = input.indexOf("\n", index + 2);
      const commentEnd = end === -1 ? input.length : end;
      tokens.push({ value: input.slice(index, commentEnd), type: "comment" });
      index = commentEnd;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = input.indexOf("*/", index + 2);
      const commentEnd = end === -1 ? input.length : end + 2;
      tokens.push({ value: input.slice(index, commentEnd), type: "comment" });
      index = commentEnd;
      continue;
    }

    if (char === "$") {
      const dollarEnd = readDollarQuoted(input, index);
      if (dollarEnd > index) {
        tokens.push({ value: input.slice(index, dollarEnd), type: "string" });
        index = dollarEnd;
        continue;
      }

      const end = readWhile(input, index + 1, (value) => /[A-Za-z0-9_]/.test(value));
      if (end > index + 1) {
        tokens.push({ value: input.slice(index, end), type: "variable" });
        index = end;
        continue;
      }
    }

    if (
      (char === "E" ||
        char === "e" ||
        char === "B" ||
        char === "b" ||
        char === "X" ||
        char === "x") &&
      next === "'"
    ) {
      const end = readQuoted(input, index + 1, "'");
      tokens.push({ value: input.slice(index, end), type: "string" });
      index = end;
      continue;
    }

    if (char === "'") {
      const end = readQuoted(input, index, "'");
      tokens.push({ value: input.slice(index, end), type: "string" });
      index = end;
      continue;
    }

    if (char === "\"") {
      const end = readQuoted(input, index, "\"");
      tokens.push({ value: input.slice(index, end), type: "string" });
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const end = readWhile(input, index, (value) => /[0-9._]/.test(value));
      tokens.push({ value: input.slice(index, end), type: "number" });
      index = end;
      continue;
    }

    if (isWordStart(char)) {
      const end = readWhile(input, index, isWordPart);
      const value = input.slice(index, end);
      const normalized = value.toLowerCase();
      const type = keywords.has(normalized)
        ? "keyword"
        : types.has(normalized)
          ? "type"
          : nextMeaningfulChar(input, end) === "("
            ? "function"
            : undefined;
      tokens.push({ value, type });
      index = end;
      continue;
    }

    if ("=<>!~+-*/%^|&:".includes(char)) {
      const end = readWhile(input, index, (value) => "=<>!~+-*/%^|&:".includes(value));
      tokens.push({ value: input.slice(index, end), type: "operator" });
      index = end;
      continue;
    }

    tokens.push({ value: char });
    index += 1;
  }

  return tokens;
}
