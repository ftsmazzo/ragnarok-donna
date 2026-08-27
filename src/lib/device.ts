/** Heurística de dispositivo (UA). Não cobre 100% — o login também usa viewport. */

export function isPhoneUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (/iPad|Tablet/i.test(ua)) return false;
  // Android tablet costuma não ter "Mobile"
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false;
  return /Mobi|iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function isTabletUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (/iPad|Tablet/i.test(ua)) return true;
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
  return false;
}

/**
 * Destino pós-login / home por dispositivo.
 * Celular (recepção/gestão) → PWA Conversas; tablet → Agenda mesa; PC → Início.
 * Staff sem acesso a conversas → Agenda.
 */
export function homePathForUserAgent(
  ua: string | null | undefined,
  role?: string
): string {
  if (isPhoneUserAgent(ua)) {
    if (role === "staff" || role === "readonly") return "/agenda?modo=tablet";
    return "/pwa/conversas";
  }
  if (isTabletUserAgent(ua)) {
    return "/agenda?modo=tablet";
  }
  return "/inicio";
}

/** No browser: UA + tela estreita com toque (fallback se UA falhar). */
export function resolveClientHomePath(role?: string): string {
  if (typeof navigator === "undefined") return "/inicio";
  const ua = navigator.userAgent;
  const fromUa = homePathForUserAgent(ua, role);
  if (fromUa !== "/inicio") return fromUa;

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 900px)").matches;
  if (coarse) {
    if (role === "staff" || role === "readonly") return "/agenda?modo=tablet";
    return "/pwa/conversas";
  }
  return "/inicio";
}
