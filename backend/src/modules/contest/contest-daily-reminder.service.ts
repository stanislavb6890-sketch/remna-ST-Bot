import { prisma } from "../../db.js";
import { getSystemConfig } from "../client/client.service.js";

const TELEGRAM_DELAY_MS = 80;
const SKIP_PATTERNS = [/bot was blocked/i, /user is deactivated/i, /chat not found/i, /Forbidden/i, /PEER_ID_INVALID/i];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildReplyMarkup(buttonText?: string | null, buttonUrl?: string | null) {
  if (!buttonText?.trim() || !buttonUrl?.trim()) return undefined;
  return {
    inline_keyboard: [[{ text: buttonText.trim(), url: buttonUrl.trim() }]],
  };
}

async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup?: object
): Promise<{ ok: boolean; skip?: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && data.ok) return { ok: true };
    const desc = data.description ?? "";
    if (SKIP_PATTERNS.some((p) => p.test(desc))) return { ok: false, skip: true, error: desc };
    return { ok: false, error: desc };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function formatPrizeLine(prizeType: string, prizeValue: string): string {
  const v = (prizeValue || "").trim();
  if (!v) return "—";
  if (prizeType === "balance") return `${v} ₽ на баланс`;
  if (prizeType === "vpn_days") return `${v} дней VPN`;
  return v;
}

function buildContestStartMessage(contest: {
  name: string;
  startAt: Date;
  endAt: Date;
  dailyMessage: string | null;
  prize1Type: string;
  prize1Value: string;
  prize2Type: string;
  prize2Value: string;
  prize3Type: string;
  prize3Value: string;
}): string {
  const startStr = contest.startAt.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" });
  const endStr = contest.endAt.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" });
  const lines: string[] = [
    `<b>🏆 Конкурс «${contest.name}» запущен!</b>`,
    "",
    `📅 Период: с ${startStr} по ${endStr}.`,
  ];
  if (contest.dailyMessage?.trim()) {
    lines.push("", contest.dailyMessage.trim());
  }
  lines.push(
    "",
    "<b>🎁 Призы:</b>",
    `1 место — ${formatPrizeLine(contest.prize1Type, contest.prize1Value)}`,
    `2 место — ${formatPrizeLine(contest.prize2Type, contest.prize2Value)}`,
    `3 место — ${formatPrizeLine(contest.prize3Type, contest.prize3Value)}`
  );
  return lines.join("\n");
}

async function broadcastToClients(
  botToken: string,
  clients: { telegramId: string | null }[],
  text: string,
  replyMarkup?: object
): Promise<{ sent: number; errors: number; skipped: number }> {
  let sent = 0;
  let errors = 0;
  let skipped = 0;
  for (const c of clients) {
    const tid = c.telegramId?.trim();
    if (!tid) continue;
    const result = await sendTelegram(botToken, tid, text, replyMarkup);
    if (result.ok) sent++;
    else if (result.skip) skipped++;
    else errors++;
    await delay(TELEGRAM_DELAY_MS);
  }
  return { sent, errors, skipped };
}

export async function runContestDailyReminder(): Promise<{ sent: number; errors: number }> {
  const now = new Date();
  const config = await getSystemConfig();
  const botToken = config.telegramBotToken?.trim();
  if (!botToken) {
    console.warn("[contest-daily-reminder] telegram_bot_token not set, skip");
    return { sent: 0, errors: 0 };
  }

  const clients = await prisma.client.findMany({
    where: { telegramId: { not: null }, isBlocked: false },
    select: { telegramId: true },
  });
  if (clients.length === 0) return { sent: 0, errors: 0 };

  let totalSent = 0;
  let totalErrors = 0;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const contestsForDaily = await prisma.contest.findMany({
    where: {
      startAt: { lte: now },
      endAt: { gte: now },
      status: "active",
      startNotificationSentAt: { not: null },
    },
    orderBy: { startAt: "desc" },
  });

  for (const contest of contestsForDaily) {
    if (contest.lastDailyReminderAt && contest.lastDailyReminderAt >= today) {
      continue;
    }

    const text =
      (contest.dailyMessage?.trim()) ||
      `🏆 Конкурс «${contest.name}» идёт до ${contest.endAt.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}. Участвуйте — призы за 1, 2 и 3 место!`;
    const markup = buildReplyMarkup(contest.buttonText, contest.buttonUrl);
    const result = await broadcastToClients(botToken, clients, text, markup);

    await prisma.contest.update({
      where: { id: contest.id },
      data: { lastDailyReminderAt: now },
    });

    totalSent += result.sent;
    totalErrors += result.errors;
    if (result.sent > 0 || result.errors > 0) {
      console.log(`[contest-daily-reminder] Contest "${contest.name}" daily: sent=${result.sent}, errors=${result.errors}, skipped=${result.skipped}`);
    }
  }

  const contestJustStarted = await prisma.contest.findFirst({
    where: {
      startAt: { lte: now },
      endAt: { gte: now },
      status: "active",
      startNotificationSentAt: null,
    },
    orderBy: { startAt: "desc" },
  });
  if (contestJustStarted) {
    const text = buildContestStartMessage(contestJustStarted);
    const markup = buildReplyMarkup(contestJustStarted.buttonText, contestJustStarted.buttonUrl);
    const result = await broadcastToClients(botToken, clients, text, markup);
    await prisma.contest.update({
      where: { id: contestJustStarted.id },
      data: { startNotificationSentAt: now, lastDailyReminderAt: now },
    });
    totalSent += result.sent;
    totalErrors += result.errors;
    console.log(`[contest-daily-reminder] Contest "${contestJustStarted.name}" start notification: sent=${result.sent}, errors=${result.errors}`);
  }

  return { sent: totalSent, errors: totalErrors };
}

export async function sendContestStartNotification(contestId: string): Promise<{ ok: boolean; sent?: number; errors?: number; error?: string }> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return { ok: false, error: "Конкурс не найден" };

  const config = await getSystemConfig();
  const botToken = config.telegramBotToken?.trim();
  if (!botToken) return { ok: false, error: "Не задан токен бота (Настройки → Telegram)" };

  const clients = await prisma.client.findMany({
    where: { telegramId: { not: null }, isBlocked: false },
    select: { telegramId: true },
  });

  const now = new Date();
  const text = buildContestStartMessage(contest);
  const markup = buildReplyMarkup(contest.buttonText, contest.buttonUrl);
  const result = await broadcastToClients(botToken, clients, text, markup);

  await prisma.contest.update({
    where: { id: contestId },
    data: { status: "active", startNotificationSentAt: now, lastDailyReminderAt: now },
  });
  return { ok: true, sent: result.sent, errors: result.errors };
}

export async function sendContestDrawResults(contestId: string): Promise<void> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      winners: {
        include: { client: { select: { telegramUsername: true, email: true } } },
        orderBy: { place: "asc" },
      },
    },
  });
  if (!contest || contest.winners.length === 0) return;

  const config = await getSystemConfig();
  const botToken = config.telegramBotToken?.trim();
  if (!botToken) return;

  const clients = await prisma.client.findMany({
    where: { telegramId: { not: null }, isBlocked: false },
    select: { telegramId: true },
  });

  const lines: string[] = [
    `<b>🏆 Конкурс «${contest.name}» — результаты розыгрыша!</b>`,
    "",
    "<b>Победители:</b>",
  ];
  for (const w of contest.winners) {
    const name = w.client.telegramUsername ? `@${w.client.telegramUsername}` : w.client.email ?? "—";
    lines.push(`${w.place} место — ${name} (${formatPrizeLine(w.prizeType, w.prizeValue)})`);
  }
  lines.push("", "Поздравляем победителей! 🎉");
  const text = lines.join("\n");
  const markup = buildReplyMarkup(contest.buttonText, contest.buttonUrl);
  const result = await broadcastToClients(botToken, clients, text, markup);
  console.log(`[contest] Draw results for "${contest.name}": sent=${result.sent}, errors=${result.errors}, skipped=${result.skipped}`);
}
