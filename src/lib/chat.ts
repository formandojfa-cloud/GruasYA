/**
 * Chat de un servicio (sin compartir números): cliente, gruero asignado y
 * central escriben en el mismo hilo; se sondea junto con el estado.
 */
import type { ChatRole } from "@/generated/prisma/enums";
import { prisma } from "./db";
import { DispatchError } from "./dispatch";
import type { ChatMessageView } from "./types";

export const CHAT_MAX_TEXT = 500;
export const CHAT_PAGE = 100;

export type ChatActor = { role: ChatRole; id: string; name: string };

/** Comprueba que el actor pertenece al servicio. La central siempre puede. */
export async function assertChatAccess(requestId: string, actor: Pick<ChatActor, "role" | "id">): Promise<void> {
  const req = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, providerId: true },
  });
  if (!req) throw new DispatchError("REQUEST_NOT_FOUND", "Solicitud no encontrada", 404);
  if (actor.role === "PBX") return;
  if (actor.role === "CLIENT" && req.userId === actor.id) return;
  if (actor.role === "PROVIDER" && req.providerId === actor.id) return;
  throw new DispatchError("FORBIDDEN", "No puedes ver este chat", 403);
}

/** Últimos 100 mensajes, del más viejo al más nuevo. */
export async function listMessages(requestId: string): Promise<ChatMessageView[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { requestId },
    orderBy: { at: "desc" },
    take: CHAT_PAGE,
  });
  rows.reverse();
  const names = await senderNames(rows);
  return rows.map((m) => ({
    id: m.id,
    senderRole: m.senderRole,
    senderId: m.senderId,
    senderName: names.get(`${m.senderRole}:${m.senderId}`) ?? roleLabel(m.senderRole),
    text: m.text,
    at: m.at.toISOString(),
  }));
}

export async function postMessage(requestId: string, actor: ChatActor, text: string, now: Date = new Date()): Promise<ChatMessageView> {
  const clean = text.trim();
  if (!clean) throw new DispatchError("EMPTY_MESSAGE", "Escribe un mensaje", 400);
  if (clean.length > CHAT_MAX_TEXT) throw new DispatchError("MESSAGE_TOO_LONG", "Máximo 500 caracteres", 400);
  const m = await prisma.chatMessage.create({
    data: { requestId, senderRole: actor.role, senderId: actor.id, text: clean, at: now },
  });
  return { id: m.id, senderRole: m.senderRole, senderId: m.senderId, senderName: actor.name, text: m.text, at: m.at.toISOString() };
}

function roleLabel(role: ChatRole): string {
  return role === "CLIENT" ? "Conductor" : role === "PROVIDER" ? "Piloto" : "Central";
}

async function senderNames(rows: { senderRole: ChatRole; senderId: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = (role: ChatRole) => [...new Set(rows.filter((r) => r.senderRole === role).map((r) => r.senderId))];
  const [users, providers, operators] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids("CLIENT") } }, select: { id: true, name: true } }),
    prisma.provider.findMany({ where: { id: { in: ids("PROVIDER") } }, select: { id: true, name: true } }),
    prisma.operator.findMany({ where: { id: { in: ids("PBX") } }, select: { id: true, name: true } }),
  ]);
  for (const u of users) out.set(`CLIENT:${u.id}`, u.name.split(" ")[0]);
  for (const p of providers) out.set(`PROVIDER:${p.id}`, p.name);
  for (const o of operators) out.set(`PBX:${o.id}`, `Central · ${o.name}`);
  return out;
}
