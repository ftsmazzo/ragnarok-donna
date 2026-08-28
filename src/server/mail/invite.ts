type InviteEmailInput = {
  to: string;
  name: string;
  tenantName: string;
  tenantSlug: string;
  tempPassword: string;
};

export async function sendMemberInviteEmail(
  input: InviteEmailInput
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY não configurada" };
  }

  const from = process.env.RESEND_FROM?.trim() ?? "Painel <onboarding@resend.dev>";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const loginUrl = `${baseUrl}/login/${input.tenantSlug}`;

  const html = `
    <p>Olá, <strong>${escapeHtml(input.name)}</strong>!</p>
    <p>Seu acesso ao painel <strong>${escapeHtml(input.tenantName)}</strong> foi criado.</p>
    <p><strong>Login:</strong> ${escapeHtml(input.to)}<br/>
    <strong>Senha inicial:</strong> ${escapeHtml(input.tempPassword)}</p>
    <p><a href="${loginUrl}">Entrar no painel</a></p>
    <p style="color:#666;font-size:13px">Troque a senha em Configurações → Minha conta após o primeiro acesso.</p>
  `.trim();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `Acesso ao painel — ${input.tenantName}`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: body.slice(0, 200) || res.statusText };
    }

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Falha ao enviar e-mail",
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
