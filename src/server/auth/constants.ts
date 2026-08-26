export const SESSION_COOKIE = "ragnarok_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 dias

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET ausente ou curto demais (mín. 32 caracteres)");
  }
  return new TextEncoder().encode(secret);
}
