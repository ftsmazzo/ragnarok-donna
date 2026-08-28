import { getBase64FromMediaMessage } from "@/server/evolution/client";
import { describeImage, transcribeAudio } from "./llm";
import type { MessageUpsertData } from "./inbound";

export type InboundMediaKind = "audio" | "image" | "video" | "document";

export type EnrichedInbound = {
  body: string;
  mediaType?: string;
  meta?: Record<string, unknown>;
};

function extractPlainText(data: MessageUpsertData): string {
  const m = data.message;
  if (!m) return "";
  return (
    m.conversation?.trim() ||
    m.extendedTextMessage?.text?.trim() ||
    m.imageMessage?.caption?.trim() ||
    m.videoMessage?.caption?.trim() ||
    m.documentMessage?.caption?.trim() ||
    ""
  );
}

function detectMediaKind(data: MessageUpsertData): InboundMediaKind | null {
  const mt = (data.messageType ?? "").toLowerCase();
  const m = data.message;
  if (mt.includes("audio") || m?.audioMessage) return "audio";
  if (mt.includes("image") || m?.imageMessage) return "image";
  if (mt.includes("video") || m?.videoMessage) return "video";
  if (mt.includes("document") || m?.documentMessage) return "document";
  return null;
}

function toDataUrl(base64: string, mimetype: string) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "");
  return `data:${mimetype};base64,${clean}`;
}

/** Converte texto + mídia WhatsApp em body textual para a Donna. */
export async function enrichInboundMessage(
  instanceName: string,
  raw: MessageUpsertData
): Promise<EnrichedInbound | null> {
  const plain = extractPlainText(raw);
  const kind = detectMediaKind(raw);
  if (!kind && !plain) return null;

  if (!kind) {
    return { body: plain };
  }

  const waMessageId = raw.key?.id;
  if (!waMessageId) return plain ? { body: plain } : null;

  let downloaded: Awaited<ReturnType<typeof getBase64FromMediaMessage>> | null = null;
  try {
    downloaded = await getBase64FromMediaMessage(instanceName, {
      id: waMessageId,
      remoteJid: raw.key?.remoteJid,
      remoteJidAlt: raw.key?.remoteJidAlt,
      fromMe: raw.key?.fromMe ?? false,
    });
  } catch (err) {
    console.warn("[media] download falhou", err instanceof Error ? err.message : err);
  }

  const base64 = downloaded?.base64?.replace(/^data:[^;]+;base64,/, "");
  const mimetype = downloaded?.mimetype || "application/octet-stream";
  const meta: Record<string, unknown> = {
    inboundKind: kind,
    mimetype,
    waMessageId,
  };

  if (kind === "audio") {
    if (!base64) {
      return {
        body: plain || "[Áudio recebido — não foi possível ouvir. Peça ao cliente para repetir por texto.]",
        mediaType: "audio",
        meta: { ...meta, failed: "download" },
      };
    }
    const transcription = await transcribeAudio({ base64, mimetype });
    meta.transcription = transcription;
    const spoken =
      transcription?.trim() ||
      "[Áudio recebido — transcrição indisponível. Peça ao cliente para repetir por texto.]";
    const body = plain ? `${plain}\n[Áudio transcrito]: ${spoken}` : `[Áudio do cliente]: ${spoken}`;
    return { body, mediaType: "audio", meta };
  }

  if (kind === "image") {
    if (!base64) {
      const body =
        plain ||
        "[Imagem recebida — não foi possível abrir. Peça ao cliente para descrever ou reenviar.]";
      return { body, mediaType: "image", meta: { ...meta, failed: "download" } };
    }
    const dataUrl = toDataUrl(base64, mimetype.startsWith("image/") ? mimetype : "image/jpeg");
    const description =
      (await describeImage({ dataUrl, caption: plain || undefined })) ||
      "[Imagem recebida — descrição indisponível.]";
    meta.visionSummary = description;
    const body = plain
      ? `${plain}\n[Contexto da imagem]: ${description}`
      : `[Imagem enviada pelo cliente]: ${description}`;
    return { body, mediaType: "image", meta };
  }

  if (kind === "video") {
    const body = plain
      ? `${plain}\n[Vídeo recebido — responda com base na legenda; vídeo não foi analisado.]`
      : "[Vídeo recebido — peça ao cliente para descrever o que precisa ou enviar uma foto.]";
    return { body, mediaType: "video", meta };
  }

  const fileName =
    raw.message?.documentMessage?.fileName ||
    downloaded?.fileName ||
    "documento";
  const body = plain
    ? `${plain}\n[Documento recebido: ${fileName}]`
    : `[Documento recebido: ${fileName} — peça ao cliente para explicar o que precisa.]`;
  return { body, mediaType: "document", meta: { ...meta, fileName } };
}
