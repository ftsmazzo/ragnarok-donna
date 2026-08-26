type Props = {
  action: string;
  from: string;
  to: string;
  q?: string;
  qPlaceholder?: string;
  showSearch?: boolean;
  children?: React.ReactNode;
  hidden?: Record<string, string | undefined>;
};

export function RelatorioFilters({
  action,
  from,
  to,
  q,
  qPlaceholder = "Cliente ou profissional",
  showSearch = false,
  children,
  hidden,
}: Props) {
  return (
    <form action={action} method="get" className="relatorio-filters">
      <label className="filter-field">
        <span>De</span>
        <input type="date" name="from" defaultValue={from} className="search-input" />
      </label>
      <label className="filter-field">
        <span>Até</span>
        <input type="date" name="to" defaultValue={to} className="search-input" />
      </label>
      {children}
      {showSearch ? (
        <label className="filter-field filter-field-grow">
          <span>Busca</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={qPlaceholder}
            className="search-input"
          />
        </label>
      ) : null}
      {hidden
        ? Object.entries(hidden)
            .filter(([, v]) => v)
            .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      <button type="submit" className="btn btn-primary">
        Gerar
      </button>
    </form>
  );
}
