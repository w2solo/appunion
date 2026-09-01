import { createHash, randomBytes } from "node:crypto";

export function generateApiKey() {
  const plaintext = `auk_live_${randomBytes(32).toString("base64url")}`;
  const prefix = plaintext.slice(0, 16);
  const hash = hashApiKey(plaintext);
  return { plaintext, prefix, hash };
}

export function hashApiKey(plaintext: string) {
  return createHash("sha256").update(plaintext).digest("hex");
}
