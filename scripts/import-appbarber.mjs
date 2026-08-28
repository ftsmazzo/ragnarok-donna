/**
 * Import AppBarber → Postgres (multi-tenant).
 *
 * Uso:
 *   $env:DATABASE_URL="postgres://..."
 *   node scripts/import-appbarber.mjs
 *   node scripts/import-appbarber.mjs --dir research/export/2026-08-26T14-56-45 --extras research/export/2026-08-26T15-15-09-extras
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import {
  cleanStr,
  mapAppointmentStatus,
  mapOrderItemType,
  mapOrderStatus,
  mapPaymentMethod,
  parseCommissionBps,
  parseDateBr,
  parseMoney,
  phoneE164,
} from "./lib/appbarber-transform.mjs";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const EXPORT_DIR = path.resolve(
  arg("--dir", "research/export/2026-08-26T14-56-45")
);
const EXTRAS_DIR = path.resolve(
  arg("--extras", "research/export/2026-08-26T15-15-09-extras")
);
const TENANT_SLUG = arg("--tenant", "ragnaroks");
const TENANT_NAME = arg("--name", "RagnaroK's Barbearia");
const BRANCH_SLUG = arg("--branch-slug", "unidade-01");
const BRANCH_NAME = arg("--branch-name", "Unidade 01");
const BRANCH_ADDRESS = arg("--branch-address", "");
const EXTERNAL_SOURCE = arg("--source", "appbarber");
/** Enum import_source no Postgres — appbeleza usa o mesmo bucket que appbarber. */
const IMPORT_RUN_SOURCE = EXTERNAL_SOURCE === "appbeleza" ? "appbarber" : EXTERNAL_SOURCE;
const BATCH = Number(arg("--batch", "400"));
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

function readJson(name, dir = EXPORT_DIR) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadMap(sql, table, tenantId) {
  const rows = await sql`
    select id, external_id from ${sql(table)}
    where tenant_id = ${tenantId} and external_source = ${EXTERNAL_SOURCE}
  `;
  return new Map(rows.map((r) => [String(r.external_id), r.id]));
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  const stats = {};
  const t0 = Date.now();
  let runId = null;

  try {
    console.log("→ Tenant", TENANT_SLUG);
    const [tenant] = await sql`
      insert into tenants (name, slug, plan_code, status)
      values (${TENANT_NAME}, ${TENANT_SLUG}, 'pro', 'active')
      on conflict (slug) do update set name = excluded.name, updated_at = now()
      returning id
    `;
    const tenantId = tenant.id;

    await sql`
      insert into plans (code, name, price_cents_monthly, entitlements)
      values
        ('trial', 'Trial 30 dias', 0, '{"max_staff":5}'::jsonb),
        ('starter', 'Starter', 7990, '{"max_staff":2}'::jsonb),
        ('pro', 'Pro', 14990, '{"max_staff":10}'::jsonb),
        ('network', 'Rede', 29990, '{"max_staff":50}'::jsonb)
      on conflict (code) do nothing
    `;

    const [branch] = await sql`
      insert into branches (tenant_id, name, slug, address, is_active, external_source, external_id)
      values (
        ${tenantId},
        ${BRANCH_NAME},
        ${BRANCH_SLUG},
        ${BRANCH_ADDRESS || null},
        true,
        ${EXTERNAL_SOURCE},
        'main'
      )
      on conflict (tenant_id, slug) do update set
        name = excluded.name,
        address = coalesce(excluded.address, branches.address),
        updated_at = now()
      returning id
    `;

    const [run] = await sql`
      insert into import_runs (tenant_id, source, status, label, artifact_uri, started_at, stats)
      values (${tenantId}, ${IMPORT_RUN_SOURCE}, 'running', ${path.basename(EXPORT_DIR)}, ${EXPORT_DIR}, now(), '{}'::jsonb)
      returning id
    `;
    runId = run.id;

    // --- Cadastros ---
    const profRows = readJson("profissionais").map((r) => ({
      tenant_id: tenantId,
      branch_id: branch.id,
      name: cleanStr(r.Pes_Nome, 160) || "Profissional",
      nickname: cleanStr(r.Pes_Apelido, 80),
      email: cleanStr(r.PAF_Email, 200),
      phone: cleanStr(r.PAF_Celular, 32),
      avatar_url: cleanStr(r.PAF_Imagem, 500),
      is_bookable: true,
      is_active: true,
      default_commission_bps: null,
      meta: { gestor: r.PAF_Gestor === "1" },
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.Pes_Codigo),
    }));
    for (const batch of chunk(profRows, BATCH)) {
      await sql`
        insert into staff ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          name = excluded.name, nickname = excluded.nickname, email = excluded.email,
          phone = excluded.phone, avatar_url = excluded.avatar_url, meta = excluded.meta,
          updated_at = now()
      `;
    }
    stats.staff = profRows.length;
    const staffMap = await loadMap(sql, "staff", tenantId);
    console.log("✓ staff", stats.staff);

    const catNames = [
      ...new Set(readJson("servicos").map((r) => cleanStr(r.TCa_Descricao, 120)).filter(Boolean)),
    ];
    for (const name of catNames) {
      await sql`
        insert into service_categories (tenant_id, name, external_source, external_id)
        values (${tenantId}, ${name}, ${EXTERNAL_SOURCE}, ${name})
        on conflict (tenant_id, name) do nothing
      `;
    }
    const cats = await sql`
      select id, name from service_categories where tenant_id = ${tenantId}
    `;
    const catMap = new Map(cats.map((c) => [c.name, c.id]));

    const svcRows = readJson("servicos").map((r) => ({
      tenant_id: tenantId,
      category_id: catMap.get(cleanStr(r.TCa_Descricao, 120)) ?? null,
      name: cleanStr(r.Ser_Descricao, 160) || "Serviço",
      duration_min: Number(r.Ser_Intervalo_Padrao) || 30,
      price_cents: parseMoney(r.Ser_Valor),
      commission_bps: parseCommissionBps(r.Ser_Comissao),
      is_active: true,
      bookable_online: r.Ser_Usa_App === "1",
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.Ser_Codigo),
    }));
    for (const batch of chunk(svcRows, BATCH)) {
      await sql`
        insert into services ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          name = excluded.name, duration_min = excluded.duration_min,
          price_cents = excluded.price_cents, commission_bps = excluded.commission_bps,
          category_id = excluded.category_id, updated_at = now()
      `;
    }
    stats.services = svcRows.length;
    const serviceMap = await loadMap(sql, "services", tenantId);
    console.log("✓ services", stats.services);

    const prodRows = readJson("produtos").map((r) => ({
      tenant_id: tenantId,
      name: cleanStr(r.Descricao, 160) || "Produto",
      category: cleanStr(r.Categoria, 80),
      brand: cleanStr(r.Marca, 80),
      price_cents: parseMoney(r.Valor),
      stock_qty: Number(r.Saldo) || 0,
      min_qty: Number(r.QtdMinima) || 0,
      for_sale: r.DisponivelVenda !== "0",
      for_internal_use: r.Uso === "Sim",
      commission_bps: parseCommissionBps(r.Comissao),
      is_active: true,
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.Codigo),
    }));
    for (const batch of chunk(prodRows, BATCH)) {
      await sql`
        insert into products ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          name = excluded.name, price_cents = excluded.price_cents,
          stock_qty = excluded.stock_qty, category = excluded.category, updated_at = now()
      `;
    }
    stats.products = prodRows.length;
    const productMap = await loadMap(sql, "products", tenantId);
    console.log("✓ products", stats.products);

    const pkgItemsByCode = new Map();
    for (const it of readJson("pacote-itens", EXTRAS_DIR)) {
      const code = String(it.PacoteCodigo);
      if (!pkgItemsByCode.has(code)) pkgItemsByCode.set(code, []);
      pkgItemsByCode.get(code).push({
        description: it.Descricao,
        qty: Number(it.Quantidade) || 1,
        serviceExternalId: it.SerCodigo || null,
        productExternalId: it.ProCodigo || null,
        valueCents: parseMoney(it.Valor),
      });
    }

    const pkgRows = readJson("pacotes").map((r) => ({
      tenant_id: tenantId,
      name: cleanStr(r.Descricao, 160) || "Pacote",
      price_cents: parseMoney(r.ValorTotal || r.ValorVenda),
      expires_after_days: r.Expiracao ? Number(r.Expiracao) : null,
      is_active: true,
      bookable_online: String(r.CodDisponivel) === "1",
      items: pkgItemsByCode.get(String(r.Codigo)) ?? [],
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.Codigo),
    }));
    for (const batch of chunk(pkgRows, BATCH)) {
      await sql`
        insert into packages ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          name = excluded.name, price_cents = excluded.price_cents,
          items = excluded.items, updated_at = now()
      `;
    }
    stats.packages = pkgRows.length;
    console.log("✓ packages", stats.packages);

    await sql`delete from staff_schedules where tenant_id = ${tenantId}`;
    const schedRows = [];
    for (const r of readJson("jornadas")) {
      const staffId = staffMap.get(String(r.Pes_Codigo));
      if (!staffId) continue;
      const weekday = Number(r.PJo_Dia);
      const slots = [
        [r.PJo_Hor_Ini1, r.PJo_Hor_Fim1, 1],
        [r.PJo_Hor_Ini2, r.PJo_Hor_Fim2, 2],
        [r.PJo_Hor_Ini3, r.PJo_Hor_Fim3, 3],
      ];
      for (const [ini, fim, idx] of slots) {
        if (!ini || !fim) continue;
        schedRows.push({
          tenant_id: tenantId,
          staff_id: staffId,
          branch_id: branch.id,
          weekday,
          start_time: ini,
          end_time: fim,
          slot_index: idx,
          is_active: true,
          external_source: EXTERNAL_SOURCE,
          external_id: `${r.Pes_Codigo}-${weekday}-${idx}`,
        });
      }
    }
    for (const batch of chunk(schedRows, BATCH)) {
      await sql`insert into staff_schedules ${sql(batch)}`;
    }
    stats.staff_schedules = schedRows.length;
    console.log("✓ staff_schedules", stats.staff_schedules);

    const clientRowsRaw = [
      ...readJson("clientes").map((r) => ({ r, removed: false, id: r.Codigo })),
      ...readJson("clientes-removidos").map((r) => ({
        r,
        removed: true,
        id: r.Codigo || r.Pes_Codigo || r.id,
      })),
    ];
    const clientByExt = new Map();
    for (const row of clientRowsRaw) {
      const extId = String(row.id || "").trim();
      if (!extId || extId === "undefined") continue;
      const r = row.r;
      clientByExt.set(extId, {
        tenant_id: tenantId,
        name: cleanStr(r.Nome || r.Pes_Nome, 160) || "Cliente",
        email: cleanStr(r.Email || r.Paf_Email, 200),
        phone: cleanStr(r.Celular || r.Telefone || r.Paf_Celular || r.Paf_Telefone, 32),
        phone_e164: phoneE164(r.DDI, r.Celular || r.Paf_Celular || r.Telefone || r.Paf_Telefone),
        notes: cleanStr(r.Obs || r.Paf_Observacao, 2000),
        loyalty_points: Number(r.Pontos || r.Total_Pontos) || 0,
        is_active: !row.removed,
        deleted_at: row.removed ? new Date() : null,
        external_source: EXTERNAL_SOURCE,
        external_id: extId,
      });
    }
    const clientRows = [...clientByExt.values()];
    for (const batch of chunk(clientRows, BATCH)) {
      await sql`
        insert into clients ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          name = excluded.name, phone = excluded.phone, phone_e164 = excluded.phone_e164,
          loyalty_points = excluded.loyalty_points, notes = excluded.notes,
          is_active = excluded.is_active, deleted_at = excluded.deleted_at, updated_at = now()
      `;
    }
    stats.clients = clientRows.length;
    const clientMap = await loadMap(sql, "clients", tenantId);
    console.log("✓ clients", stats.clients);

    // --- Agenda ---
    const apptRows = readJson("agenda").map((r) => ({
      tenant_id: tenantId,
      branch_id: branch.id,
      client_id: clientMap.get(String(r.codCliente)) ?? null,
      staff_id: staffMap.get(String(r.resources || r.profissionalId)) ?? null,
      service_id: serviceMap.get(String(r.sercodigo)) ?? null,
      starts_at: new Date(r.start),
      ends_at: new Date(r.end),
      status: mapAppointmentStatus(r.status),
      price_cents: parseMoney(r.valor),
      notes: cleanStr(r.obs, 2000),
      source: "import",
      is_encaixe: r.Encaixe === "1",
      meta: {
        comCodigo: r.Com_Codigo || null,
        codCliente: r.codCliente ? String(r.codCliente) : null,
        title: r.title || null,
      },
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.id),
    }));
    for (const batch of chunk(apptRows, BATCH)) {
      await sql`
        insert into appointments ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          client_id = excluded.client_id, staff_id = excluded.staff_id,
          service_id = excluded.service_id, starts_at = excluded.starts_at,
          ends_at = excluded.ends_at, status = excluded.status,
          price_cents = excluded.price_cents, notes = excluded.notes, updated_at = now()
      `;
    }
    stats.appointments = apptRows.length;
    console.log("✓ appointments", stats.appointments);

    // --- Comandas ---
    const orderRows = readJson("comandas-historico").map((r) => ({
      tenant_id: tenantId,
      branch_id: branch.id,
      client_id: clientMap.get(String(r.CodigoCliente)) ?? null,
      status: mapOrderStatus(r.Status),
      opened_at: parseDateBr(r.DataCadastro) ?? parseDateBr(r.DataInsercao) ?? new Date(),
      closed_at: parseDateBr(r.DataFinaliza),
      total_cents: parseMoney(r.Valor),
      notes: cleanStr(r.Obs, 2000),
      meta: {
        tipoPagamento: r.TipoPagamento || null,
        profissional: r.Profissional || null,
        appbarberClientCode: r.CodigoCliente ? String(r.CodigoCliente) : null,
      },
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.Codigo),
    }));
    for (const batch of chunk(orderRows, BATCH)) {
      await sql`
        insert into orders ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          client_id = excluded.client_id, status = excluded.status,
          opened_at = excluded.opened_at, closed_at = excluded.closed_at,
          total_cents = excluded.total_cents, notes = excluded.notes, updated_at = now()
      `;
    }
    stats.orders = orderRows.length;
    const orderMap = await loadMap(sql, "orders", tenantId);
    console.log("✓ orders", stats.orders);

    await sql`delete from payments where tenant_id = ${tenantId} and external_source = ${EXTERNAL_SOURCE}`;
    const payRows = readJson("comandas-historico")
      .filter((r) => mapOrderStatus(r.Status) === "closed" && r.TipoPagamento)
      .map((r) => ({
        tenant_id: tenantId,
        order_id: orderMap.get(String(r.Codigo)),
        method: mapPaymentMethod(r.TipoPagamento),
        amount_cents: parseMoney(r.Valor),
        paid_at: parseDateBr(r.DataFinaliza) ?? parseDateBr(r.DataCadastro) ?? new Date(),
        meta: { raw: r.TipoPagamento },
        external_source: EXTERNAL_SOURCE,
        external_id: String(r.Codigo),
      }))
      .filter((r) => r.order_id);
    for (const batch of chunk(payRows, BATCH)) {
      await sql`insert into payments ${sql(batch)}`;
    }
    stats.payments = payRows.length;
    console.log("✓ payments", stats.payments);

    const itemRows = readJson("comanda-itens")
      .map((r) => {
        const orderId = orderMap.get(String(r.Codigo || r.ComandaCodigo));
        if (!orderId) return null;
        const itemType = mapOrderItemType(r.TipoItem);
        return {
          tenant_id: tenantId,
          order_id: orderId,
          item_type: itemType,
          service_id:
            itemType === "service" ? serviceMap.get(String(r.CodSerPro)) ?? null : null,
          product_id:
            itemType === "product" ? productMap.get(String(r.CodSerPro)) ?? null : null,
          staff_id: staffMap.get(String(r.Profissional_Codigo)) ?? null,
          description: cleanStr(r.Item, 200) || "Item",
          qty: Number(r.Quantidade) || 1,
          unit_price_cents: parseMoney(r.ValorUn || r.Valor),
          discount_cents: parseMoney(r.Desconto),
          total_cents: parseMoney(r.ValorTotal || r.Valor),
          commission_bps: parseCommissionBps(r.ComissaoPrincipal),
          performed_at: parseDateBr(r.Data),
          external_source: EXTERNAL_SOURCE,
          external_id: String(r.CodItem),
        };
      })
      .filter(Boolean);
    for (const batch of chunk(itemRows, BATCH)) {
      await sql`
        insert into order_items ${sql(batch)}
        on conflict (tenant_id, external_source, external_id) do update set
          order_id = excluded.order_id, item_type = excluded.item_type,
          service_id = excluded.service_id, product_id = excluded.product_id,
          staff_id = excluded.staff_id, description = excluded.description,
          qty = excluded.qty, unit_price_cents = excluded.unit_price_cents,
          total_cents = excluded.total_cents, updated_at = now()
      `;
    }
    stats.order_items = itemRows.length;
    console.log("✓ order_items", stats.order_items);

    console.log("→ Vínculos cliente ↔ comanda/agenda…");
    const linkedOrders = await sql`
      update orders o
      set client_id = a.client_id, updated_at = now()
      from appointments a
      where o.tenant_id = ${tenantId}
        and a.tenant_id = ${tenantId}
        and o.client_id is null
        and a.client_id is not null
        and a.deleted_at is null
        and o.deleted_at is null
        and o.external_source = ${EXTERNAL_SOURCE}
        and a.external_source = ${EXTERNAL_SOURCE}
        and coalesce(a.meta->>'comCodigo', '') <> ''
        and o.external_id = a.meta->>'comCodigo'
    `;
    stats.orders_linked_via_agenda = linkedOrders.count;
    console.log("✓ orders ligadas via Com_Codigo", linkedOrders.count);

    await sql`delete from waitlist_entries where tenant_id = ${tenantId} and external_source = ${EXTERNAL_SOURCE}`;
    // --- Extras ---
    const waitRows = readJson("lista-espera", EXTRAS_DIR).map((r) => ({
      tenant_id: tenantId,
      client_id: null,
      staff_id: null,
      service_id: serviceMap.get(String(r.Ser_Codigo)) ?? null,
      phone: cleanStr(r.Celular, 32),
      desired_date: parseDateBr(r.LEs_Data),
      status: r.LEs_Enviado === "Sim" ? "notified" : "waiting",
      notes: cleanStr(r.LEs_Descricao, 2000),
      external_source: EXTERNAL_SOURCE,
      external_id: String(r.LEs_Codigo),
    }));
    for (const batch of chunk(waitRows, BATCH)) {
      await sql`insert into waitlist_entries ${sql(batch)}`;
    }
    stats.waitlist = waitRows.length;
    console.log("✓ waitlist", stats.waitlist);

    await sql`
      update import_runs set
        status = 'completed',
        finished_at = now(),
        stats = ${sql.json(stats)},
        updated_at = now()
      where id = ${runId}
    `;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log("\n✅ Import concluído em", elapsed + "s");
    console.log(JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("❌ Import falhou:", err);
    if (runId) {
      await sql`
        update import_runs set
          status = 'failed',
          error = ${String(err?.message ?? err).slice(0, 4000)},
          finished_at = now(),
          updated_at = now()
        where id = ${runId}
      `.catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
