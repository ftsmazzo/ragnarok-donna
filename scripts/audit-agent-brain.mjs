/**
 * Amostra conversas + tool_calls do tenant ragnaroks para classificar falhas do agente.
 * DATABASE_URL=... node scripts/audit-agent-brain.mjs [--days 14]
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

function loadEnv() {
  const p = path.resolve(".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv();

const days = Number(
  process.argv.includes("--days")
    ? process.argv[process.argv.indexOf("--days") + 1]
    : 21
);

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 25 });

const [tenant] = await sql`select id, slug from tenants where slug = 'ragnaroks' limit 1`;
if (!tenant) {
  console.error("tenant ragnaroks não encontrado");
  process.exit(1);
}

const since = new Date(Date.now() - days * 86400000);

const toolStats = await sql`
  select tool_name, status, count(*)::int as n
  from agent_tool_calls
  where tenant_id = ${tenant.id} and created_at >= ${since}
  group by 1, 2
  order by n desc
`;

const failSamples = await sql`
  select tool_name, output, created_at
  from agent_tool_calls
  where tenant_id = ${tenant.id}
    and created_at >= ${since}
    and status = 'error'
  order by created_at desc
  limit 40
`;

const handoffs = await sql`
  select count(*)::int as n
  from conversations
  where tenant_id = ${tenant.id}
    and mode = 'human'
    and updated_at >= ${since}
`;

const waitlistTools = await sql`
  select status, count(*)::int as n
  from agent_tool_calls
  where tenant_id = ${tenant.id}
    and created_at >= ${since}
    and tool_name in ('add_to_waitlist', 'list_waitlist')
  group by status
`;

const cancelThenNoBook = await sql`
  with cancels as (
    select conversation_id, created_at
    from agent_tool_calls
    where tenant_id = ${tenant.id}
      and created_at >= ${since}
      and tool_name = 'cancel_appointment'
      and status = 'ok'
  )
  select count(*)::int as n
  from cancels c
  where not exists (
    select 1 from agent_tool_calls b
    where b.conversation_id = c.conversation_id
      and b.tool_name = 'book_appointment'
      and b.status = 'ok'
      and b.created_at > c.created_at
      and b.created_at < c.created_at + interval '10 minutes'
  )
`;

const longAi = await sql`
  select count(*)::int as n
  from messages
  where tenant_id = ${tenant.id}
    and direction = 'outbound_ai'
    and created_at >= ${since}
    and length(body) > 420
`;

const inboundNoReply = await sql`
  with recent_in as (
    select conversation_id, max(created_at) as last_in
    from messages
    where tenant_id = ${tenant.id}
      and direction = 'inbound'
      and created_at >= ${since}
    group by 1
  )
  select count(*)::int as n
  from recent_in r
  join conversations c on c.id = r.conversation_id
  where c.mode = 'ai'
    and not exists (
      select 1 from messages m
      where m.conversation_id = r.conversation_id
        and m.direction = 'outbound_ai'
        and m.created_at > r.last_in
        and m.created_at < r.last_in + interval '3 minutes'
    )
`;

const report = {
  tenant: tenant.slug,
  days,
  since: since.toISOString(),
  toolStats,
  failSampleCount: failSamples.length,
  failSamples: failSamples.slice(0, 15).map((f) => ({
    tool: f.tool_name,
    error: JSON.stringify(f.output ?? {}).slice(0, 160),
    at: f.created_at,
  })),
  handoffsHuman: handoffs[0]?.n ?? 0,
  waitlistTools,
  cancelWithoutBook10m: cancelThenNoBook[0]?.n ?? 0,
  longAiReplies: longAi[0]?.n ?? 0,
  inboundNoAiReply3m: inboundNoReply[0]?.n ?? 0,
  classifications: [
    {
      id: "reschedule-gap",
      label: "Cancel sem book em 10min (possível remarcação quebrada)",
      count: cancelThenNoBook[0]?.n ?? 0,
    },
    {
      id: "silence",
      label: "Inbound sem reply AI em 3min (modo ai)",
      count: inboundNoReply[0]?.n ?? 0,
    },
    {
      id: "verbose",
      label: "Replies AI > 420 chars",
      count: longAi[0]?.n ?? 0,
    },
    {
      id: "tool-fail",
      label: "Tool calls falhos",
      count: failSamples.length,
    },
  ],
};

const outDir = path.resolve("docs/agent");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `audit-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("wrote", outFile);
await sql.end({ timeout: 5 });
