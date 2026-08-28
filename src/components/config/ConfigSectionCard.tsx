import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  accent?: "orange" | "blue" | "green" | "slate";
  children: ReactNode;
};

const accentClass = {
  orange: "is-accent-orange",
  blue: "is-accent-blue",
  green: "is-accent-green",
  slate: "is-accent-slate",
} as const;

export function ConfigSectionCard({
  title,
  description,
  icon,
  accent = "slate",
  children,
}: Props) {
  return (
    <section className={`config-card ${accentClass[accent]}`}>
      <header className="config-card-header">
        {icon ? <span className="config-card-icon">{icon}</span> : null}
        <div>
          <h3 className="config-card-title">{title}</h3>
          {description ? <p className="config-card-desc">{description}</p> : null}
        </div>
      </header>
      <div className="config-card-body">{children}</div>
    </section>
  );
}
