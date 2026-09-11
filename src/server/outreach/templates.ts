/** Placeholders: {{nome}} {{data}} {{hora}} {{profissional}} {{barbearia}} */
export function renderOutreachTemplate(
  template: string,
  vars: {
    nome?: string | null;
    data?: string | null;
    hora?: string | null;
    profissional?: string | null;
    barbearia?: string | null;
  }
): string {
  const first = (vars.nome ?? "").trim().split(/\s+/)[0] || "oi";
  return template
    .replaceAll("{{nome}}", first)
    .replaceAll("{{data}}", vars.data?.trim() || "")
    .replaceAll("{{hora}}", vars.hora?.trim() || "")
    .replaceAll("{{profissional}}", vars.profissional?.trim() || "a gente")
    .replaceAll("{{barbearia}}", vars.barbearia?.trim() || "a barbearia")
    .trim();
}
