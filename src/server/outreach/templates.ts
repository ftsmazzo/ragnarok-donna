/** Placeholders: {{nome}} {{data}} {{hora}} {{profissional}} {{barbearia}} {{desconto}} */
export function renderOutreachTemplate(
  template: string,
  vars: {
    nome?: string | null;
    data?: string | null;
    hora?: string | null;
    profissional?: string | null;
    barbearia?: string | null;
    desconto?: string | number | null;
  }
): string {
  const first = (vars.nome ?? "").trim().split(/\s+/)[0] || "oi";
  const desconto =
    vars.desconto == null || vars.desconto === ""
      ? ""
      : String(vars.desconto);
  return template
    .replaceAll("{{nome}}", first)
    .replaceAll("{{data}}", vars.data?.trim() || "")
    .replaceAll("{{hora}}", vars.hora?.trim() || "")
    .replaceAll("{{profissional}}", vars.profissional?.trim() || "a gente")
    .replaceAll("{{barbearia}}", vars.barbearia?.trim() || "a barbearia")
    .replaceAll("{{desconto}}", desconto)
    .trim();
}
