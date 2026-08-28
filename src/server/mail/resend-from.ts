const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripQuotes(value: string): string {
  return value.replace(/^["']+|["']+$/g, "").trim();
}

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(stripQuotes(value));
}

function parseFromAddress(raw: string, defaultName: string): string | null {
  const cleaned = stripQuotes(raw);

  const named = cleaned.match(/^(.+?)\s*<([^>]+)>$/);
  if (named) {
    const name = stripQuotes(named[1]);
    const email = stripQuotes(named[2]);
    if (isValidEmail(email)) return `${name} <${email}>`;
    return null;
  }

  if (isValidEmail(cleaned)) return `${defaultName} <${cleaned}>`;

  const embedded = cleaned.match(/[^\s<>,"']+@[^\s<>,"']+/);
  if (embedded && isValidEmail(embedded[0])) {
    return `${defaultName} <${stripQuotes(embedded[0])}>`;
  }

  return null;
}

/** Monta o campo `from` do Resend a partir das variáveis de ambiente. */
export function resolveResendFrom(): string {
  const displayName = process.env.RESEND_FROM_NAME?.trim() || "Painel";

  const candidates = [
    process.env.RESEND_FROM,
    process.env.RESEND_FROM_EMAIL,
    process.env.EMAIL_FROM,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  for (const raw of candidates) {
    const parsed = parseFromAddress(raw, displayName);
    if (parsed) return parsed;
  }

  return `${displayName} <onboarding@resend.dev>`;
}

export function formatResendError(body: string): string {
  try {
    const json = JSON.parse(body) as { message?: string };
    const msg = json.message ?? "";
    if (msg.includes("Invalid `from` field")) {
      return (
        "Remetente inválido no servidor — use RESEND_FROM_EMAIL=contato@seudominio.com " +
        "ou RESEND_FROM=Nome <contato@seudominio.com> no EasyPanel"
      );
    }
    if (msg) return msg.slice(0, 200);
  } catch {
    // corpo não é JSON
  }
  return body.slice(0, 200) || "Falha ao enviar e-mail";
}
