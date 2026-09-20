"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type DragEvent } from "react";
import { setClientCrmStageAction } from "@/app/(painel)/crm/actions";
import { useToast } from "@/components/ui/Toast";
import { CRM_STAGES, labelHowHeard, labelCrmStatus } from "@/lib/crm";
import type { CrmPipelineRow } from "@/server/crm/queries";

type Props = {
  rows: CrmPipelineRow[];
  counts: Record<string, number>;
};

type ColumnId = (typeof CRM_STAGES)[number]["value"] | "unstaged";

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "unstaged", label: "Sem etapa" },
  ...CRM_STAGES.map((s) => ({ id: s.value as ColumnId, label: s.label })),
];

export function CrmKanban({ rows, counts }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ColumnId | null>(null);
  const [localRows, setLocalRows] = useState(rows);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  function cardsFor(col: ColumnId) {
    return localRows.filter((r) => {
      if (r.crmExit) return false;
      if (col === "unstaged") return !r.crmStage;
      return r.crmStage === col;
    });
  }

  function onDragStart(e: DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function onDragEnd() {
    setDraggingId(null);
    setOverCol(null);
  }

  function onDrop(col: ColumnId) {
    const id = draggingId;
    setOverCol(null);
    setDraggingId(null);
    if (!id) return;

    const targetStage = col === "unstaged" ? "" : col;
    const prev = localRows.find((r) => r.id === id);
    if (!prev) return;
    if ((prev.crmStage || "") === targetStage) return;

    setLocalRows((list) =>
      list.map((r) =>
        r.id === id ? { ...r, crmStage: targetStage, crmExit: null } : r
      )
    );

    startTransition(async () => {
      const result = await setClientCrmStageAction(id, targetStage);
      if (!result.ok) {
        showToast(result.error, "error");
        setLocalRows(rows);
        return;
      }
      showToast("Etapa atualizada", "success");
      router.refresh();
    });
  }

  return (
    <div className={`crm-kanban${pending ? " is-pending" : ""}`}>
      <p className="crm-kanban-hint">
        Arraste o card para mudar a etapa. Só entram lead, origem cadastrada ou quem já está no
        funil.
      </p>
      <div className="crm-kanban-board" role="list">
        {COLUMNS.map((col) => {
          const cards = cardsFor(col.id);
          const count =
            col.id === "unstaged"
              ? (counts.unstaged ?? cards.length)
              : (counts[col.id] ?? cards.length);
          return (
            <section
              key={col.id}
              className={`crm-kanban-col${overCol === col.id ? " is-over" : ""}`}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.id);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(col.id);
              }}
            >
              <header className="crm-kanban-col-head">
                <strong>{col.label}</strong>
                <span className="crm-kanban-count">{count}</span>
              </header>
              <div className="crm-kanban-col-body">
                {cards.length === 0 ? (
                  <p className="crm-kanban-empty">Solte aqui</p>
                ) : (
                  cards.slice(0, 35).map((card) => (
                    <article
                      key={card.id}
                      className={`crm-kanban-card${draggingId === card.id ? " is-dragging" : ""}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, card.id)}
                      onDragEnd={onDragEnd}
                    >
                      <Link href={`/clientes?id=${card.id}`} className="crm-kanban-card-name">
                        {card.name}
                      </Link>
                      <div className="crm-kanban-card-meta">
                        <span>{card.phone ?? "sem tel."}</span>
                        <span>{labelCrmStatus(card.crmStatus)}</span>
                      </div>
                      {card.howHeard ? (
                        <div className="crm-kanban-card-origin">{labelHowHeard(card.howHeard)}</div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
