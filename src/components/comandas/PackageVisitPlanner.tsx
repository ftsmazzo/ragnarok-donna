"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { schedulePackageVisitsAction } from "@/app/(painel)/comandas/actions";
import { shiftDateSp, todaySp } from "@/lib/datetime";
import {
  primaryServiceId,
  suggestVisitServiceGroups,
  sumDurationMin,
  visitLabel,
  type PackageVisitDraft,
  type VisitServiceUnit,
} from "@/lib/package-visits";
import type { CatalogStaff } from "@/server/orders/types";

type Props = {
  open: boolean;
  orderId: string;
  clientId: string;
  packageName: string;
  /** Unidades restantes (1 entrada = 1 crédito). */
  units: VisitServiceUnit[];
  staff: CatalogStaff[];
  onClose: () => void;
  onSaved: (count: number) => void;
};

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function newKey() {
  return `v-${Math.random().toString(36).slice(2, 9)}`;
}

function buildSuggested(
  units: VisitServiceUnit[],
  staffId: string
): PackageVisitDraft[] {
  const groups = suggestVisitServiceGroups(units);
  const start = todaySp();
  return groups.map((g, i) => ({
    key: newKey(),
    date: shiftDateSp(start, i * 7),
    hour: 10,
    minute: 0,
    staffId,
    serviceIds: g.map((u) => u.serviceId),
  }));
}

export function PackageVisitPlanner({
  open,
  orderId,
  clientId,
  packageName,
  units,
  staff,
  onClose,
  onSaved,
}: Props) {
  const defaultStaffId = staff[0]?.id ?? "";
  const [rows, setRows] = useState<PackageVisitDraft[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const catalogById = useMemo(() => {
    const m = new Map<string, VisitServiceUnit>();
    for (const u of units) {
      if (!m.has(u.serviceId)) m.set(u.serviceId, u);
    }
    return m;
  }, [units]);

  const availableServiceIds = useMemo(
    () => [...catalogById.keys()],
    [catalogById]
  );

  const suggestedCount = useMemo(
    () => suggestVisitServiceGroups(units).length,
    [units]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setRows(buildSuggested(units, defaultStaffId));
  }, [open, units, defaultStaffId]);

  function unitsForRow(row: PackageVisitDraft): VisitServiceUnit[] {
    return row.serviceIds
      .map((id) => catalogById.get(id))
      .filter((u): u is VisitServiceUnit => Boolean(u));
  }

  function patchRow(key: string, patch: Partial<PackageVisitDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toggleService(key: string, serviceId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const has = r.serviceIds.includes(serviceId);
        return {
          ...r,
          serviceIds: has
            ? r.serviceIds.filter((id) => id !== serviceId)
            : [...r.serviceIds, serviceId],
        };
      })
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        date: shiftDateSp(todaySp(), prev.length * 7),
        hour: 10,
        minute: 0,
        staffId: defaultStaffId,
        serviceIds: availableServiceIds.slice(0, 1),
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function resetSuggest() {
    setRows(buildSuggested(units, defaultStaffId));
    setError("");
  }

  function submit() {
    setError("");
    if (rows.length === 0) {
      setError("Inclua ao menos uma visita");
      return;
    }
    for (const r of rows) {
      if (!r.staffId) {
        setError("Cada visita precisa de profissional");
        return;
      }
      if (!r.date) {
        setError("Cada visita precisa de data");
        return;
      }
      if (r.serviceIds.length === 0) {
        setError("Cada visita precisa de ao menos um serviço");
        return;
      }
    }

    const visits = rows.map((r) => {
      const us = unitsForRow(r);
      return {
        staffId: r.staffId,
        date: r.date,
        hour: r.hour,
        minute: r.minute,
        serviceIds: r.serviceIds,
        primaryServiceId: primaryServiceId(us),
        durationMin: sumDurationMin(us),
        visitLabel: visitLabel(us),
      };
    });

    startTransition(async () => {
      const result = await schedulePackageVisitsAction({
        orderId,
        clientId,
        visits,
      });
      if (!result.ok) {
        setError(
          result.created
            ? `${result.error} (${result.created} já criados)`
            : (result.error ?? "Não foi possível agendar")
        );
        if (result.created) onSaved(result.created);
        return;
      }
      onSaved(result.created ?? visits.length);
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Planejar visitas do pacote"
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Agendando…" : `Agendar ${rows.length} visita${rows.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <p className="client-profile-hint">
        <strong>{packageName}</strong> — cada linha é uma <em>visita</em> (pode juntar serviços).
        Créditos só baixam no atendimento / ao usar na comanda.
      </p>
      <div className="pkg-visit-toolbar">
        <button type="button" className="btn btn-outline btn-sm" onClick={resetSuggest} disabled={pending}>
          Sugerir visitas
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={addRow} disabled={pending}>
          + Visita
        </button>
        <span className="muted">
          {units.length} crédito{units.length === 1 ? "" : "s"} → tipicamente {suggestedCount}{" "}
          ida{suggestedCount === 1 ? "" : "s"}
        </span>
      </div>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="pkg-visit-table-wrap">
        <table className="pkg-visit-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Data</th>
              <th>Hora</th>
              <th>Profissional</th>
              <th>Serviços</th>
              <th>Duração</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const us = unitsForRow(r);
              return (
                <tr key={r.key}>
                  <td>{idx + 1}</td>
                  <td>
                    <input
                      type="date"
                      value={r.date}
                      onChange={(e) => patchRow(r.key, { date: e.target.value })}
                      disabled={pending}
                    />
                  </td>
                  <td className="pkg-visit-time">
                    <select
                      value={r.hour}
                      onChange={(e) => patchRow(r.key, { hour: Number(e.target.value) })}
                      disabled={pending}
                      aria-label="Hora"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.minute}
                      onChange={(e) => patchRow(r.key, { minute: Number(e.target.value) })}
                      disabled={pending}
                      aria-label="Minuto"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={r.staffId}
                      onChange={(e) => patchRow(r.key, { staffId: e.target.value })}
                      disabled={pending}
                    >
                      <option value="" disabled>
                        Selecione…
                      </option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="pkg-visit-services">
                      {availableServiceIds.map((id) => {
                        const u = catalogById.get(id)!;
                        return (
                          <label key={id} className="pkg-visit-svc">
                            <input
                              type="checkbox"
                              checked={r.serviceIds.includes(id)}
                              onChange={() => toggleService(r.key, id)}
                              disabled={pending}
                            />
                            {u.serviceName}
                          </label>
                        );
                      })}
                    </div>
                    <span className="muted pkg-visit-label">{visitLabel(us)}</span>
                  </td>
                  <td>{sumDurationMin(us)} min</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => removeRow(r.key)}
                      disabled={pending || rows.length <= 1}
                      aria-label="Remover visita"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
