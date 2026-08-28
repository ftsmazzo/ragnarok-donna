import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { count, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";

const DONNA_SLUG = "donna-elegant";

function appRoot() {
  return process.cwd();
}

function exportDir() {
  const dir = path.join(appRoot(), "data/donna-elegant-export");
  return fs.existsSync(path.join(dir, "clientes.json")) ? dir : null;
}

export type DonnaImportStatus = {
  clients: number;
  services: number;
  appointments: number;
  importRunning: boolean;
  lastImport: {
    status: string;
    label: string | null;
    finishedAt: Date | null;
    error: string | null;
  } | null;
  exportAvailable: boolean;
};

export async function getDonnaImportStatus(tenantId: string): Promise<DonnaImportStatus> {
  const db = createDb();

  const [[clientsRow], [servicesRow], [apptsRow], [lastRun]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.clients)
      .where(eq(schema.clients.tenantId, tenantId)),
    db
      .select({ n: count() })
      .from(schema.services)
      .where(eq(schema.services.tenantId, tenantId)),
    db
      .select({ n: count() })
      .from(schema.appointments)
      .where(eq(schema.appointments.tenantId, tenantId)),
    db
      .select({
        status: schema.importRuns.status,
        label: schema.importRuns.label,
        startedAt: schema.importRuns.startedAt,
        finishedAt: schema.importRuns.finishedAt,
        error: schema.importRuns.error,
      })
      .from(schema.importRuns)
      .where(eq(schema.importRuns.tenantId, tenantId))
      .orderBy(desc(schema.importRuns.startedAt))
      .limit(1),
  ]);

  const staleRunningMs = 3 * 60 * 60 * 1000;
  const startedAt = lastRun?.startedAt?.getTime() ?? 0;
  const importRunning =
    lastRun?.status === "running" &&
    (startedAt === 0 || Date.now() - startedAt < staleRunningMs);

  return {
    clients: clientsRow?.n ?? 0,
    services: servicesRow?.n ?? 0,
    appointments: apptsRow?.n ?? 0,
    importRunning,
    lastImport: lastRun
      ? {
          status: lastRun.status,
          label: lastRun.label,
          finishedAt: lastRun.finishedAt,
          error: lastRun.error,
        }
      : null,
    exportAvailable: Boolean(exportDir()),
  };
}

/** Dispara import AppBeleza em processo separado (não trava o painel). */
export function spawnDonnaImport(): { ok: true } | { ok: false; error: string } {
  const dir = exportDir();
  if (!dir) {
    return { ok: false, error: "Arquivos de exportação não encontrados no servidor." };
  }

  const script = path.join(appRoot(), "scripts/import-appbarber.mjs");
  if (!fs.existsSync(script)) {
    return { ok: false, error: "Script de importação indisponível." };
  }

  const child = spawn(
    process.execPath,
    [
      script,
      "--tenant",
      DONNA_SLUG,
      "--name",
      "Donna Elegant",
      "--dir",
      dir,
      "--source",
      "appbeleza",
      "--branch-slug",
      "unidade-01",
      "--branch-name",
      "Donna Elegant — Unidade 01",
      "--branch-address",
      "Rua Curitiba, 486 — Catanduva-SP",
    ],
    {
      cwd: appRoot(),
      env: process.env,
      detached: true,
      stdio: "ignore",
    }
  );
  child.unref();

  return { ok: true };
}

export async function ensureDonnaImportIfEmpty(tenantId: string, tenantSlug: string): Promise<void> {
  if (tenantSlug !== DONNA_SLUG) return;

  const status = await getDonnaImportStatus(tenantId);
  if (status.clients >= 100 || status.importRunning) return;

  spawnDonnaImport();
}
