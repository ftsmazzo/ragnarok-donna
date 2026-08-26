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
      { label: "Rodízio", href: "/modulo/rodizio" },
      { label: "Funcionamento", href: "/modulo/funcionamento" },
      { label: "Alertas", href: "/modulo/alertas" },
      { label: "Anamnese", href: "/modulo/anamnese" },
    ],
  },
];

export const TENANT_LABEL = "RagnaroK's Barbearia";
