type Props = {
  branchSlug: string | null | undefined;
  tenantSlug: string;
};

/** Unidade 02 Donna — cadastrada, sem operação até inauguração. */
export function BranchInaugurationBanner({ branchSlug, tenantSlug }: Props) {
  if (tenantSlug !== "donna-elegant" || branchSlug !== "unidade-02") return null;

  return (
    <div className="banner-info banner-inline branch-inauguration-banner">
      <strong>Unidade 02 — em inauguração.</strong> Esta unidade já está cadastrada, mas ainda
      não tem equipe, agenda, comandas nem clientes vinculados. O painel aparece vazio até a
      abertura. Para operação atual, use a <strong>Unidade 01</strong>.
    </div>
  );
}
