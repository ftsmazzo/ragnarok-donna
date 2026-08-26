export type NavItem = {
  label: string;
  href?: string;
  children?: { label: string; href: string }[];
};

/** Navegação espelhada do AppBarber (AdminLTE), com Conversas IA nosso. */
export const NAV: NavItem[] = [
  { label: "Agenda", href: "/agenda" },
  {
    label: "Cadastros",
    children: [
      { label: "Clientes", href: "/clientes" },
      { label: "Profissionais", href: "/profissionais" },
      { label: "Serviços", href: "/servicos" },
      { label: "Produtos", href: "/produtos" },
      { label: "Pacotes", href: "/pacotes" },
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
    ],
  },
  {
    label: "Relatórios",
    children: [
      { label: "Agendamentos", href: "/relatorios/agendamentos" },
      { label: "Gerencial — Financeiro", href: "/relatorios/financeiro" },
      { label: "Gerencial — Comandas", href: "/relatorios/comandas" },
      { label: "Gerencial — Estoque", href: "/relatorios/estoque" },
      { label: "Gerencial — Perfil", href: "/relatorios/perfil" },
    ],
  },
  { label: "Conversas IA", href: "/conversas" },
  {
    label: "Configurações",
    children: [
      { label: "Lista de espera", href: "/lista-espera" },
      { label: "Parâmetros", href: "/configuracoes" },
    ],
  },
];

export const TENANT_LABEL = "RagnaroK's Barbearia";
