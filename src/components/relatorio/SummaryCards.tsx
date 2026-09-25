type Card = {
  label: string;
  value: string | number;
  /** Linha sob o valor (ex.: "Líquido: R$ …"). */
  subline?: string;
  hint?: string;
  /** Delta vs período anterior, ex. "+12,5%" */
  delta?: string | null;
};

type Props = {
  cards: Card[];
};

export function SummaryCards({ cards }: Props) {
  return (
    <section className="overview-grid overview-grid-summary">
      {cards.map((c) => (
        <div key={c.label} className="overview-card is-static">
          <span className="overview-value">{c.value}</span>
          {c.subline ? <span className="overview-subline">{c.subline}</span> : null}
          <span className="overview-label">{c.label}</span>
          {c.delta ? <small className="overview-delta">{c.delta}</small> : null}
          {c.hint ? <small>{c.hint}</small> : null}
        </div>
      ))}
    </section>
  );
}
