type SkeletonProps = {
  className?: string;
  style?: React.CSSProperties;
};

/** Bloco cinza animado (opacity) — listas / drawers em carregamento. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <span className={`ui-skeleton ${className}`.trim()} style={style} aria-hidden />;
}

type LinesProps = {
  count?: number;
  className?: string;
};

export function SkeletonLines({ count = 3, className = "" }: LinesProps) {
  return (
    <div className={`ui-skeleton-stack ${className}`.trim()} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className="ui-skeleton-line"
          style={{ width: `${88 - (i % 3) * 12}%` }}
        />
      ))}
    </div>
  );
}

type TableSkeletonProps = {
  columns?: number;
  rows?: number;
  /** Rótulos opcionais do thead (só para layout; não são dados reais). */
  headers?: string[];
};

/** Tabela placeholder para loading.tsx / refresh de listas. */
export function TableSkeleton({ columns = 6, rows = 8, headers }: TableSkeletonProps) {
  const cols = headers?.length ?? columns;
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Carregando">
      <table className="data-table">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}>{headers?.[i] ?? <Skeleton className="ui-skeleton-th" />}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  <Skeleton
                    className="ui-skeleton-cell"
                    style={{ width: `${70 + ((r + c) % 4) * 8}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PanelListSkeletonProps = {
  title?: string;
  columns?: number;
  rows?: number;
  headers?: string[];
};

export function PanelListSkeleton({
  title = "Carregando…",
  columns,
  rows,
  headers,
}: PanelListSkeletonProps) {
  return (
    <div className="panel-list-skeleton" aria-busy="true">
      <div className="panel-list-skeleton-head">
        <Skeleton className="ui-skeleton-title" />
        <Skeleton className="ui-skeleton-btn" />
      </div>
      <p className="sr-only">{title}</p>
      <section className="panel">
        <div className="panel-toolbar">
          <Skeleton className="ui-skeleton-search" />
        </div>
        <TableSkeleton columns={columns} rows={rows} headers={headers} />
      </section>
    </div>
  );
}
