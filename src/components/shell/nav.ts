import { canAccessRoute } from "@/server/permissions/routes";
import type { MemberRole } from "@/server/types";

export type NavItem = {
  label: string;
  href?: string;
  /** Ícone textual leve (sem lib externa). */
  icon?: string;
  children?: { label: string; href: string; icon?: string }[];
};

/** Navegação espelhada do AppBarber, com Conversas IA e Alertas. */
export const NAV: NavItem[] = [
  { label: "Início", href: "/inicio", icon: "⌂" },
  { label: "Agenda", href: "/agenda", icon: "▤" },
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
    ],
  },
  {
    label: "Financeiro",
    icon: "$",
    children: [
      { label: "Caixa", href: "/caixa", icon: "$" },
      { label: "Comissões", href: "/comissoes", icon: "%" },
      { label: "Fluxo de caixa", href: "/relatorios/fluxo", icon: "↗" },
      { label: "Contas", href: "/contas", icon: "≡" },
    ],
  },
  {
    label: "Relatórios",
    icon: "▦",
    children: [
      { label: "Visão geral", href: "/relatorios", icon: "▦" },
      { label: "Alertas", href: "/alertas", icon: "!" },
      { label: "Agendamentos", href: "/relatorios/agendamentos", icon: "▤" },
      { label: "Financeiro", href: "/relatorios/financeiro", icon: "$" },
      { label: "Comandas", href: "/relatorios/comandas", icon: "☰" },
      { label: "Estoque", href: "/relatorios/estoque", icon: "▣" },
      { label: "Perfil do cliente", href: "/relatorios/perfil", icon: "☺" },
      { label: "Fluxo de caixa", href: "/relatorios/fluxo", icon: "↗" },
      { label: "Comissões", href: "/comissoes", icon: "%" },
    ],
  },
  { label: "Conversas IA", href: "/conversas", icon: "✉" },
  {
    label: "Configurações",
    icon: "⚙",
    children: [
      { label: "Lista de espera", href: "/lista-espera" },
      { label: "Dados da empresa", href: "/configuracoes/empresa", icon: "⌂" },
      { label: "Equipe de acesso", href: "/configuracoes/equipe" },
      { label: "Minha conta", href: "/configuracoes/conta" },
      { label: "Agente (Donna)", href: "/configuracoes/agente", icon: "✉" },
      { label: "App celular (PWA)", href: "/pwa/conversas", icon: "▣" },
    ],
  },
];

/**
 * Menu enxuto da visão consolidada (gestão da rede).
 * Sem agenda/comanda/caixa — operação é por unidade.
 */
export const NAV_CONSOLIDATED: NavItem[] = [
  { label: "Gestão da rede", href: "/inicio", icon: "⌂" },
  {
    label: "Relatórios",
    icon: "▦",
    children: [
      { label: "Visão geral", href: "/relatorios", icon: "▦" },
      { label: "Alertas", href: "/alertas", icon: "!" },
      { label: "Agendamentos", href: "/relatorios/agendamentos", icon: "▤" },
      { label: "Financeiro", href: "/relatorios/financeiro", icon: "$" },
      { label: "Comandas", href: "/relatorios/comandas", icon: "☰" },
      { label: "Estoque", href: "/relatorios/estoque", icon: "▣" },
      { label: "Perfil do cliente", href: "/relatorios/perfil", icon: "☺" },
      { label: "Fluxo de caixa", href: "/relatorios/fluxo", icon: "↗" },
    ],
  },
  { label: "Comissões", href: "/comissoes", icon: "%" },
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
        return canAccessRoute(item.href, role, ctx) ? item : null;
      }

      const children = item.children?.filter((c) => canAccessRoute(c.href, role, ctx));
      if (!children?.length) return null;

      return { ...item, children };
    })
    .filter((item): item is NavItem => item !== null);
}

/** Profissionais: barbeiro vai direto para a própria ficha. */
export function profissionaisHref(role: MemberRole, staffId?: string | null): string {
  if (role === "staff" && staffId) {
    return `/profissionais?id=${staffId}`;
  }
  return "/profissionais";
}
