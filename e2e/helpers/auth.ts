import { type Page, expect } from "@playwright/test";

export function e2eAuthConfigured(): boolean {
  return Boolean(
    process.env.E2E_EMAIL?.trim() &&
      process.env.E2E_PASSWORD?.trim() &&
      process.env.E2E_TENANT_SLUG?.trim()
  );
}

/** Login via API + cookie — evita flakiness do formulário multi-tenant. */
export async function loginAsE2EUser(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL!.trim();
  const password = process.env.E2E_PASSWORD!.trim();
  const tenantSlug = process.env.E2E_TENANT_SLUG!.trim();

  const res = await page.request.post("/api/auth/login", {
    data: { email, password, tenantSlug },
  });
  expect(res.ok(), `login falhou: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { ok?: boolean; error?: string };
  expect(body.ok, body.error ?? "login sem ok").toBeTruthy();
}
