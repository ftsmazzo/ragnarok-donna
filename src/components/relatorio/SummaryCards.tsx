type Card = {
  label: string;
  value: string | number;
  hint?: string;
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
          <span className="overview-label">{c.label}</span>
          {c.hint ? <small>{c.hint}</small> : null}
        </div>
      ))}
    </section>
  );
}
