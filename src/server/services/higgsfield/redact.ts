const SECRET_ENV = ["HF_API_KEY_ID", "HF_API_KEY_SECRET", "HF_CREDENTIALS", "HF_KEY", "OPENAI_API_KEY"]

/**
 * Remove credential material from text that might be shown, stored, or logged.
 * The replacement is a fixed token. This function does not print the secret.
 */
export function redactSecrets(value: string, extra: Array<string | undefined> = []): string {
  const secrets = [
    ...SECRET_ENV.map((name) => process.env[name]),
    ...extra,
  ]
    .map((item) => item?.trim() ?? "")
    .filter((item) => item.length >= 4)

  let text = value
  for (const secret of secrets) {
    text = text.split(secret).join("[redacted]")
  }
  text = text.replace(/Authorization:\s*Key\s+\S+/gi, "Authorization: Key [redacted]")
  text = text.replace(/\bKey\s+[A-Za-z0-9._-]+:[A-Za-z0-9._-]+/g, "Key [redacted]")
  return text
}
