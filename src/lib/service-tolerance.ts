/**
 * Tolerância de atraso (Fase 4):
 * só corte OU só barba → 15 min
 * cabelo + barba / combo → 20 min
 */
export function delayToleranceMinutes(input: {
  serviceName?: string | null;
  durationMin?: number | null;
}): 15 | 20 {
  const name = (input.serviceName ?? "").toLowerCase();
  const combo =
    /cabelo\s*\+?\s*barba|barba\s*\+?\s*cabelo|corte\s*\+?\s*barba|combo|completo|cabelo e barba|barba e cabelo/.test(
      name
    );
  if (combo) return 20;
  if ((input.durationMin ?? 0) >= 50) return 20;
  return 15;
}
