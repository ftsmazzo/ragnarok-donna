/**
 * Esquema do Guia de Suporte — base que o agente consome.
 * Sprint a sprint: status skeleton → draft → ready.
 */

export type SupportRole = "owner" | "admin" | "reception" | "staff" | "readonly";

export type SupportIntent =
  | "onde_fica"
  | "como_fazer"
  | "como_gerar"
  | "objecao"
  | "permissao";

export type GuideStatus = "skeleton" | "draft" | "ready";

export type GuideStep = {
  /** Título curto da etapa */
  title: string;
  /** Texto operacional (preencher no enriquecimento) */
  detail: string;
};

export type GuideObjection = {
  /** Frase típica do usuário */
  concern: string;
  /** Resposta/orientação (preencher no enriquecimento) */
  reply: string;
};

export type SupportGuide = {
  id: string;
  title: string;
  status: GuideStatus;
  /** Rota canônica no painel */
  href: string;
  menuPath: string;
  aliases: string[];
  roles: SupportRole[];
  intents: SupportIntent[];
  /** Uma frase: o que esta tela/fluxo resolve */
  summary: string;
  steps: GuideStep[];
  objections: GuideObjection[];
  relatedGuideIds: string[];
  /** ISO date quando o conteúdo foi validado no produto */
  lastVerified: string | null;
  /** Notas internas pra quem for enriquecer (não expor ao usuário final) */
  enrichNotes?: string[];
};
