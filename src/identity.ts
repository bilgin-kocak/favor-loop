// Who is calling, without ever storing who they are: every member is keyed by a keyed SHA-256 (HMAC under
// HASH_SALT) of their Agent Village subject or Telegram id. The raw value is never written anywhere.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Identity = {
  forSubject(subject: string): string;
  forTelegram(userId: number | string): string;
  /** A short, unlinkable-to-anyone id for the anonymous board. */
  anon(value: string): string;
};

export function makeIdentity(salt: string): Identity {
  const hmac = (value: string) => createHmac("sha256", salt).update(value).digest("hex");
  return {
    // The prefixes keep the two spaces apart: no subject can collide with a Telegram id.
    forSubject: subject => hmac(`av:${subject}`),
    forTelegram: userId => hmac(`tg:${userId}`),
    anon: value => hmac(`anon:${value}`).slice(0, 12),
  };
}

/** Constant-time check of an `Authorization: Bearer <key>` header. An empty key never matches. */
export function bearerMatches(header: string | null, key: string): boolean {
  if (!key || !header) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return false;
  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(key).digest();
  return timingSafeEqual(given, expected);
}

export const MAX_SUBJECT_CHARS = 200;

/** The X-Village-Subject header if it is usable (non-empty, at most 200 characters), else null. */
export function usableSubject(header: string | null): string | null {
  if (header === null || header.trim() === "" || header.length > MAX_SUBJECT_CHARS) return null;
  return header;
}

/**
 * Seals the one value the Telegram bot cannot work without: the chat id it sends proposals to. AES-256-GCM
 * under a key derived from HASH_SALT, deleted on /leave.
 */
export function makeSealer(salt: string) {
  const key = createHash("sha256").update(`favorloop-chat-route:${salt}`).digest();
  return {
    seal(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
    },
    open(sealed: string): string | null {
      try {
        const raw = Buffer.from(sealed, "base64");
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
export type Sealer = ReturnType<typeof makeSealer>;
