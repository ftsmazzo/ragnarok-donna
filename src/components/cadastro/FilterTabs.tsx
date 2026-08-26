import Link from "next/link";

type Tab = { label: string; href: string; active?: boolean };

type Props = {
  tabs: Tab[];
};

export function FilterTabs({ tabs }: Props) {
  return (
    <div className="filter-tabs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`filter-tab${t.active ? " is-active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
