type Props = {
  action: string;
  q?: string;
  placeholder?: string;
  hidden?: Record<string, string | undefined>;
};

export function CadastroSearch({
  action,
  q = "",
  placeholder = "Filtrar…",
  hidden,
}: Props) {
  return (
    <form action={action} method="get" className="cadastro-search">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="search-input"
      />
      {hidden
        ? Object.entries(hidden)
            .filter(([, v]) => v)
            .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      <button type="submit" className="btn btn-outline">
        Buscar
      </button>
      {q ? (
        <a href={action} className="btn btn-ghost">
          Limpar
        </a>
      ) : null}
    </form>
  );
}
