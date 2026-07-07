const SECRET_PATTERNS = [
  /lin_api_[A-Za-z0-9_]+/gi,
  /ghp_[A-Za-z0-9]+/gi,
  /github_pat_[A-Za-z0-9_]+/gi,
  /cursor_[A-Za-z0-9_]+/gi,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
];

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, "[REDACTED]");
    }
    return redacted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/api[_-]?key|token|secret|authorization/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactValue(nested);
      }
    }
    return result;
  }

  return value;
}
