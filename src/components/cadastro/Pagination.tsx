import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  basePath: string;
  params?: Record<string, string | undefined>;
};

function buildHref(basePath: string, page: number, params?: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ page, totalPages, basePath, params }: Props) {
  if (totalPages <= 1) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;

  return (
    <nav className="pagination" aria-label="Paginação">
      {prev ? (
        <Link href={buildHref(basePath, prev, params)} className="btn btn-outline">
          ← Anterior
        </Link>
      ) : (
        <span className="btn btn-outline is-disabled">← Anterior</span>
      )}
      <span className="pagination-info">
        Página {page} de {totalPages}
      </span>
      {next ? (
        <Link href={buildHref(basePath, next, params)} className="btn btn-outline">
          Próxima →
        </Link>
      ) : (
        <span className="btn btn-outline is-disabled">Próxima →</span>
      )}
    </nav>
  );
}
