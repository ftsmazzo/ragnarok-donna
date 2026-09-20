/** Planejamento de visitas de pacote (créditos → idas, não 1 linha por crédito). */

export type VisitServiceUnit = {
  serviceId: string;
  serviceName: string;
  durationMin: number;
};

export type PackageVisitDraft = {
  key: string;
  date: string;
  hour: number;
  minute: number;
  staffId: string;
  serviceIds: string[];
};

/** Uma visita = 1 crédito de cada tipo ainda restante (ex.: 4 barba + 2 corte → 4 visitas). */
export function suggestVisitServiceGroups(
  units: VisitServiceUnit[]
): VisitServiceUnit[][] {
  const byId = new Map<string, VisitServiceUnit[]>();
  for (const u of units) {
    const list = byId.get(u.serviceId) ?? [];
    list.push(u);
    byId.set(u.serviceId, list);
  }

  const groups: VisitServiceUnit[][] = [];
  while ([...byId.values()].some((list) => list.length > 0)) {
    const visit: VisitServiceUnit[] = [];
    for (const [id, list] of byId) {
      if (list.length === 0) continue;
      visit.push(list.shift()!);
      if (list.length === 0) byId.delete(id);
    }
    if (visit.length === 0) break;
    groups.push(visit);
  }
  return groups;
}

export function primaryServiceId(units: VisitServiceUnit[]): string {
  if (units.length === 0) return "";
  return [...units].sort((a, b) => b.durationMin - a.durationMin)[0]!.serviceId;
}

export function sumDurationMin(units: VisitServiceUnit[]): number {
  return units.reduce((s, u) => s + Math.max(5, u.durationMin || 30), 0);
}

export function visitLabel(units: VisitServiceUnit[]): string {
  const names = units.map((u) => u.serviceName.trim()).filter(Boolean);
  if (names.length === 0) return "Visita";
  return names.join(" + ");
}
