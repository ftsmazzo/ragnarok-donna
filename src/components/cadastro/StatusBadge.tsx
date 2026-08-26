type Props = {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
};

export function StatusBadge({
  active,
  activeLabel = "Ativo",
  inactiveLabel = "Inativo",
}: Props) {
  return (
    <span className={`badge${active ? " is-success" : " is-muted"}`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
