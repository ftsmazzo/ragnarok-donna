import { canAccessRoute } from "@/server/permissions/routes";
import type { MemberRole } from "@/server/types";

export type NavItem = {
  label: string;
  href?: string;
  children?: { label: string; href: string }[];
};

/** Navegação espelhada do AppBarber (AdminLTE), com Conversas IA nosso. */
export const NAV: NavItem[] = [
  { label: "Início", href: "/inicio" },
  { label: "Agenda", href: "/agenda" },
  {
    label: "Cadastros",
    children: [
      { label: "Clientes", href: "/clientes" },
      { label: "Profissionais", href: "/profissionais" },
      { label: "Serviços", href: "/servicos" },
      { label: "Produtos", href: "/produtos" },
      { label: "Pacotes", href: "/pacotes" },
      { label: "Clube", href: "/modulo/clube" },
      { label: "Mensagens", href: "/modulo/mensagens" },
      { label: "Pesquisa", href: "/modulo/pesquisa" },
    ],
  },
  {
    label: "Comandas",
    children: [
      { label: "Abertas", href: "/comandas" },
      { label: "Histórico", href: "/comandas/historico" },
    ],
  },
  {
    label: "Financeiro",
    children: [
      { label: "Caixa", href: "/caixa" },
      { label: "Comissões", href: "/comissoes" },
      { label: "Fluxo de caixa", href: "/modulo/fluxo-caixa" },
      { label: "Contas", href: "/modulo/contas" },
    ],
  },
  {
    label: "Relatórios",
    children: [
      { label: "Visão geral", href: "/relatorios" },
      { label: "Agendamentos", href: "/relatorios/agendamentos" },
      { label: "Gerencial — Financeiro", href: "/relatorios/financeiro" },
      { label: "Gerencial — Comandas", href: "/relatorios/comandas" },
      { label: "Gerencial — Estoque", href: "/relatorios/estoque" },
      { label: "Gerencial — Perfil", href: "/relatorios/perfil" },
      { label: "Comissões", href: "/comissoes" },
    ],
  },
  { label: "Conversas IA", href: "/conversas" },
  {
    label: "Configurações",
    children: [
      { label: "Lista de espera", href: "/lista-espera" },
      { label: "Equipe de acesso", href: "/configuracoes/equipe" },
      { label: "Parâmetros", href: "/configuracoes" },
      { label: "Rodízio", href: "/modulo/rodizio" },
      { label: "Funcionamento", href: "/modulo/funcionamento" },
      { label: "Alertas", href: "/modulo/alertas" },
      { label: "Anamnese", href: "/modulo/anamnese" },
    ],
  },
];

export function filterNavForRole(role: MemberRole, staffId?: string | null): NavItem[] {
  const ctx = { staffId };

  return NAV.map((item) => {
    if (item.href) {
      return canAccessRoute(item.href, role, ctx) ? item : null;
    }

    const children = item.children?.filter((c) => canAccessRoute(c.href, role, ctx));
    if (!children?.length) return null;

    return { ...item, children };
  }).filter((item): item is NavItem => item !== null);
}

/** Profissionais: barbeiro vai direto para a própria ficha. */
export function profissionaisHref(role: MemberRole, staffId?: string | null): string {
  if (role === "staff" && staffId) {
    return `/profissionais?id=${staffId}`;
  }
  return "/profissionais";
}
