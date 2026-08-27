import { NextResponse } from "next/server";
import { listToolDefinitions, SKILL_CATALOG } from "@/server/agent";
import { assertAgentServiceToken, readBearerToken } from "@/server/agent/auth";

export const dynamic = "force-dynamic";

/** Catálogo de tools/skills (MCP / n8n discovery). Auth: Bearer AGENT_SERVICE_TOKEN */
export async function GET(request: Request) {
  try {
    assertAgentServiceToken(readBearerToken(request.headers.get("authorization")));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    version: 1,
    tools: listToolDefinitions(),
    skills: SKILL_CATALOG,
  });
}
