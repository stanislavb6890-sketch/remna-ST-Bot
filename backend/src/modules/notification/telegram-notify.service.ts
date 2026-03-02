/**
 * Уведомления пользователя в Telegram (пополнение баланса, оплата тарифа).
 * Вызывается из webhook'ов после успешной обработки платежа.
 */

import { prisma } from "../../db.js";
import { getSystemConfig } from "../client/client.service.js";

type AdminNotificationEventType = "balance_topup" | "tariff_payment" | "new_client" | "new_ticket";

type AdminNotificationPreferenceRow = {
  telegramId: string;
  notifyBalanceTopup: boolean;
  notifyTariffPayment: boolean;
  notifyNewClient: boolean;
  notifyNewTicket: boolean;
};

async function sendTelegramToUser(telegramId: string, text: string): Promise<void> {
  const config = await getSystemConfig();
  const token = config.telegramBotToken?.trim();
  if (!token) {
    console.warn("[Telegram notify] Bot token not configured, skip notification");
    return;
  }
  const chatId = telegramId.trim();
  if (!chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      console.warn("[Telegram notify] sendMessage failed", { chatId: chatId.slice(0, 8) + "...", error: data.description ?? res.statusText });
    }
  } catch (e) {
    console.warn("[Telegram notify] sendMessage error", e);
  }
}

async function sendTelegramToAdminsForEvent(eventType: AdminNotificationEventType, text: string): Promise<void> {
  const config = await getSystemConfig();
  const groupId = config.notificationTelegramGroupId?.trim();
  // Если указана группа — шлём только в группу; иначе — только админам в личку
  if (groupId) {
    await sendTelegramToUser(groupId, text).catch((e) => {
      console.warn("[Telegram notify] send to group failed", e);
    });
    return;
  }
  const adminIds = config.botAdminTelegramIds ?? [];
  if (!adminIds.length) return;
  const prefs = (await prisma.adminNotificationPreference.findMany({
    where: { telegramId: { in: adminIds } },
  })) as AdminNotificationPreferenceRow[];
  const byId = new Map<string, AdminNotificationPreferenceRow>(prefs.map((p) => [p.telegramId, p]));
  const shouldSend = (telegramId: string) => {
    const p = byId.get(telegramId);
    if (!p) return true;
    switch (eventType) {
      case "balance_topup":
        return p.notifyBalanceTopup;
      case "tariff_payment":
        return p.notifyTariffPayment;
      case "new_client":
        return p.notifyNewClient;
      case "new_ticket":
        return p.notifyNewTicket;
      default:
        return true;
    }
  };
  await Promise.all(
    adminIds
      .filter((id) => shouldSend(id))
      .map((id) =>
        sendTelegramToUser(id, text).catch((e) => {
          console.warn("[Telegram notify] send to admin failed", e);
        })
      )
  );
}

function formatMoney(amount: number, currency: string): string {
  const curr = (currency || "RUB").toUpperCase();
  if (curr === "RUB") return `${amount.toFixed(2)} ₽`;
  if (curr === "USD") return `$${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${curr}`;
}

/**
 * Отправить уведомление о пополнении баланса.
 */
export async function notifyBalanceToppedUp(clientId: string, amount: number, currency: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { telegramId: true, email: true, telegramUsername: true, id: true },
  });
  if (!client) return;
  const textForClient = client.telegramId ? `✅ <b>Баланс пополнен</b> на ${formatMoney(amount, currency)}.` : null;
  if (client.telegramId && textForClient) {
    await sendTelegramToUser(client.telegramId, textForClient);
  }
  const clientLabel =
    client.email?.trim() ||
    (client.telegramUsername ? `@${client.telegramUsername}` : client.id);
  const textForAdmins =
    `💰 <b>Пополнение баланса</b>\n\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n` +
    `Сумма: ${formatMoney(amount, currency)}`;
  await sendTelegramToAdminsForEvent("balance_topup", textForAdmins);
}

/**
 * Отправить уведомление об оплате и активации тарифа.
 */
export async function notifyTariffActivated(clientId: string, paymentId: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { telegramId: true, email: true, telegramUsername: true, id: true },
  });
  if (!client) return;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { tariff: { select: { name: true } } },
  });
  const tariffName = payment?.tariff?.name?.trim() || "Тариф";
  if (client.telegramId) {
    const textClient = `✅ <b>Тариф «${escapeHtml(tariffName)}»</b> оплачен и активирован.\n\nМожете подключаться к VPN.`;
    await sendTelegramToUser(client.telegramId, textClient);
  }
  const clientLabel =
    client.email?.trim() ||
    (client.telegramUsername ? `@${client.telegramUsername}` : client.id);
  const textAdmins =
    `📦 <b>Оплата тарифа</b>\n\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n` +
    `Тариф: «${escapeHtml(tariffName)}»`;
  await sendTelegramToAdminsForEvent("tariff_payment", textAdmins);
}

export async function notifyAdminsAboutNewTicket(params: {
  ticketId: string;
  clientId: string;
  subject: string;
  firstMessage: string;
}): Promise<void> {
  const [client, ticket] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.clientId },
      select: { email: true, telegramUsername: true, id: true },
    }),
    prisma.ticket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, subject: true, status: true },
    }),
  ]);
  if (!ticket) return;
  const config = await getSystemConfig();
  const clientLabel =
    client?.email?.trim() ||
    (client?.telegramUsername ? `@${client.telegramUsername}` : client?.id || "unknown");
  const baseUrl = (config.publicAppUrl || "").replace(/\/+$/, "");
  const link =
    baseUrl && ticket.id
      ? `\n\nАдминка: ${escapeHtml(`${baseUrl}/admin/tickets`)}`
      : "";
  const preview =
    params.firstMessage.length > 200
      ? `${params.firstMessage.slice(0, 197)}...`
      : params.firstMessage;
  const text =
    `🆕 <b>Новый тикет</b>\n\n` +
    `Тема: <b>${escapeHtml(ticket.subject)}</b>\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n\n` +
    `${escapeHtml(preview)}${link}`;
  await sendTelegramToAdminsForEvent("new_ticket", text);
}

export async function notifyAdminsAboutClientTicketMessage(params: {
  ticketId: string;
  clientId: string;
  content: string;
}): Promise<void> {
  const [client, ticket] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.clientId },
      select: { email: true, telegramUsername: true, id: true },
    }),
    prisma.ticket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, subject: true, status: true },
    }),
  ]);
  if (!ticket) return;
  const config = await getSystemConfig();
  const clientLabel =
    client?.email?.trim() ||
    (client?.telegramUsername ? `@${client.telegramUsername}` : client?.id || "unknown");
  const baseUrl = (config.publicAppUrl || "").replace(/\/+$/, "");
  const link =
    baseUrl && ticket.id
      ? `\n\nАдминка: ${escapeHtml(`${baseUrl}/admin/tickets`)}`
      : "";
  const preview =
    params.content.length > 200 ? `${params.content.slice(0, 197)}...` : params.content;
  const text =
    `💬 <b>Новое сообщение в тикете</b>\n\n` +
    `Тема: <b>${escapeHtml(ticket.subject)}</b>\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n\n` +
    `${escapeHtml(preview)}${link}`;
  await sendTelegramToAdminsForEvent("new_ticket", text);
}

export async function notifyAdminsAboutSupportReply(params: {
  ticketId: string;
  clientId: string;
  content: string;
}): Promise<void> {
  const [client, ticket] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.clientId },
      select: { email: true, telegramUsername: true, id: true },
    }),
    prisma.ticket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, subject: true, status: true },
    }),
  ]);
  if (!ticket) return;
  const config = await getSystemConfig();
  const clientLabel =
    client?.email?.trim() ||
    (client?.telegramUsername ? `@${client.telegramUsername}` : client?.id || "unknown");
  const baseUrl = (config.publicAppUrl || "").replace(/\/+$/, "");
  const link =
    baseUrl && ticket.id
      ? `\n\nАдминка: ${escapeHtml(`${baseUrl}/admin/tickets`)}`
      : "";
  const preview =
    params.content.length > 200 ? `${params.content.slice(0, 197)}...` : params.content;
  const text =
    `✅ <b>Ответ поддержки в тикете</b>\n\n` +
    `Тема: <b>${escapeHtml(ticket.subject)}</b>\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n\n` +
    `${escapeHtml(preview)}${link}`;
  await sendTelegramToAdminsForEvent("new_ticket", text);
}

export async function notifyAdminsAboutTicketStatusChange(params: {
  ticketId: string;
  clientId: string;
  subject: string;
  status: string;
}): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: params.clientId },
    select: { email: true, telegramUsername: true, id: true },
  });
  const config = await getSystemConfig();
  const clientLabel =
    client?.email?.trim() ||
    (client?.telegramUsername ? `@${client.telegramUsername}` : client?.id || "unknown");
  const baseUrl = (config.publicAppUrl || "").replace(/\/+$/, "");
  const link =
    baseUrl && params.ticketId
      ? `\n\nАдминка: ${escapeHtml(`${baseUrl}/admin/tickets`)}`
      : "";
  const statusLabel = params.status === "closed" ? "закрыт" : "открыт";
  const text =
    `ℹ️ <b>Статус тикета изменён</b>\n\n` +
    `Тема: <b>${escapeHtml(params.subject)}</b>\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n` +
    `Новый статус: <b>${escapeHtml(statusLabel)}</b>${link}`;
  await sendTelegramToAdminsForEvent("new_ticket", text);
}

export async function notifyAdminsAboutNewClient(clientId: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, email: true, telegramUsername: true, createdAt: true },
  });
  if (!client) return;
  const config = await getSystemConfig();
  const baseUrl = (config.publicAppUrl || "").replace(/\/+$/, "");
  const clientLabel =
    client.email?.trim() ||
    (client.telegramUsername ? `@${client.telegramUsername}` : client.id);
  const link =
    baseUrl && client.id
      ? `\n\nКлиенты: ${escapeHtml(`${baseUrl}/admin/clients`)}`
      : "";
  const createdAt = client.createdAt.toISOString().slice(0, 19).replace("T", " ");
  const text =
    `👤 <b>Новый клиент</b>\n\n` +
    `Клиент: ${escapeHtml(clientLabel)}\n` +
    `Создан: ${escapeHtml(createdAt)}${link}`;
  await sendTelegramToAdminsForEvent("new_client", text);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Отправить уведомление о создании прокси-слотов (после оплаты).
 */
export async function notifyProxySlotsCreated(clientId: string, slotIds: string[], tariffName?: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { telegramId: true } });
  if (!client?.telegramId || slotIds.length === 0) return;

  const slots = await prisma.proxySlot.findMany({
    where: { id: { in: slotIds } },
    select: { node: { select: { publicHost: true, socksPort: true, httpPort: true } }, login: true, password: true },
    orderBy: { createdAt: "asc" },
  });

  const name = tariffName?.trim() || "Прокси";
  let text = `✅ <b>Прокси «${escapeHtml(name)}»</b> оплачены.\n\n`;
  for (const s of slots) {
    const host = s.node.publicHost ?? "host";
    text += `• SOCKS5: <code>socks5://${escapeHtml(s.login)}:${escapeHtml(s.password)}@${escapeHtml(host)}:${s.node.socksPort}</code>\n`;
    text += `• HTTP: <code>http://${escapeHtml(s.login)}:${escapeHtml(s.password)}@${escapeHtml(host)}:${s.node.httpPort}</code>\n\n`;
  }
  text += "Скопируйте строку в настройки прокси вашего приложения.";

  await sendTelegramToUser(client.telegramId, text);
}

/**
 * Отправить уведомление о создании Sing-box слотов (после оплаты).
 */
export async function notifySingboxSlotsCreated(clientId: string, slotIds: string[], tariffName?: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { telegramId: true } });
  if (!client?.telegramId || slotIds.length === 0) return;

  const slots = await prisma.singboxSlot.findMany({
    where: { id: { in: slotIds } },
    select: {
      userIdentifier: true,
      secret: true,
      node: { select: { publicHost: true, port: true, protocol: true, tlsEnabled: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const { buildSingboxSlotSubscriptionLink } = await import("../singbox/singbox-link.js");
  const name = tariffName?.trim() || "Sing-box";
  let text = `✅ <b>Доступы «${escapeHtml(name)}»</b> оплачены.\n\n`;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    const link = buildSingboxSlotSubscriptionLink(
      { publicHost: s.node.publicHost ?? "", port: s.node.port ?? 443, protocol: s.node.protocol ?? "VLESS", tlsEnabled: s.node.tlsEnabled },
      { userIdentifier: s.userIdentifier, secret: s.secret },
      `${name}-${i + 1}`
    );
    text += `• <code>${escapeHtml(link)}</code>\n\n`;
  }
  text += "Скопируйте ссылку в приложение (v2rayN, Nekoray, Shadowrocket и др.).";

  await sendTelegramToUser(client.telegramId, text);
}
