import { canAccessRoute } from "@/server/permissions/routes";
import type { MemberRole } from "@/server/types";

export type NavItem = {
  label: string;
  href?: string;
  /** Ícone textual leve (sem lib externa). */
  icon?: string;
  children?: { label: string; href: string; icon?: string }[];
};

/** Path sem query — usado em permissões. */
export function navPathOnly(href: string): string {
  return href.split("?")[0] || href;
}

/**
 * Navegação Sarah: Hoje / Lembretes / Equipe / Operação / Inteligência
 * + blocos operacionais (Agenda, Cadastros, Comandas, Financeiro).
 */
export const NAV: NavItem[] = [
  { label: "Hoje", href: "/inicio", icon: "⌂" },
  { label: "Agenda", href: "/agenda", icon: "▤" },
  { label: "Lembretes", href: "/alertas", icon: "!" },
  { label: "CRM", href: "/crm", icon: "◎" },
  {
    label: "Cadastros",
    icon: "☰",
    children: [
      { label: "Clientes", href: "/clientes", icon: "☺" },
      { label: "Profissionais", href: "/profissionais", icon: "✂" },
      { label: "Serviços", href: "/servicos", icon: "★" },
      { label: "Produtos", href: "/produtos", icon: "▣" },
      { label: "Pacotes", href: "/pacotes" },
    ],
  },
  {
    label: "Comandas",
    icon: "☰",
    children: [
      { label: "Abertas", href: "/comandas" },
      { label: "Histórico", href: "/comandas/historico" },
      { label: "Venda (celular)", href: "/pwa/consumo" },
    ],
  },
  {
    label: "Equipe",
    icon: "✂",
    children: [
      { label: "Profissionais", href: "/profissionais", icon: "✂" },
      { label: "Comissões", href: "/comissoes", icon: "%" },
      { label: "Ranking equipe", href: "/relatorios/extras", icon: "★" },
      { label: "Aniversariantes", href: "/clientes/aniversariantes", icon: "★" },
    ],
  },
  {
    label: "Operação",
    icon: "▣",
    children: [
      { label: "Estoque", href: "/relatorios/estoque", icon: "▣" },
      { label: "Lista de compra", href: "/relatorios/estoque?low=1", icon: "!" },
      { label: "Entrada/saída estoque", href: "/produtos/movimentacao", icon: "⇅" },
    ],
  },
  {
    label: "Financeiro",
    icon: "$",
    children: [
      { label: "Caixa", href: "/caixa", icon: "$" },
      { label: "Hist. caixa", href: "/caixa/historico", icon: "▤" },
      { label: "Fluxo de caixa", href: "/relatorios/fluxo", icon: "↗" },
      { label: "Contas", href: "/contas", icon: "≡" },
      { label: "Comissões", href: "/comissoes", icon: "%" },
    ],
  },
  {
    label: "Relatórios",
    icon: "▦",
    children: [
      { label: "Visão geral", href: "/relatorios", icon: "▦" },
      { label: "Agendamentos", href: "/relatorios/agendamentos", icon: "▤" },
      { label: "Financeiro", href: "/relatorios/financeiro", icon: "$" },
      { label: "Comandas", href: "/relatorios/comandas", icon: "☰" },
      { label: "Perfil do cliente", href: "/relatorios/perfil", icon: "☺" },
      { label: "Fluxo de caixa", href: "/relatorios/fluxo", icon: "↗" },
    ],
  },
  {
    label: "Inteligência",
    icon: "✉",
    children: [
      { label: "Conversas IA", href: "/conversas", icon: "✉" },
      { label: "Disparos WhatsApp", href: "/configuracoes/disparos", icon: "✉" },
      { label: "Agente barbearia", href: "/configuracoes/agente", icon: "✉" },
      { label: "Perfil / retorno", href: "/relatorios/perfil", icon: "☺" },
    ],
  },
  {
    label: "Configurações",
    icon: "⚙",
    children: [
      { label: "Lista de espera", href: "/lista-espera" },
      { label: "Dados da empresa", href: "/configuracoes/empresa", icon: "⌂" },
      { label: "Equipe de acesso", href: "/configuracoes/equipe" },
      { label: "Minha conta", href: "/configuracoes/conta" },
      { label: "App celular (PWA)", href: "/pwa/conversas", icon: "▣" },
    ],
  },
];

/**
 * Menu enxuto da visão consolidada (gestão da rede).
 * Sem agenda/comanda/caixa — operação é por unidade.
 */
export const NAV_CONSOLIDATED: NavItem[] = [
  { label: "Hoje", href: "/inicio", icon: "⌂" },
  { label: "Lembretes", href: "/alertas", icon: "!" },
  { label: "CRM", href: "/crm", icon: "◎" },
  {
    label: "Equipe",
    icon: "✂",
    children: [
      { label: "Comissões", href: "/comissoes", icon: "%" },
      { label: "Ranking equipe", href: "/relatorios/extras", icon: "★" },
    ],
  },
  {
    label: "Relatórios",
    icon: "▦",
    children: [
      { label: "Visão geral", href: "/relatorios", icon: "▦" },
      { label: "Agendamentos", href: "/relatorios/agendamentos", icon: "▤" },
      { label: "Financeiro", href: "/relatorios/financeiro", icon: "$" },
      { label: "Comandas", href: "/relatorios/comandas", icon: "☰" },
      { label: "Estoque", href: "/relatorios/estoque", icon: "▣" },
      { label: "Perfil do cliente", href: "/relatorios/perfil", icon: "☺" },
      { label: "Fluxo de caixa", href: "/relatorios/fluxo", icon: "↗" },
    ],
  },
  {
    label: "Inteligência",
    icon: "✉",
    children: [
      { label: "Disparos WhatsApp", href: "/configuracoes/disparos", icon: "✉" },
    ],
  },
  {
    label: "Configurações",
    icon: "⚙",
    children: [
      { label: "Dados da empresa", href: "/configuracoes/empresa", icon: "⌂" },
      { label: "Equipe de acesso", href: "/configuracoes/equipe" },
      { label: "Minha conta", href: "/configuracoes/conta" },
    ],
  },
];

export function filterNavForRole(
  role: MemberRole,
  staffId?: string | null,
  opts?: { consolidated?: boolean }
): NavItem[] {
  const ctx = { staffId };
  const source = opts?.consolidated ? NAV_CONSOLIDATED : NAV;

  return source
    .map((item) => {
      if (item.href) {
        return canAccessRoute(navPathOnly(item.href), role, ctx) ? item : null;
      }

      const children = item.children?.filter((c) =>
        canAccessRoute(navPathOnly(c.href), role, ctx)
      );
      if (!children?.length) return null;

      return { ...item, children };
    })
    .filter((item): item is NavItem => item !== null);
}

export type NavLink = {
  href: string;
  label: string;
  /** Frases que o suporte escreve (caminho de menu, rótulo). */
  phrases: string[];
};

/** Lista plana de hrefs do menu (unidade + consolidado). */
export function listNavHrefs(): string[] {
  return [...new Set(listNavLinks().map((l) => navPathOnly(l.href)))].sort();
}

/** Rótulo + frases para deep-link no chat de suporte. */
export function listNavLinks(): NavLink[] {
  const byHref = new Map<string, NavLink>();

  function add(href: string, label: string, extra: string[] = []) {
    const path = navPathOnly(href);
    const cur = byHref.get(path);
    const phrases = extra.concat(label);
    if (!cur) {
      byHref.set(path, { href: path, label, phrases: [...new Set(phrases)] });
      return;
    }
    cur.phrases = [...new Set([...cur.phrases, ...phrases])];
  }

  for (const source of [NAV, NAV_CONSOLIDATED]) {
    for (const item of source) {
      if (item.href) add(item.href, item.label);
      for (const child of item.children ?? []) {
        add(child.href, child.label, [
          `${item.label} → ${child.label}`,
          `${item.label} -> ${child.label}`,
        ]);
        if (item.label === "Comandas" && navPathOnly(child.href) === "/comandas") {
          const cur = byHref.get("/comandas");
          if (cur) cur.label = "Comandas";
        }
      }
    }
  }

  return [...byHref.values()];
}

/** Profissionais: barbeiro vai direto para a própria ficha. */
export function profissionaisHref(role: MemberRole, staffId?: string | null): string {
  if (role === "staff" && staffId) {
    return `/profissionais?id=${staffId}`;
  }
  return "/profissionais";
}
