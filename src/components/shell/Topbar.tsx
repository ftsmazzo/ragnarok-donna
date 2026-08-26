"use client";

type TopbarProps = {
  onToggleSidebar?: () => void;
};

export function Topbar({ onToggleSidebar }: TopbarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-menu"
        onClick={onToggleSidebar}
        aria-label="Abrir menu"
      >
        ☰
      </button>
      <div className="topbar-search">
        <input
          type="search"
          placeholder="Buscar cliente, serviço…"
          aria-label="Busca rápida"
        />
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn btn-ghost">
          Caixa
        </button>
        <span className="topbar-user">Luciano</span>
      </div>
    </header>
  );
}
