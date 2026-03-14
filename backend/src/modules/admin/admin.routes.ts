/**
 * Админские эндпоинты — прокси к Remna API + клиенты панели + настройки
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { requireAuth, requireAdminSection } from "../auth/middleware.js";
import { hashPassword } from "../auth/auth.service.js";
import { hashPassword as hashClientPassword } from "../client/client.service.js";
import {
  remnaGetUsers,
  remnaGetSubscriptions,
  remnaGetSubscriptionTemplates,
  remnaGetInternalSquads,
  remnaGetExternalSquads,
  remnaGetSystemStats,
  remnaGetSystemStatsNodes,
  remnaGetNodes,
  remnaEnableNode,
  remnaDisableNode,
  remnaRestartNode,
  remnaGetUser,
  remnaUpdateUser,
  remnaRevokeUserSubscription,
  remnaDisableUser,
  remnaDeleteUser,
  remnaEnableUser,
  remnaResetUserTraffic,
  isRemnaConfigured,
} from "../remna/remna.client.js";
import { getSystemConfig } from "../client/client.service.js";
import { syncFromRemna, syncToRemna, createRemnaUsersForClientsWithoutUuid } from "../sync/sync.service.js";
import { distributeReferralRewards } from "../referral/referral.service.js";
import { markPaymentPaid } from "../payment/mark-paid.service.js";
import { registerBackupRoutes } from "../backup/backup.routes.js";
import { runBroadcast, getBroadcastRecipientsCount } from "../broadcast/broadcast.service.js";
import {
  notifyAdminsAboutSupportReply,
  notifyAdminsAboutTicketStatusChange,
} from "../notification/telegram-notify.service.js";
import { runRule, runAllRules, getEligibleClientIds } from "../auto-broadcast/auto-broadcast.service.js";

export const adminRouter = Router();
adminRouter.use(requireAuth);

/** Обёртка для async-роутов: ошибки передаются в next() и возвращают 500. */
function asyncRoute(
  fn: (req: express.Request, res: express.Response) => Promise<void | express.Response>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

registerBackupRoutes(adminRouter, asyncRoute);

adminRouter.use(requireAdminSection);

adminRouter.get("/me", asyncRoute(async (req, res) => {
  const adminId = (req as unknown as { adminId: string }).adminId;
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, email: true, mustChangePassword: true, role: true, allowedSections: true, totpEnabled: true },
  });
  if (!admin) return res.status(401).json({ message: "Not found" });
  const allowedSections = admin.allowedSections
    ? (() => {
        try {
          const p = JSON.parse(admin.allowedSections!) as unknown;
          return Array.isArray(p) ? p.filter((s): s is string => typeof s === "string") : [];
        } catch {
          return [];
        }
      })()
    : [];
  return res.json({ ...admin, allowedSections });
}));

adminRouter.get("/remna/status", (_req, res) => {
  res.json({ configured: isRemnaConfigured() });
});

adminRouter.get("/remna/users", async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const result = await remnaGetUsers({ page, limit });
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

adminRouter.get("/remna/subscriptions", async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const result = await remnaGetSubscriptions({ page, limit });
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

adminRouter.get("/remna/subscription-templates", async (_req, res) => {
  const result = await remnaGetSubscriptionTemplates();
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

adminRouter.get("/remna/squads/internal", asyncRoute(async (_req, res) => {
  const result = await remnaGetInternalSquads();
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
}));

adminRouter.get("/remna/squads/external", async (_req, res) => {
  const result = await remnaGetExternalSquads();
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

adminRouter.get("/remna/system/stats", async (_req, res) => {
  const result = await remnaGetSystemStats();
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

adminRouter.get("/remna/system/stats/nodes", async (_req, res) => {
  const result = await remnaGetSystemStatsNodes();
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

adminRouter.get("/remna/nodes", async (_req, res) => {
  const result = await remnaGetNodes();
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? {});
});

const remnaNodeUuidSchema = z.object({ uuid: z.string().uuid() });

adminRouter.post("/remna/nodes/:uuid/enable", async (req, res) => {
  const parsed = remnaNodeUuidSchema.safeParse({ uuid: req.params.uuid });
  if (!parsed.success) return res.status(400).json({ message: "Invalid node UUID" });
  const result = await remnaEnableNode(parsed.data.uuid);
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? { ok: true });
});

adminRouter.post("/remna/nodes/:uuid/disable", async (req, res) => {
  const parsed = remnaNodeUuidSchema.safeParse({ uuid: req.params.uuid });
  if (!parsed.success) return res.status(400).json({ message: "Invalid node UUID" });
  const result = await remnaDisableNode(parsed.data.uuid);
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? { ok: true });
});

adminRouter.post("/remna/nodes/:uuid/restart", async (req, res) => {
  const parsed = remnaNodeUuidSchema.safeParse({ uuid: req.params.uuid });
  if (!parsed.success) return res.status(400).json({ message: "Invalid node UUID" });
  const result = await remnaRestartNode(parsed.data.uuid);
  if (result.error) {
    return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  }
  return res.json(result.data ?? { ok: true });
});

/** Условие: только реальные поступления (исключаем оплату с баланса, чтобы не дублировать учёт). */
const PAID_EXTERNAL_WHERE = { status: "PAID" as const, provider: { not: "balance" } };

/** Статистика дашборда: пользователи (локальная БД), продажи (Payment PAID — только внешние поступления). */
adminRouter.get("/dashboard/stats", async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [clientsTotal, clientsWithRemna, paidAgg, paidToday, paidLast7, paidLast30, newClientsToday, newClientsLast7, newClientsLast30] =
    await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { remnawaveUuid: { not: null } } }),
      prisma.payment.aggregate({
        where: PAID_EXTERNAL_WHERE,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...PAID_EXTERNAL_WHERE, paidAt: { gte: todayStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...PAID_EXTERNAL_WHERE, paidAt: { gte: sevenDaysAgo } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...PAID_EXTERNAL_WHERE, paidAt: { gte: thirtyDaysAgo } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.client.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.client.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.client.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

  return res.json({
    users: {
      total: clientsTotal,
      withRemna: clientsWithRemna,
      newToday: newClientsToday,
      newLast7Days: newClientsLast7,
      newLast30Days: newClientsLast30,
    },
    sales: {
      totalAmount: paidAgg._sum.amount ?? 0,
      totalCount: paidAgg._count,
      todayAmount: paidToday._sum.amount ?? 0,
      todayCount: paidToday._count,
      last7DaysAmount: paidLast7._sum.amount ?? 0,
      last7DaysCount: paidLast7._count,
      last30DaysAmount: paidLast30._sum.amount ?? 0,
      last30DaysCount: paidLast30._count,
    },
  });
});

adminRouter.get("/notifications/counters", asyncRoute(async (_req, res) => {
  const [totalClients, totalTickets, totalTariffPayments, totalBalanceTopups] = await Promise.all([
    prisma.client.count(),
    prisma.ticket.count(),
    prisma.payment.count({
      where: {
        status: "PAID",
        OR: [
          { tariffId: { not: null } },
          { proxyTariffId: { not: null } },
          { singboxTariffId: { not: null } },
        ],
      },
    }),
    prisma.payment.count({
      where: {
        status: "PAID",
        tariffId: null,
        proxyTariffId: null,
        singboxTariffId: null,
      },
    }),
  ]);
  return res.json({ totalClients, totalTickets, totalTariffPayments, totalBalanceTopups });
}));

/** Отметить платёж как оплаченный и начислить реферальные бонусы (3 уровня) */
const paymentIdParamSchema = z.object({ id: z.string().min(1) });
const markPaymentPaidSchema = z.object({ status: z.literal("PAID") });
adminRouter.patch("/payments/:id", asyncRoute(async (req, res) => {
  const params = paymentIdParamSchema.safeParse(req.params);
  const body = markPaymentPaidSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    const err = !params.success ? params.error.flatten() : body.error!.flatten();
    return res.status(400).json({ message: "Invalid input", errors: err });
  }
  const result = await markPaymentPaid(params.data.id);
  if (!result.ok) {
    return res.status(404).json({ message: result.error ?? "Payment not found" });
  }
  return res.json({
    payment: result.payment,
    referral: result.referral,
    activation: result.activation,
    proxySlots: result.proxySlots,
    balanceCredited: result.balanceCredited,
  });
}));

/** Сериализация тарифа для JSON (BigInt → number) */
function tariffToJson(t: { id: string; categoryId: string; name: string; description: string | null; durationDays: number; internalSquadUuids: string[]; trafficLimitBytes: bigint | null; deviceLimit: number | null; price: number; currency: string; sortOrder: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: t.id,
    categoryId: t.categoryId,
    name: t.name,
    description: t.description ?? null,
    durationDays: t.durationDays,
    internalSquadUuids: t.internalSquadUuids,
    trafficLimitBytes: t.trafficLimitBytes != null ? Number(t.trafficLimitBytes) : null,
    deviceLimit: t.deviceLimit,
    price: t.price,
    currency: t.currency,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ——— Категории тарифов ———
const tariffCategoryIdSchema = z.object({ id: z.string().min(1) });

adminRouter.get("/tariff-categories", async (_req, res) => {
  try {
    const list = await prisma.tariffCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { tariffs: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    return res.json({
      items: list.map((c) => ({
        id: c.id,
        name: c.name,
        emojiKey: c.emojiKey ?? null,
        sortOrder: c.sortOrder,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        tariffs: c.tariffs.map(tariffToJson),
      })),
    });
  } catch (e) {
    console.error("GET /tariff-categories error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("does not exist") || msg.includes("tariff_categories")) {
      return res.status(503).json({
        message: "Таблицы тарифов не найдены. Выполните в папке backend: npx prisma db push",
      });
    }
    return res.status(500).json({ message: "Ошибка загрузки категорий тарифов", error: msg });
  }
});

const createTariffCategorySchema = z.object({
  name: z.string().min(1).max(255),
  sortOrder: z.number().int().optional(),
  emojiKey: z.string().max(32).optional().nullable(),
});
const updateTariffCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sortOrder: z.number().int().optional(),
  emojiKey: z.string().max(32).optional().nullable(),
});

adminRouter.post("/tariff-categories", async (req, res) => {
  const body = createTariffCategorySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Неверные данные", errors: body.error.flatten() });
  const created = await prisma.tariffCategory.create({
    data: {
      name: body.data.name,
      sortOrder: body.data.sortOrder ?? 0,
      emojiKey: body.data.emojiKey ?? undefined,
    },
  });
  return res.status(201).json({
    id: created.id,
    name: created.name,
    emojiKey: created.emojiKey,
    sortOrder: created.sortOrder,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

adminRouter.patch("/tariff-categories/:id", async (req, res) => {
  const idParse = tariffCategoryIdSchema.safeParse({ id: req.params.id });
  if (!idParse.success) return res.status(400).json({ message: "Invalid id" });
  const body = updateTariffCategorySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Неверные данные", errors: body.error.flatten() });
  const data: { name?: string; sortOrder?: number; emojiKey?: string | null } = {};
  if (body.data.name !== undefined) data.name = body.data.name;
  if (body.data.sortOrder !== undefined) data.sortOrder = body.data.sortOrder;
  if (body.data.emojiKey !== undefined) data.emojiKey = body.data.emojiKey;
  const updated = await prisma.tariffCategory.update({
    where: { id: idParse.data.id },
    data,
  });
  return res.json({
    id: updated.id,
    name: updated.name,
    emojiKey: updated.emojiKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

adminRouter.delete("/tariff-categories/:id", async (req, res) => {
  const idParse = tariffCategoryIdSchema.safeParse({ id: req.params.id });
  if (!idParse.success) return res.status(400).json({ message: "Invalid id" });
  await prisma.tariffCategory.delete({ where: { id: idParse.data.id } });
  return res.json({ success: true });
});

// ——— Тарифы ———
const tariffIdSchema = z.object({ id: z.string().min(1) });
const createTariffSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  durationDays: z.number().int().min(1).max(3650),
  internalSquadUuids: z.array(z.string().uuid()).min(1),
  trafficLimitBytes: z.number().int().nonnegative().nullable().optional(),
  deviceLimit: z.number().int().nonnegative().nullable().optional(),
  price: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  sortOrder: z.number().int().optional(),
});
const updateTariffSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  internalSquadUuids: z.array(z.string().uuid()).optional(),
  trafficLimitBytes: z.number().int().nonnegative().nullable().optional(),
  deviceLimit: z.number().int().nonnegative().nullable().optional(),
  price: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  sortOrder: z.number().int().optional(),
});

adminRouter.get("/tariffs", async (req, res) => {
  const categoryId = req.query.categoryId as string | undefined;
  const where = categoryId ? { categoryId } : {};
  const list = await prisma.tariff.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return res.json({ items: list.map(tariffToJson) });
});

adminRouter.post("/tariffs", async (req, res) => {
  const body = createTariffSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Неверные данные", errors: body.error.flatten() });
  const category = await prisma.tariffCategory.findUnique({ where: { id: body.data.categoryId } });
  if (!category) return res.status(400).json({ message: "Категория не найдена" });
  const created = await prisma.tariff.create({
    data: {
      categoryId: body.data.categoryId,
      name: body.data.name,
      description: body.data.description ?? null,
      durationDays: body.data.durationDays,
      internalSquadUuids: body.data.internalSquadUuids,
      trafficLimitBytes: body.data.trafficLimitBytes != null ? BigInt(body.data.trafficLimitBytes) : null,
      deviceLimit: body.data.deviceLimit ?? null,
      price: body.data.price ?? 0,
      currency: (body.data.currency ?? "usd").toLowerCase(),
      sortOrder: body.data.sortOrder ?? 0,
    },
  });
  return res.status(201).json(tariffToJson(created));
});

adminRouter.patch("/tariffs/:id", async (req, res) => {
  const idParse = tariffIdSchema.safeParse({ id: req.params.id });
  if (!idParse.success) return res.status(400).json({ message: "Invalid id" });
  const body = updateTariffSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Неверные данные", errors: body.error.flatten() });
  const data: { name?: string; description?: string | null; durationDays?: number; internalSquadUuids?: string[]; trafficLimitBytes?: bigint | null; deviceLimit?: number | null; price?: number; currency?: string; sortOrder?: number } = {};
  if (body.data.name != null) data.name = body.data.name;
  if (body.data.description !== undefined) data.description = body.data.description ?? null;
  if (body.data.durationDays != null) data.durationDays = body.data.durationDays;
  if (body.data.internalSquadUuids != null) data.internalSquadUuids = body.data.internalSquadUuids;
  if (body.data.trafficLimitBytes !== undefined) data.trafficLimitBytes = body.data.trafficLimitBytes != null ? BigInt(body.data.trafficLimitBytes) : null;
  if (body.data.deviceLimit !== undefined) data.deviceLimit = body.data.deviceLimit ?? null;
  if (body.data.price !== undefined) data.price = body.data.price;
  if (body.data.currency !== undefined) data.currency = body.data.currency.toLowerCase();
  if (body.data.sortOrder != null) data.sortOrder = body.data.sortOrder;
  const updated = await prisma.tariff.update({
    where: { id: idParse.data.id },
    data,
  });
  return res.json(tariffToJson(updated));
});

adminRouter.delete("/tariffs/:id", async (req, res) => {
  const idParse = tariffIdSchema.safeParse({ id: req.params.id });
  if (!idParse.success) return res.status(400).json({ message: "Invalid id" });
  await prisma.tariff.delete({ where: { id: idParse.data.id } });
  return res.json({ success: true });
});

// Клиенты панели (наши пользователи — бот, сайт, mini app)
adminRouter.get("/clients", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const isBlockedParam = req.query.isBlocked;

    const where: Prisma.ClientWhereInput = {};
    const conditions: Prisma.ClientWhereInput[] = [];

    if (search.length > 0) {
      conditions.push({
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { telegramUsername: { contains: search, mode: "insensitive" as const } },
          { telegramId: { contains: search } },
          { referralCode: { contains: search, mode: "insensitive" as const } },
          { id: { contains: search } },
        ],
      });
    }
    if (isBlockedParam === "true") conditions.push({ isBlocked: true });
    else if (isBlockedParam === "false") conditions.push({ isBlocked: false });

    if (conditions.length > 0) where.AND = conditions;
    const whereClause = conditions.length > 0 ? where : undefined;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          telegramId: true,
          telegramUsername: true,
          preferredLang: true,
          preferredCurrency: true,
          balance: true,
          referralCode: true,
          remnawaveUuid: true,
          trialUsed: true,
          isBlocked: true,
          blockReason: true,
          referralPercent: true,
          createdAt: true,
          _count: { select: { referrals: true } },
        },
      }),
      prisma.client.count({ where: whereClause }),
    ]);
    let items: ((typeof clients)[number] & { activeNode?: string | null })[] = clients;

    // Попробуем обогатить клиентов информацией об активной ноде Remna (если Remna настроен)
    if (isRemnaConfigured()) {
      const withRemna = clients.filter((c) => c.remnawaveUuid);
      const map: Record<string, string | null> = {};
      await Promise.all(
        withRemna.map(async (c) => {
          try {
            const resRemna = await remnaGetUser(c.remnawaveUuid!);
            if (resRemna.error || !resRemna.data) {
              map[c.id] = null;
              return;
            }
            const raw = resRemna.data as Record<string, unknown>;
            const resp = (raw.response ?? raw) as Record<string, unknown>;
            let label: string | null = null;
            // Пытаемся вытащить имя активной ноды из возможных полей ответа Remna
            if (typeof resp.activeNodeName === "string" && resp.activeNodeName.trim()) {
              label = resp.activeNodeName.trim();
            } else if (typeof resp.currentNodeName === "string" && resp.currentNodeName.trim()) {
              label = resp.currentNodeName.trim();
            } else if (Array.isArray(resp.activeInternalSquads)) {
              const first = resp.activeInternalSquads[0] as { uuid?: string; name?: string } | string | undefined;
              if (first && typeof first === "object") {
                label = (first.name || first.uuid || "").trim() || null;
              }
            }
            map[c.id] = label;
          } catch {
            map[c.id] = null;
          }
        })
      );
      items = clients.map((c) => ({
        ...c,
        activeNode: map[c.id] ?? null,
      }));
    }

    return res.json({ items, total, page, limit });
  } catch (e) {
    console.error("GET /admin/clients error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ message: "Ошибка загрузки клиентов. Выполните: cd backend && npx prisma db push", error: msg });
  }
});

const clientIdParam = z.object({ id: z.string().cuid() });

adminRouter.get("/clients/:id", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const client = await prisma.client.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      preferredLang: true,
      preferredCurrency: true,
      balance: true,
      referralCode: true,
      remnawaveUuid: true,
      trialUsed: true,
      isBlocked: true,
      blockReason: true,
      referralPercent: true,
      createdAt: true,
      _count: { select: { referrals: true } },
    },
  });
  if (!client) return res.status(404).json({ message: "Клиент не найден" });
  return res.json(client);
});

const updateClientSchema = z.object({
  email: z.string().email().nullable().optional(),
  preferredLang: z.string().max(5).optional(),
  preferredCurrency: z.string().max(5).optional(),
  balance: z.number().optional(),
  isBlocked: z.boolean().optional(),
  blockReason: z.string().nullable().optional(),
  referralPercent: z.number().min(0).max(100).nullable().optional(),
});

adminRouter.patch("/clients/:id", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const body = updateClientSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  const client = await prisma.client.findUnique({ where: { id: parsed.data.id } });
  if (!client) return res.status(404).json({ message: "Клиент не найден" });
  const updates: Record<string, unknown> = {};
  if (body.data.email !== undefined) updates.email = body.data.email;
  if (body.data.preferredLang !== undefined) updates.preferredLang = body.data.preferredLang;
  if (body.data.preferredCurrency !== undefined) updates.preferredCurrency = body.data.preferredCurrency;
  if (body.data.balance !== undefined) updates.balance = body.data.balance;
  if (body.data.isBlocked !== undefined) updates.isBlocked = body.data.isBlocked;
  if (body.data.blockReason !== undefined) updates.blockReason = body.data.blockReason;
  if (body.data.referralPercent !== undefined) updates.referralPercent = body.data.referralPercent;
  const updated = await prisma.client.update({
    where: { id: parsed.data.id },
    data: updates,
    select: {
      id: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      preferredLang: true,
      preferredCurrency: true,
      balance: true,
      referralCode: true,
      remnawaveUuid: true,
      trialUsed: true,
      isBlocked: true,
      blockReason: true,
      referralPercent: true,
      createdAt: true,
      _count: { select: { referrals: true } },
    },
  });
  return res.json(updated);
});

const setClientPasswordSchema = z.object({
  newPassword: z.string().min(8, "Пароль не менее 8 символов"),
});

adminRouter.patch("/clients/:id/password", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const body = setClientPasswordSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  const client = await prisma.client.findUnique({ where: { id: parsed.data.id } });
  if (!client) return res.status(404).json({ message: "Клиент не найден" });
  const passwordHash = await hashClientPassword(body.data.newPassword);
  await prisma.client.update({
    where: { id: parsed.data.id },
    data: { passwordHash },
  });
  return res.json({ success: true, message: "Пароль установлен" });
});

adminRouter.delete("/clients/:id", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const client = await prisma.client.findUnique({ where: { id: parsed.data.id }, select: { id: true, remnawaveUuid: true } });
  if (!client) return res.status(404).json({ message: "Клиент не найден" });
  if (client.remnawaveUuid && isRemnaConfigured()) {
    const remnaRes = await remnaDeleteUser(client.remnawaveUuid);
    if (remnaRes.error) {
      console.warn(`[admin delete client] Remna delete failed for ${client.remnawaveUuid}:`, remnaRes.error);
    }
  }
  await prisma.client.delete({ where: { id: parsed.data.id } });
  return res.json({ success: true });
});

async function getClientRemnaUuid(clientId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { remnawaveUuid: true },
  });
  return client?.remnawaveUuid ?? null;
}

adminRouter.get("/clients/:id/remna", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const result = await remnaGetUser(remnaUuid);
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

const remnaUpdateBodySchema = z.object({
  trafficLimitBytes: z.number().int().min(0).optional(),
  trafficLimitStrategy: z.enum(["NO_RESET", "DAY", "WEEK", "MONTH"]).optional(),
  hwidDeviceLimit: z.number().int().min(0).nullable().optional(),
  expireAt: z.string().datetime().optional(),
  activeInternalSquads: z.array(z.string().uuid()).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  telegramId: z.number().int().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

/** Извлечь из ответа Remna getUser: activeInternalSquads (uuid[]), telegramId, email — чтобы не затирать при PATCH. */
function getRemnaUserFieldsForMerge(data: unknown): { activeInternalSquads: string[]; telegramId?: number; email?: string | null } {
  if (!data || typeof data !== "object") return { activeInternalSquads: [] };
  const o = data as Record<string, unknown>;
  const resp = (o.response ?? o) as Record<string, unknown> | undefined;
  const ais = resp?.activeInternalSquads;
  const squads: string[] = [];
  if (Array.isArray(ais)) {
    for (const s of ais) {
      const u = (s && typeof s === "object" && "uuid" in s) ? (s as Record<string, unknown>).uuid : s;
      if (typeof u === "string") squads.push(u);
    }
  }
  return {
    activeInternalSquads: squads,
    ...(typeof resp?.telegramId === "number" && { telegramId: resp.telegramId }),
    ...(resp?.email !== undefined && { email: resp.email != null ? String(resp.email) : null }),
  };
}

adminRouter.patch("/clients/:id/remna", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const body = remnaUpdateBodySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  const getRes = await remnaGetUser(remnaUuid);
  if (getRes.error) return res.status(getRes.status >= 400 ? getRes.status : 500).json({ message: getRes.error });
  const current = getRemnaUserFieldsForMerge(getRes.data);
  const patchBody: Record<string, unknown> = { uuid: remnaUuid };
  if (body.data.activeInternalSquads === undefined && current.activeInternalSquads.length > 0) patchBody.activeInternalSquads = current.activeInternalSquads;
  if (body.data.telegramId === undefined && current.telegramId !== undefined) patchBody.telegramId = current.telegramId;
  if (body.data.email === undefined && current.email !== undefined) patchBody.email = current.email;
  Object.assign(patchBody, body.data);
  const result = await remnaUpdateUser(patchBody);
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

adminRouter.post("/clients/:id/remna/revoke-subscription", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const result = await remnaRevokeUserSubscription(remnaUuid);
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

adminRouter.post("/clients/:id/remna/disable", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const result = await remnaDisableUser(remnaUuid);
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

adminRouter.post("/clients/:id/remna/enable", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const result = await remnaEnableUser(remnaUuid);
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

adminRouter.post("/clients/:id/remna/reset-traffic", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const result = await remnaResetUserTraffic(remnaUuid);
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

const squadActionSchema = z.object({ squadUuid: z.string().uuid() });

adminRouter.post("/clients/:id/remna/squads/add", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const body = squadActionSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input" });
  // Получаем текущие сквады пользователя, чтобы добавить новый без потери существующих
  const userRes = await remnaGetUser(remnaUuid);
  const userData = userRes.data as Record<string, unknown> | undefined;
  const resp = (userData?.response ?? userData) as Record<string, unknown> | undefined;
  const currentSquads: string[] = [];
  const ais = resp?.activeInternalSquads;
  if (Array.isArray(ais)) {
    for (const s of ais) {
      const u = (s && typeof s === "object" && "uuid" in s) ? (s as Record<string, unknown>).uuid : s;
      if (typeof u === "string") currentSquads.push(u);
    }
  }
  if (!currentSquads.includes(body.data.squadUuid)) {
    currentSquads.push(body.data.squadUuid);
  }
  const result = await remnaUpdateUser({ uuid: remnaUuid, activeInternalSquads: currentSquads });
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

adminRouter.post("/clients/:id/remna/squads/remove", async (req, res) => {
  const parsed = clientIdParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid client id" });
  const remnaUuid = await getClientRemnaUuid(parsed.data.id);
  if (!remnaUuid) return res.status(400).json({ message: "Клиент не привязан к Remna" });
  const body = squadActionSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input" });
  // По api-1.yaml у DELETE .../remove-users нет requestBody — только uuid сквада в path; эндпоинт может убирать всех из сквада. Поэтому убираем сквад только у этого пользователя через PATCH user (как при add).
  const userRes = await remnaGetUser(remnaUuid);
  if (userRes.error) return res.status(userRes.status >= 400 ? userRes.status : 500).json({ message: userRes.error });
  const current = getRemnaUserFieldsForMerge(userRes.data);
  const currentSquads = current.activeInternalSquads.filter((u) => u !== body.data.squadUuid);
  const result = await remnaUpdateUser({ uuid: remnaUuid, activeInternalSquads: currentSquads });
  if (result.error) return res.status(result.status >= 400 ? result.status : 500).json({ message: result.error });
  return res.json(result.data ?? {});
});

// Настройки (языки, валюты, название сервиса) — для бота, mini app, сайта
adminRouter.get("/settings", asyncRoute(async (_req, res) => {
  const config = await getSystemConfig();
  return res.json(config);
}));

/** Базовый конфиг страницы подписки (subpage-00000000-0000-0000-0000-000000000000.json) для визуального редактора */
adminRouter.get("/default-subscription-page-config", asyncRoute(async (_req, res) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fileName = "subpage-00000000-0000-0000-0000-000000000000.json";
  const candidates = [
    path.join(process.cwd(), fileName),
    path.join(process.cwd(), "..", fileName),
    path.join(__dirname, "..", "..", "..", "..", fileName),
    path.join(__dirname, "..", "..", "..", "..", "..", fileName),
  ];
  let lastErr: unknown;
  for (const configPath of candidates) {
    try {
      const raw = await readFile(configPath, "utf-8");
      const data = JSON.parse(raw) as unknown;
      return res.json(data);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  return res.status(404).json({ message: "Default config file not found" });
}));

const updateSettingsSchema = z.object({
  activeLanguages: z.string().optional(),
  activeCurrencies: z.string().optional(),
  defaultLanguage: z.string().max(10).optional(),
  defaultCurrency: z.string().max(10).optional(),
  defaultReferralPercent: z.number().optional(),
  referralPercentLevel2: z.number().min(0).max(100).optional(),
  referralPercentLevel3: z.number().min(0).max(100).optional(),
  trialDays: z.number().int().min(0).optional(),
  trialSquadUuid: z.string().uuid().nullable().optional(),
  trialDeviceLimit: z.number().int().min(0).nullable().optional(),
  trialTrafficLimitBytes: z.number().int().min(0).nullable().optional(),
  serviceName: z.string().max(200).optional(),
  logo: z.string().max(5_500_000).nullable().optional(),
  logoBot: z.string().max(5_500_000).nullable().optional(),
  favicon: z.string().max(5_500_000).nullable().optional(),
  remnaClientUrl: z.string().max(2000).nullable().optional(),
  smtpHost: z.string().max(255).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(255).nullable().optional(),
  smtpPassword: z.string().max(500).nullable().optional(),
  smtpFromEmail: z.string().email().max(255).nullable().optional(),
  smtpFromName: z.string().max(200).nullable().optional(),
  publicAppUrl: z.string().max(2000).nullable().optional(),
  telegramBotToken: z.string().max(500).nullable().optional(),
  telegramBotUsername: z.string().max(100).nullable().optional(),
  botAdminTelegramIds: z.union([z.string().max(2000), z.array(z.string())]).nullable().optional(),
  notificationTelegramGroupId: z.string().max(100).nullable().optional(),
  plategaMerchantId: z.string().max(200).nullable().optional(),
  plategaSecret: z.string().max(500).nullable().optional(),
  plategaMethods: z.string().max(2000).nullable().optional(),
  yoomoneyClientId: z.string().max(200).nullable().optional(),
  yoomoneyClientSecret: z.string().max(500).nullable().optional(),
  yoomoneyReceiverWallet: z.string().max(50).nullable().optional(),
  yoomoneyNotificationSecret: z.string().max(500).nullable().optional(),
  yookassaShopId: z.string().max(200).nullable().optional(),
  yookassaSecretKey: z.string().max(500).nullable().optional(),
  cryptopayApiToken: z.string().max(500).nullable().optional(),
  cryptopayTestnet: z.boolean().optional(),
  heleketMerchantId: z.string().max(500).nullable().optional(),
  heleketApiKey: z.string().max(500).nullable().optional(),
  groqApiKey: z.string().max(500).nullable().optional(),
  groqModel: z.string().max(100).nullable().optional(),
  groqFallback1: z.string().max(100).nullable().optional(),
  groqFallback2: z.string().max(100).nullable().optional(),
  groqFallback3: z.string().max(100).nullable().optional(),
  aiSystemPrompt: z.string().max(5000).nullable().optional(),
  botButtons: z.string().max(10000).nullable().optional(),
  botButtonsPerRow: z.union([z.literal(1), z.literal(2), z.number().int().min(1).max(2)]).optional(),
  botEmojis: z.union([z.string().max(15000), z.record(z.object({ unicode: z.string().max(20).optional(), tgEmojiId: z.string().max(50).optional() }))]).nullable().optional(),
  botBackLabel: z.string().max(200).nullable().optional(),
  botMenuTexts: z.string().max(8000).nullable().optional(),
  botMenuLineVisibility: z.union([z.string().max(5000), z.record(z.boolean())]).nullable().optional(),
  botInnerButtonStyles: z.union([z.string().max(2000), z.record(z.string())]).nullable().optional(),
  botTariffsText: z.string().max(8000).nullable().optional(),
  botTariffsFields: z.union([z.string().max(2000), z.record(z.boolean())]).nullable().optional(),
  botPaymentText: z.string().max(8000).nullable().optional(),
  subscriptionPageConfig: z.string().max(500000).nullable().optional(),
  supportLink: z.string().max(2000).nullable().optional(),
  agreementLink: z.string().max(2000).nullable().optional(),
  offerLink: z.string().max(2000).nullable().optional(),
  instructionsLink: z.string().max(2000).nullable().optional(),
  ticketsEnabled: z.boolean().optional(),
  themeAccent: z.string().max(50).optional(),
  allowUserThemeChange: z.boolean().optional(),
  forceSubscribeEnabled: z.boolean().optional(),
  forceSubscribeChannelId: z.string().max(200).nullable().optional(),
  forceSubscribeMessage: z.string().max(1000).nullable().optional(),
  sellOptionsEnabled: z.boolean().optional(),
  sellOptionsTrafficEnabled: z.boolean().optional(),
  sellOptionsTrafficProducts: z.string().max(10000).nullable().optional(),
  sellOptionsDevicesEnabled: z.boolean().optional(),
  sellOptionsDevicesProducts: z.string().max(10000).nullable().optional(),
  sellOptionsServersEnabled: z.boolean().optional(),
  sellOptionsServersProducts: z.string().max(10000).nullable().optional(),
  googleAnalyticsId: z.string().max(100).nullable().optional(),
  yandexMetrikaId: z.string().max(100).nullable().optional(),
  autoBroadcastCron: z.string().max(100).nullable().optional(),
  adminFrontNotificationsEnabled: z.boolean().optional(),
  skipEmailVerification: z.boolean().optional(),
  useRemnaSubscriptionPage: z.boolean().optional(),
  aiChatEnabled: z.boolean().optional(),
  customBuildEnabled: z.boolean().optional(),
  customBuildPricePerDay: z.number().min(0).optional(),
  customBuildPricePerDevice: z.number().min(0).optional(),
  customBuildTrafficMode: z.enum(["unlimited", "per_gb"]).optional(),
  customBuildPricePerGb: z.number().min(0).optional(),
  customBuildSquadUuid: z.string().uuid().nullable().optional(),
  customBuildCurrency: z.string().max(10).optional(),
  customBuildMaxDays: z.number().int().min(1).max(360).optional(),
  customBuildMaxDevices: z.number().int().min(1).max(20).optional(),
  googleLoginEnabled: z.boolean().optional(),
  googleClientId: z.string().max(500).nullable().optional(),
  googleClientSecret: z.string().max(500).nullable().optional(),
  appleLoginEnabled: z.boolean().optional(),
  appleClientId: z.string().max(500).nullable().optional(),
  appleTeamId: z.string().max(100).nullable().optional(),
  appleKeyId: z.string().max(100).nullable().optional(),
  applePrivateKey: z.string().max(5000).nullable().optional(),
  landingEnabled: z.boolean().optional(),
  landingHeroTitle: z.string().max(500).nullable().optional(),
  landingHeroSubtitle: z.string().max(2000).nullable().optional(),
  landingHeroCtaText: z.string().max(100).nullable().optional(),
  landingShowTariffs: z.boolean().optional(),
  landingContacts: z.string().max(5000).nullable().optional(),
  landingOfferLink: z.string().max(2000).nullable().optional(),
  landingPrivacyLink: z.string().max(2000).nullable().optional(),
  landingFooterText: z.string().max(2000).nullable().optional(),
  landingHeroBadge: z.string().max(200).nullable().optional(),
  landingHeroHint: z.string().max(500).nullable().optional(),
  landingFeature1Label: z.string().max(200).nullable().optional(),
  landingFeature1Sub: z.string().max(200).nullable().optional(),
  landingFeature2Label: z.string().max(200).nullable().optional(),
  landingFeature2Sub: z.string().max(200).nullable().optional(),
  landingFeature3Label: z.string().max(200).nullable().optional(),
  landingFeature3Sub: z.string().max(200).nullable().optional(),
  landingFeature4Label: z.string().max(200).nullable().optional(),
  landingFeature4Sub: z.string().max(200).nullable().optional(),
  landingFeature5Label: z.string().max(200).nullable().optional(),
  landingFeature5Sub: z.string().max(200).nullable().optional(),
  landingBenefitsTitle: z.string().max(200).nullable().optional(),
  landingBenefitsSubtitle: z.string().max(1000).nullable().optional(),
  landingBenefit1Title: z.string().max(200).nullable().optional(),
  landingBenefit1Desc: z.string().max(1000).nullable().optional(),
  landingBenefit2Title: z.string().max(200).nullable().optional(),
  landingBenefit2Desc: z.string().max(1000).nullable().optional(),
  landingBenefit3Title: z.string().max(200).nullable().optional(),
  landingBenefit3Desc: z.string().max(1000).nullable().optional(),
  landingBenefit4Title: z.string().max(200).nullable().optional(),
  landingBenefit4Desc: z.string().max(1000).nullable().optional(),
  landingBenefit5Title: z.string().max(200).nullable().optional(),
  landingBenefit5Desc: z.string().max(1000).nullable().optional(),
  landingBenefit6Title: z.string().max(200).nullable().optional(),
  landingBenefit6Desc: z.string().max(1000).nullable().optional(),
  landingTariffsTitle: z.string().max(200).nullable().optional(),
  landingTariffsSubtitle: z.string().max(500).nullable().optional(),
  landingDevicesTitle: z.string().max(200).nullable().optional(),
  landingDevicesSubtitle: z.string().max(500).nullable().optional(),
  landingFaqTitle: z.string().max(200).nullable().optional(),
  landingFaqJson: z.string().max(20000).nullable().optional(),
  landingHeroHeadline1: z.string().max(300).nullable().optional(),
  landingHeroHeadline2: z.string().max(300).nullable().optional(),
  landingHeaderBadge: z.string().max(200).nullable().optional(),
  landingButtonLogin: z.string().max(100).nullable().optional(),
  landingButtonLoginCabinet: z.string().max(100).nullable().optional(),
  landingNavBenefits: z.string().max(100).nullable().optional(),
  landingNavTariffs: z.string().max(100).nullable().optional(),
  landingNavDevices: z.string().max(100).nullable().optional(),
  landingNavFaq: z.string().max(100).nullable().optional(),
  landingBenefitsBadge: z.string().max(200).nullable().optional(),
  landingDefaultPaymentText: z.string().max(300).nullable().optional(),
  landingButtonChooseTariff: z.string().max(100).nullable().optional(),
  landingNoTariffsMessage: z.string().max(500).nullable().optional(),
  landingButtonWatchTariffs: z.string().max(100).nullable().optional(),
  landingButtonStart: z.string().max(100).nullable().optional(),
  landingButtonOpenCabinet: z.string().max(100).nullable().optional(),
  landingJourneyStepsJson: z.string().max(5000).nullable().optional(),
  landingSignalCardsJson: z.string().max(5000).nullable().optional(),
  landingTrustPointsJson: z.string().max(2000).nullable().optional(),
  landingExperiencePanelsJson: z.string().max(3000).nullable().optional(),
  landingDevicesListJson: z.string().max(1000).nullable().optional(),
  landingQuickStartJson: z.string().max(1500).nullable().optional(),
  landingInfraTitle: z.string().max(500).nullable().optional(),
  landingNetworkCockpitText: z.string().max(500).nullable().optional(),
  landingPulseTitle: z.string().max(300).nullable().optional(),
  landingComfortTitle: z.string().max(300).nullable().optional(),
  landingComfortBadge: z.string().max(200).nullable().optional(),
  landingPrinciplesTitle: z.string().max(500).nullable().optional(),
  landingTechTitle: z.string().max(300).nullable().optional(),
  landingTechDesc: z.string().max(2000).nullable().optional(),
  landingCategorySubtitle: z.string().max(500).nullable().optional(),
  landingTariffDefaultDesc: z.string().max(500).nullable().optional(),
  landingTariffBullet1: z.string().max(300).nullable().optional(),
  landingTariffBullet2: z.string().max(300).nullable().optional(),
  landingTariffBullet3: z.string().max(300).nullable().optional(),
  landingLowestTariffDesc: z.string().max(500).nullable().optional(),
  landingDevicesCockpitText: z.string().max(500).nullable().optional(),
  landingUniversalityTitle: z.string().max(300).nullable().optional(),
  landingUniversalityDesc: z.string().max(500).nullable().optional(),
  landingQuickSetupTitle: z.string().max(300).nullable().optional(),
  landingQuickSetupDesc: z.string().max(500).nullable().optional(),
  landingPremiumServiceTitle: z.string().max(300).nullable().optional(),
  landingPremiumServicePara1: z.string().max(1000).nullable().optional(),
  landingPremiumServicePara2: z.string().max(1000).nullable().optional(),
  landingHowItWorksTitle: z.string().max(500).nullable().optional(),
  landingHowItWorksDesc: z.string().max(1000).nullable().optional(),
  landingStatsPlatforms: z.string().max(50).nullable().optional(),
  landingStatsTariffsLabel: z.string().max(50).nullable().optional(),
  landingStatsAccessLabel: z.string().max(50).nullable().optional(),
  landingStatsPaymentMethods: z.string().max(50).nullable().optional(),
  landingReadyToConnectEyebrow: z.string().max(200).nullable().optional(),
  landingReadyToConnectTitle: z.string().max(500).nullable().optional(),
  landingReadyToConnectDesc: z.string().max(2000).nullable().optional(),
});

adminRouter.patch("/settings", async (req, res) => {
  const rawBody = req.body as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(rawBody, "botInnerButtonStyles")) {
    const raw = rawBody.botInnerButtonStyles;
    const val =
      typeof raw === "string"
        ? raw
        : raw !== null && typeof raw === "object" && !Array.isArray(raw)
          ? JSON.stringify(raw)
          : "";
    await prisma.systemSetting.upsert({
      where: { key: "bot_inner_button_styles" },
      create: { key: "bot_inner_button_styles", value: val },
      update: { value: val },
    });
  }

  const body = updateSettingsSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  }
  const updates = body.data;
  if (updates.activeLanguages != null) {
    await prisma.systemSetting.upsert({
      where: { key: "active_languages" },
      create: { key: "active_languages", value: updates.activeLanguages },
      update: { value: updates.activeLanguages },
    });
  }
  if (updates.activeCurrencies != null) {
    await prisma.systemSetting.upsert({
      where: { key: "active_currencies" },
      create: { key: "active_currencies", value: updates.activeCurrencies },
      update: { value: updates.activeCurrencies },
    });
  }
  if (updates.defaultLanguage != null) {
    await prisma.systemSetting.upsert({
      where: { key: "default_language" },
      create: { key: "default_language", value: updates.defaultLanguage },
      update: { value: updates.defaultLanguage },
    });
  }
  if (updates.defaultCurrency != null) {
    await prisma.systemSetting.upsert({
      where: { key: "default_currency" },
      create: { key: "default_currency", value: updates.defaultCurrency },
      update: { value: updates.defaultCurrency },
    });
  }
  if (updates.defaultReferralPercent != null) {
    await prisma.systemSetting.upsert({
      where: { key: "default_referral_percent" },
      create: { key: "default_referral_percent", value: String(updates.defaultReferralPercent) },
      update: { value: String(updates.defaultReferralPercent) },
    });
  }
  if (updates.referralPercentLevel2 != null) {
    await prisma.systemSetting.upsert({
      where: { key: "referral_percent_level_2" },
      create: { key: "referral_percent_level_2", value: String(updates.referralPercentLevel2) },
      update: { value: String(updates.referralPercentLevel2) },
    });
  }
  if (updates.referralPercentLevel3 != null) {
    await prisma.systemSetting.upsert({
      where: { key: "referral_percent_level_3" },
      create: { key: "referral_percent_level_3", value: String(updates.referralPercentLevel3) },
      update: { value: String(updates.referralPercentLevel3) },
    });
  }
  if (updates.trialDays != null) {
    await prisma.systemSetting.upsert({
      where: { key: "trial_days" },
      create: { key: "trial_days", value: String(updates.trialDays) },
      update: { value: String(updates.trialDays) },
    });
  }
  if (updates.trialSquadUuid !== undefined) {
    const val = updates.trialSquadUuid ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "trial_squad_uuid" },
      create: { key: "trial_squad_uuid", value: val },
      update: { value: val },
    });
  }
  if (updates.trialDeviceLimit !== undefined) {
    const val = updates.trialDeviceLimit == null ? "" : String(updates.trialDeviceLimit);
    await prisma.systemSetting.upsert({
      where: { key: "trial_device_limit" },
      create: { key: "trial_device_limit", value: val },
      update: { value: val },
    });
  }
  if (updates.trialTrafficLimitBytes !== undefined) {
    const val = updates.trialTrafficLimitBytes == null ? "" : String(updates.trialTrafficLimitBytes);
    await prisma.systemSetting.upsert({
      where: { key: "trial_traffic_limit" },
      create: { key: "trial_traffic_limit", value: val },
      update: { value: val },
    });
  }
  if (updates.serviceName != null) {
    await prisma.systemSetting.upsert({
      where: { key: "service_name" },
      create: { key: "service_name", value: updates.serviceName },
      update: { value: updates.serviceName },
    });
  }
  if (updates.logo !== undefined) {
    const val = updates.logo ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "logo" },
      create: { key: "logo", value: val },
      update: { value: val },
    });
  }
  if (updates.logoBot !== undefined) {
    const val = updates.logoBot ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "logo_bot" },
      create: { key: "logo_bot", value: val },
      update: { value: val },
    });
  }
  if (updates.favicon !== undefined) {
    const val = updates.favicon ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "favicon" },
      create: { key: "favicon", value: val },
      update: { value: val },
    });
  }
  if (updates.remnaClientUrl !== undefined) {
    const val = updates.remnaClientUrl ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "remna_client_url" },
      create: { key: "remna_client_url", value: val },
      update: { value: val },
    });
  }
  if (updates.smtpHost !== undefined) {
    const val = updates.smtpHost ?? "";
    await prisma.systemSetting.upsert({ where: { key: "smtp_host" }, create: { key: "smtp_host", value: val }, update: { value: val } });
  }
  if (updates.smtpPort != null) {
    await prisma.systemSetting.upsert({ where: { key: "smtp_port" }, create: { key: "smtp_port", value: String(updates.smtpPort) }, update: { value: String(updates.smtpPort) } });
  }
  if (updates.smtpSecure !== undefined) {
    await prisma.systemSetting.upsert({ where: { key: "smtp_secure" }, create: { key: "smtp_secure", value: updates.smtpSecure ? "true" : "false" }, update: { value: updates.smtpSecure ? "true" : "false" } });
  }
  if (updates.smtpUser !== undefined) {
    const val = updates.smtpUser ?? "";
    await prisma.systemSetting.upsert({ where: { key: "smtp_user" }, create: { key: "smtp_user", value: val }, update: { value: val } });
  }
  if (updates.smtpPassword !== undefined && updates.smtpPassword !== "") {
    await prisma.systemSetting.upsert({ where: { key: "smtp_password" }, create: { key: "smtp_password", value: updates.smtpPassword! }, update: { value: updates.smtpPassword! } });
  }
  if (updates.smtpFromEmail !== undefined) {
    const val = updates.smtpFromEmail ?? "";
    await prisma.systemSetting.upsert({ where: { key: "smtp_from_email" }, create: { key: "smtp_from_email", value: val }, update: { value: val } });
  }
  if (updates.smtpFromName !== undefined) {
    const val = updates.smtpFromName ?? "";
    await prisma.systemSetting.upsert({ where: { key: "smtp_from_name" }, create: { key: "smtp_from_name", value: val }, update: { value: val } });
  }
  if (updates.publicAppUrl !== undefined) {
    const val = updates.publicAppUrl ?? "";
    await prisma.systemSetting.upsert({ where: { key: "public_app_url" }, create: { key: "public_app_url", value: val }, update: { value: val } });
  }
  if (updates.telegramBotToken !== undefined) {
    const val = updates.telegramBotToken ?? "";
    await prisma.systemSetting.upsert({ where: { key: "telegram_bot_token" }, create: { key: "telegram_bot_token", value: val }, update: { value: val } });
  }
  if (updates.telegramBotUsername !== undefined) {
    const val = updates.telegramBotUsername ?? "";
    await prisma.systemSetting.upsert({ where: { key: "telegram_bot_username" }, create: { key: "telegram_bot_username", value: val }, update: { value: val } });
  }
  if (updates.botAdminTelegramIds !== undefined) {
    const raw = updates.botAdminTelegramIds;
    const val = Array.isArray(raw) ? JSON.stringify(raw) : (raw ?? "");
    await prisma.systemSetting.upsert({ where: { key: "bot_admin_telegram_ids" }, create: { key: "bot_admin_telegram_ids", value: val }, update: { value: val } });
  }
  if (updates.notificationTelegramGroupId !== undefined) {
    const val = (updates.notificationTelegramGroupId ?? "").trim() || "";
    await prisma.systemSetting.upsert({
      where: { key: "notification_telegram_group_id" },
      create: { key: "notification_telegram_group_id", value: val },
      update: { value: val },
    });
  }
  if (updates.plategaMerchantId !== undefined) {
    const val = updates.plategaMerchantId ?? "";
    await prisma.systemSetting.upsert({ where: { key: "platega_merchant_id" }, create: { key: "platega_merchant_id", value: val }, update: { value: val } });
  }
  if (updates.plategaSecret !== undefined) {
    const val = updates.plategaSecret ?? "";
    await prisma.systemSetting.upsert({ where: { key: "platega_secret" }, create: { key: "platega_secret", value: val }, update: { value: val } });
  }
  if (updates.plategaMethods !== undefined) {
    const val = updates.plategaMethods ?? "";
    await prisma.systemSetting.upsert({ where: { key: "platega_methods" }, create: { key: "platega_methods", value: val }, update: { value: val } });
  }
  if (updates.yoomoneyClientId !== undefined) {
    const val = updates.yoomoneyClientId ?? "";
    await prisma.systemSetting.upsert({ where: { key: "yoomoney_client_id" }, create: { key: "yoomoney_client_id", value: val }, update: { value: val } });
  }
  if (updates.yoomoneyClientSecret !== undefined) {
    const val = updates.yoomoneyClientSecret ?? "";
    await prisma.systemSetting.upsert({ where: { key: "yoomoney_client_secret" }, create: { key: "yoomoney_client_secret", value: val }, update: { value: val } });
  }
  if (updates.yoomoneyReceiverWallet !== undefined) {
    const val = updates.yoomoneyReceiverWallet ?? "";
    await prisma.systemSetting.upsert({ where: { key: "yoomoney_receiver_wallet" }, create: { key: "yoomoney_receiver_wallet", value: val }, update: { value: val } });
  }
  if (updates.yoomoneyNotificationSecret !== undefined) {
    const val = updates.yoomoneyNotificationSecret ?? "";
    await prisma.systemSetting.upsert({ where: { key: "yoomoney_notification_secret" }, create: { key: "yoomoney_notification_secret", value: val }, update: { value: val } });
  }
  if (updates.yookassaShopId !== undefined) {
    const val = updates.yookassaShopId ?? "";
    await prisma.systemSetting.upsert({ where: { key: "yookassa_shop_id" }, create: { key: "yookassa_shop_id", value: val }, update: { value: val } });
  }
  if (updates.yookassaSecretKey !== undefined) {
    const val = updates.yookassaSecretKey ?? "";
    await prisma.systemSetting.upsert({ where: { key: "yookassa_secret_key" }, create: { key: "yookassa_secret_key", value: val }, update: { value: val } });
  }
  if (updates.cryptopayApiToken !== undefined) {
    const val = updates.cryptopayApiToken ?? "";
    await prisma.systemSetting.upsert({ where: { key: "cryptopay_api_token" }, create: { key: "cryptopay_api_token", value: val }, update: { value: val } });
  }
  if (updates.cryptopayTestnet !== undefined) {
    const val = updates.cryptopayTestnet ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "cryptopay_testnet" }, create: { key: "cryptopay_testnet", value: val }, update: { value: val } });
  }
  if (updates.heleketMerchantId !== undefined) {
    const val = updates.heleketMerchantId ?? "";
    await prisma.systemSetting.upsert({ where: { key: "heleket_merchant_id" }, create: { key: "heleket_merchant_id", value: val }, update: { value: val } });
  }
  if (updates.heleketApiKey !== undefined) {
    const val = updates.heleketApiKey ?? "";
    await prisma.systemSetting.upsert({ where: { key: "heleket_api_key" }, create: { key: "heleket_api_key", value: val }, update: { value: val } });
  }
  if (updates.groqApiKey !== undefined) {
    const val = updates.groqApiKey ?? "";
    await prisma.systemSetting.upsert({ where: { key: "groq_api_key" }, create: { key: "groq_api_key", value: val }, update: { value: val } });
  }
  if (updates.groqModel !== undefined) {
    const val = updates.groqModel ?? "llama3-8b-8192";
    await prisma.systemSetting.upsert({ where: { key: "groq_model" }, create: { key: "groq_model", value: val }, update: { value: val } });
  }
  if (updates.groqFallback1 !== undefined) {
    const val = updates.groqFallback1 ?? "";
    await prisma.systemSetting.upsert({ where: { key: "groq_fallback_1" }, create: { key: "groq_fallback_1", value: val }, update: { value: val } });
  }
  if (updates.groqFallback2 !== undefined) {
    const val = updates.groqFallback2 ?? "";
    await prisma.systemSetting.upsert({ where: { key: "groq_fallback_2" }, create: { key: "groq_fallback_2", value: val }, update: { value: val } });
  }
  if (updates.groqFallback3 !== undefined) {
    const val = updates.groqFallback3 ?? "";
    await prisma.systemSetting.upsert({ where: { key: "groq_fallback_3" }, create: { key: "groq_fallback_3", value: val }, update: { value: val } });
  }
  if (updates.aiSystemPrompt !== undefined) {
    const val = updates.aiSystemPrompt ?? "";
    await prisma.systemSetting.upsert({ where: { key: "ai_system_prompt" }, create: { key: "ai_system_prompt", value: val }, update: { value: val } });
  }
  if (updates.botButtons !== undefined) {
    const val = updates.botButtons ?? "";
    await prisma.systemSetting.upsert({ where: { key: "bot_buttons" }, create: { key: "bot_buttons", value: val }, update: { value: val } });
  }
  if (updates.botButtonsPerRow !== undefined) {
    const val = updates.botButtonsPerRow === 2 ? "2" : "1";
    await prisma.systemSetting.upsert({ where: { key: "bot_buttons_per_row" }, create: { key: "bot_buttons_per_row", value: val }, update: { value: val } });
  }
  if (updates.botEmojis !== undefined) {
    const raw = updates.botEmojis;
    const val =
      typeof raw === "string"
        ? raw
        : raw !== null && typeof raw === "object" && !Array.isArray(raw)
          ? JSON.stringify(raw)
          : "";
    await prisma.systemSetting.upsert({ where: { key: "bot_emojis" }, create: { key: "bot_emojis", value: val }, update: { value: val } });
  }
  if (updates.botBackLabel !== undefined) {
    const val = updates.botBackLabel ?? "";
    await prisma.systemSetting.upsert({ where: { key: "bot_back_label" }, create: { key: "bot_back_label", value: val }, update: { value: val } });
  }
  if (updates.botMenuTexts !== undefined) {
    const val = updates.botMenuTexts ?? "";
    await prisma.systemSetting.upsert({ where: { key: "bot_menu_texts" }, create: { key: "bot_menu_texts", value: val }, update: { value: val } });
  }
  if (updates.botMenuLineVisibility !== undefined) {
    const raw = updates.botMenuLineVisibility;
    const val =
      typeof raw === "string"
        ? raw
        : raw !== null && typeof raw === "object" && !Array.isArray(raw)
          ? JSON.stringify(raw)
          : "";
    await prisma.systemSetting.upsert({
      where: { key: "bot_menu_line_visibility" },
      create: { key: "bot_menu_line_visibility", value: val },
      update: { value: val },
    });
  }
  if (updates.botInnerButtonStyles !== undefined) {
    const raw = updates.botInnerButtonStyles;
    const val =
      typeof raw === "string"
        ? raw
        : raw !== null && typeof raw === "object" && !Array.isArray(raw)
          ? JSON.stringify(raw)
          : "";
    await prisma.systemSetting.upsert({
      where: { key: "bot_inner_button_styles" },
      create: { key: "bot_inner_button_styles", value: val },
      update: { value: val },
    });
  }
  if (updates.botTariffsText !== undefined) {
    const val = updates.botTariffsText ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "bot_tariffs_text" },
      create: { key: "bot_tariffs_text", value: val },
      update: { value: val },
    });
  }
  if (updates.botTariffsFields !== undefined) {
    const raw = updates.botTariffsFields;
    const val =
      typeof raw === "string"
        ? raw
        : raw !== null && typeof raw === "object" && !Array.isArray(raw)
          ? JSON.stringify(raw)
          : "";
    await prisma.systemSetting.upsert({
      where: { key: "bot_tariffs_fields" },
      create: { key: "bot_tariffs_fields", value: val },
      update: { value: val },
    });
  }
  if (updates.botPaymentText !== undefined) {
    const val = updates.botPaymentText ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "bot_payment_text" },
      create: { key: "bot_payment_text", value: val },
      update: { value: val },
    });
  }
  if (updates.subscriptionPageConfig !== undefined) {
    const val = updates.subscriptionPageConfig ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "subscription_page_config" },
      create: { key: "subscription_page_config", value: val },
      update: { value: val },
    });
  }
  if (updates.allowUserThemeChange !== undefined) {
    const val = updates.allowUserThemeChange ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "allow_user_theme_change" }, create: { key: "allow_user_theme_change", value: val }, update: { value: val } });
  }
  if (updates.themeAccent !== undefined) {
    await prisma.systemSetting.upsert({
      where: { key: "theme_accent" },
      create: { key: "theme_accent", value: updates.themeAccent },
      update: { value: updates.themeAccent },
    });
  }
  for (const [key, settingKey] of [
    ["supportLink", "support_link"],
    ["agreementLink", "agreement_link"],
    ["offerLink", "offer_link"],
    ["instructionsLink", "instructions_link"],
  ] as const) {
    if (updates[key] !== undefined) {
      const val = updates[key] ?? "";
      await prisma.systemSetting.upsert({
        where: { key: settingKey },
        create: { key: settingKey, value: String(val).trim() },
        update: { value: String(val).trim() },
      });
    }
  }
  if (updates.ticketsEnabled !== undefined) {
    const val = updates.ticketsEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "tickets_enabled" }, create: { key: "tickets_enabled", value: val }, update: { value: val } });
  }
  if (updates.forceSubscribeEnabled !== undefined) {
    const val = updates.forceSubscribeEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "force_subscribe_enabled" }, create: { key: "force_subscribe_enabled", value: val }, update: { value: val } });
  }
  if (updates.forceSubscribeChannelId !== undefined) {
    const val = (updates.forceSubscribeChannelId ?? "").trim();
    await prisma.systemSetting.upsert({ where: { key: "force_subscribe_channel_id" }, create: { key: "force_subscribe_channel_id", value: val }, update: { value: val } });
  }
  if (updates.forceSubscribeMessage !== undefined) {
    const val = (updates.forceSubscribeMessage ?? "").trim();
    await prisma.systemSetting.upsert({ where: { key: "force_subscribe_message" }, create: { key: "force_subscribe_message", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsEnabled !== undefined) {
    const val = updates.sellOptionsEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "sell_options_enabled" }, create: { key: "sell_options_enabled", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsTrafficEnabled !== undefined) {
    const val = updates.sellOptionsTrafficEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "sell_options_traffic_enabled" }, create: { key: "sell_options_traffic_enabled", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsTrafficProducts !== undefined) {
    const val = typeof updates.sellOptionsTrafficProducts === "string" ? updates.sellOptionsTrafficProducts : (updates.sellOptionsTrafficProducts == null ? "" : JSON.stringify(updates.sellOptionsTrafficProducts));
    await prisma.systemSetting.upsert({ where: { key: "sell_options_traffic_products" }, create: { key: "sell_options_traffic_products", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsDevicesEnabled !== undefined) {
    const val = updates.sellOptionsDevicesEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "sell_options_devices_enabled" }, create: { key: "sell_options_devices_enabled", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsDevicesProducts !== undefined) {
    const val = typeof updates.sellOptionsDevicesProducts === "string" ? updates.sellOptionsDevicesProducts : (updates.sellOptionsDevicesProducts == null ? "" : JSON.stringify(updates.sellOptionsDevicesProducts));
    await prisma.systemSetting.upsert({ where: { key: "sell_options_devices_products" }, create: { key: "sell_options_devices_products", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsServersEnabled !== undefined) {
    const val = updates.sellOptionsServersEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({ where: { key: "sell_options_servers_enabled" }, create: { key: "sell_options_servers_enabled", value: val }, update: { value: val } });
  }
  if (updates.sellOptionsServersProducts !== undefined) {
    const val = typeof updates.sellOptionsServersProducts === "string" ? updates.sellOptionsServersProducts : (updates.sellOptionsServersProducts == null ? "" : JSON.stringify(updates.sellOptionsServersProducts));
    await prisma.systemSetting.upsert({ where: { key: "sell_options_servers_products" }, create: { key: "sell_options_servers_products", value: val }, update: { value: val } });
  }
  if (updates.googleAnalyticsId !== undefined) {
    await prisma.systemSetting.upsert({ where: { key: "google_analytics_id" }, create: { key: "google_analytics_id", value: updates.googleAnalyticsId ?? "" }, update: { value: updates.googleAnalyticsId ?? "" } });
  }
  if (updates.yandexMetrikaId !== undefined) {
    await prisma.systemSetting.upsert({ where: { key: "yandex_metrika_id" }, create: { key: "yandex_metrika_id", value: updates.yandexMetrikaId ?? "" }, update: { value: updates.yandexMetrikaId ?? "" } });
  }
  if (updates.autoBroadcastCron !== undefined) {
    const val = updates.autoBroadcastCron ?? "";
    await prisma.systemSetting.upsert({
      where: { key: "auto_broadcast_cron" },
      create: { key: "auto_broadcast_cron", value: val },
      update: { value: val },
    });
    const { restartAutoBroadcastScheduler } = await import("../auto-broadcast/auto-broadcast-scheduler.js");
    await restartAutoBroadcastScheduler();
  }
  if (updates.adminFrontNotificationsEnabled !== undefined) {
    const val = updates.adminFrontNotificationsEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({
      where: { key: "admin_front_notifications_enabled" },
      create: { key: "admin_front_notifications_enabled", value: val },
      update: { value: val },
    });
  }
  if (updates.skipEmailVerification !== undefined) {
    const val = updates.skipEmailVerification ? "true" : "false";
    await prisma.systemSetting.upsert({
      where: { key: "skip_email_verification" },
      create: { key: "skip_email_verification", value: val },
      update: { value: val },
    });
  }
  if (updates.useRemnaSubscriptionPage !== undefined) {
    const val = updates.useRemnaSubscriptionPage ? "true" : "false";
    await prisma.systemSetting.upsert({
      where: { key: "use_remna_subscription_page" },
      create: { key: "use_remna_subscription_page", value: val },
      update: { value: val },
    });
  }
  if (updates.aiChatEnabled !== undefined) {
    const val = updates.aiChatEnabled ? "true" : "false";
    await prisma.systemSetting.upsert({
      where: { key: "ai_chat_enabled" },
      create: { key: "ai_chat_enabled", value: val },
      update: { value: val },
    });
  }
  const cbKeys: [keyof typeof updates, string][] = [
    ["customBuildEnabled", "custom_build_enabled"],
    ["customBuildPricePerDay", "custom_build_price_per_day"],
    ["customBuildPricePerDevice", "custom_build_price_per_device"],
    ["customBuildTrafficMode", "custom_build_traffic_mode"],
    ["customBuildPricePerGb", "custom_build_price_per_gb"],
    ["customBuildSquadUuid", "custom_build_squad_uuid"],
    ["customBuildCurrency", "custom_build_currency"],
    ["customBuildMaxDays", "custom_build_max_days"],
    ["customBuildMaxDevices", "custom_build_max_devices"],
  ];
  for (const [key, dbKey] of cbKeys) {
    const v = updates[key];
    if (v === undefined) continue;
    const val = typeof v === "boolean" ? (v ? "true" : "false") : (v === null ? "" : String(v));
    await prisma.systemSetting.upsert({
      where: { key: dbKey },
      create: { key: dbKey, value: val },
      update: { value: val },
    });
  }
  const oauthKeys: [keyof typeof updates, string][] = [
    ["googleLoginEnabled", "google_login_enabled"],
    ["googleClientId", "google_client_id"],
    ["googleClientSecret", "google_client_secret"],
    ["appleLoginEnabled", "apple_login_enabled"],
    ["appleClientId", "apple_client_id"],
    ["appleTeamId", "apple_team_id"],
    ["appleKeyId", "apple_key_id"],
    ["applePrivateKey", "apple_private_key"],
  ];
  for (const [key, dbKey] of oauthKeys) {
    const v = updates[key];
    if (v === undefined) continue;
    const val = typeof v === "boolean" ? (v ? "true" : "false") : (v === null ? "" : String(v));
    await prisma.systemSetting.upsert({
      where: { key: dbKey },
      create: { key: dbKey, value: val },
      update: { value: val },
    });
  }
  const landingKeys: [keyof typeof updates, string][] = [
    ["landingEnabled", "landing_enabled"],
    ["landingHeroTitle", "landing_hero_title"],
    ["landingHeroSubtitle", "landing_hero_subtitle"],
    ["landingHeroCtaText", "landing_hero_cta_text"],
    ["landingShowTariffs", "landing_show_tariffs"],
    ["landingContacts", "landing_contacts"],
    ["landingOfferLink", "landing_offer_link"],
    ["landingPrivacyLink", "landing_privacy_link"],
    ["landingFooterText", "landing_footer_text"],
    ["landingHeroBadge", "landing_hero_badge"],
    ["landingHeroHint", "landing_hero_hint"],
    ["landingFeature1Label", "landing_feature_1_label"],
    ["landingFeature1Sub", "landing_feature_1_sub"],
    ["landingFeature2Label", "landing_feature_2_label"],
    ["landingFeature2Sub", "landing_feature_2_sub"],
    ["landingFeature3Label", "landing_feature_3_label"],
    ["landingFeature3Sub", "landing_feature_3_sub"],
    ["landingFeature4Label", "landing_feature_4_label"],
    ["landingFeature4Sub", "landing_feature_4_sub"],
    ["landingFeature5Label", "landing_feature_5_label"],
    ["landingFeature5Sub", "landing_feature_5_sub"],
    ["landingBenefitsTitle", "landing_benefits_title"],
    ["landingBenefitsSubtitle", "landing_benefits_subtitle"],
    ["landingBenefit1Title", "landing_benefit_1_title"],
    ["landingBenefit1Desc", "landing_benefit_1_desc"],
    ["landingBenefit2Title", "landing_benefit_2_title"],
    ["landingBenefit2Desc", "landing_benefit_2_desc"],
    ["landingBenefit3Title", "landing_benefit_3_title"],
    ["landingBenefit3Desc", "landing_benefit_3_desc"],
    ["landingBenefit4Title", "landing_benefit_4_title"],
    ["landingBenefit4Desc", "landing_benefit_4_desc"],
    ["landingBenefit5Title", "landing_benefit_5_title"],
    ["landingBenefit5Desc", "landing_benefit_5_desc"],
    ["landingBenefit6Title", "landing_benefit_6_title"],
    ["landingBenefit6Desc", "landing_benefit_6_desc"],
    ["landingTariffsTitle", "landing_tariffs_title"],
    ["landingTariffsSubtitle", "landing_tariffs_subtitle"],
    ["landingDevicesTitle", "landing_devices_title"],
    ["landingDevicesSubtitle", "landing_devices_subtitle"],
    ["landingFaqTitle", "landing_faq_title"],
    ["landingFaqJson", "landing_faq_json"],
    ["landingHeroHeadline1", "landing_hero_headline_1"],
    ["landingHeroHeadline2", "landing_hero_headline_2"],
    ["landingHeaderBadge", "landing_header_badge"],
    ["landingButtonLogin", "landing_button_login"],
    ["landingButtonLoginCabinet", "landing_button_login_cabinet"],
    ["landingNavBenefits", "landing_nav_benefits"],
    ["landingNavTariffs", "landing_nav_tariffs"],
    ["landingNavDevices", "landing_nav_devices"],
    ["landingNavFaq", "landing_nav_faq"],
    ["landingBenefitsBadge", "landing_benefits_badge"],
    ["landingDefaultPaymentText", "landing_default_payment_text"],
    ["landingButtonChooseTariff", "landing_button_choose_tariff"],
    ["landingNoTariffsMessage", "landing_no_tariffs_message"],
    ["landingButtonWatchTariffs", "landing_button_watch_tariffs"],
    ["landingButtonStart", "landing_button_start"],
    ["landingButtonOpenCabinet", "landing_button_open_cabinet"],
    ["landingJourneyStepsJson", "landing_journey_steps_json"],
    ["landingSignalCardsJson", "landing_signal_cards_json"],
    ["landingTrustPointsJson", "landing_trust_points_json"],
    ["landingExperiencePanelsJson", "landing_experience_panels_json"],
    ["landingDevicesListJson", "landing_devices_list_json"],
    ["landingQuickStartJson", "landing_quick_start_json"],
    ["landingInfraTitle", "landing_infra_title"],
    ["landingNetworkCockpitText", "landing_network_cockpit_text"],
    ["landingPulseTitle", "landing_pulse_title"],
    ["landingComfortTitle", "landing_comfort_title"],
    ["landingComfortBadge", "landing_comfort_badge"],
    ["landingPrinciplesTitle", "landing_principles_title"],
    ["landingTechTitle", "landing_tech_title"],
    ["landingTechDesc", "landing_tech_desc"],
    ["landingCategorySubtitle", "landing_category_subtitle"],
    ["landingTariffDefaultDesc", "landing_tariff_default_desc"],
    ["landingTariffBullet1", "landing_tariff_bullet_1"],
    ["landingTariffBullet2", "landing_tariff_bullet_2"],
    ["landingTariffBullet3", "landing_tariff_bullet_3"],
    ["landingLowestTariffDesc", "landing_lowest_tariff_desc"],
    ["landingDevicesCockpitText", "landing_devices_cockpit_text"],
    ["landingUniversalityTitle", "landing_universality_title"],
    ["landingUniversalityDesc", "landing_universality_desc"],
    ["landingQuickSetupTitle", "landing_quick_setup_title"],
    ["landingQuickSetupDesc", "landing_quick_setup_desc"],
    ["landingPremiumServiceTitle", "landing_premium_service_title"],
    ["landingPremiumServicePara1", "landing_premium_service_para1"],
    ["landingPremiumServicePara2", "landing_premium_service_para2"],
    ["landingHowItWorksTitle", "landing_how_it_works_title"],
    ["landingHowItWorksDesc", "landing_how_it_works_desc"],
    ["landingStatsPlatforms", "landing_stats_platforms"],
    ["landingStatsTariffsLabel", "landing_stats_tariffs_label"],
    ["landingStatsAccessLabel", "landing_stats_access_label"],
    ["landingStatsPaymentMethods", "landing_stats_payment_methods"],
    ["landingReadyToConnectEyebrow", "landing_ready_to_connect_eyebrow"],
    ["landingReadyToConnectTitle", "landing_ready_to_connect_title"],
    ["landingReadyToConnectDesc", "landing_ready_to_connect_desc"],
  ];
  for (const [key, dbKey] of landingKeys) {
    const v = updates[key];
    if (v === undefined) continue;
    const val = typeof v === "boolean" ? (v ? "true" : "false") : (v === null ? "" : String(v));
    await prisma.systemSetting.upsert({
      where: { key: dbKey },
      create: { key: dbKey, value: val },
      update: { value: val },
    });
  }
  const config = await getSystemConfig();
  return res.json(config);
});

/** Сброс всех текстов лендинга на исходные (из кода). Очищает значения в БД — фронт подставит дефолты. */
const LANDING_TEXT_DB_KEYS = [
  "landing_hero_title", "landing_hero_subtitle", "landing_hero_cta_text", "landing_contacts", "landing_offer_link",
  "landing_privacy_link", "landing_footer_text", "landing_hero_badge", "landing_hero_hint",
  "landing_feature_1_label", "landing_feature_1_sub", "landing_feature_2_label", "landing_feature_2_sub",
  "landing_feature_3_label", "landing_feature_3_sub", "landing_feature_4_label", "landing_feature_4_sub",
  "landing_feature_5_label", "landing_feature_5_sub", "landing_benefits_title", "landing_benefits_subtitle",
  "landing_benefit_1_title", "landing_benefit_1_desc", "landing_benefit_2_title", "landing_benefit_2_desc",
  "landing_benefit_3_title", "landing_benefit_3_desc", "landing_benefit_4_title", "landing_benefit_4_desc",
  "landing_benefit_5_title", "landing_benefit_5_desc", "landing_benefit_6_title", "landing_benefit_6_desc",
  "landing_tariffs_title", "landing_tariffs_subtitle", "landing_devices_title", "landing_devices_subtitle",
  "landing_faq_title", "landing_faq_json", "landing_hero_headline_1", "landing_hero_headline_2",
  "landing_header_badge", "landing_button_login", "landing_button_login_cabinet", "landing_nav_benefits",
  "landing_nav_tariffs", "landing_nav_devices", "landing_nav_faq", "landing_benefits_badge",
  "landing_default_payment_text", "landing_button_choose_tariff", "landing_no_tariffs_message",
  "landing_button_watch_tariffs", "landing_button_start", "landing_button_open_cabinet",
  "landing_journey_steps_json", "landing_signal_cards_json", "landing_trust_points_json",
  "landing_experience_panels_json", "landing_devices_list_json", "landing_quick_start_json",
  "landing_infra_title", "landing_network_cockpit_text", "landing_pulse_title", "landing_comfort_title",
  "landing_comfort_badge", "landing_principles_title", "landing_tech_title", "landing_tech_desc",
  "landing_category_subtitle", "landing_tariff_default_desc", "landing_tariff_bullet_1", "landing_tariff_bullet_2",
  "landing_tariff_bullet_3", "landing_lowest_tariff_desc", "landing_devices_cockpit_text",
  "landing_universality_title", "landing_universality_desc", "landing_quick_setup_title", "landing_quick_setup_desc",
  "landing_premium_service_title", "landing_premium_service_para1", "landing_premium_service_para2",
  "landing_how_it_works_title", "landing_how_it_works_desc",   "landing_stats_platforms",
  "landing_stats_tariffs_label", "landing_stats_access_label", "landing_stats_payment_methods",
  "landing_ready_to_connect_eyebrow", "landing_ready_to_connect_title", "landing_ready_to_connect_desc",
];
adminRouter.post("/settings/reset-landing-text", asyncRoute(async (req, res) => {
  for (const dbKey of LANDING_TEXT_DB_KEYS) {
    await prisma.systemSetting.upsert({
      where: { key: dbKey },
      create: { key: dbKey, value: "" },
      update: { value: "" },
    });
  }
  const config = await getSystemConfig();
  return res.json(config);
}));

// ——— Тикеты (админ: список, просмотр, закрытие, ответ)
adminRouter.get("/tickets", asyncRoute(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = status === "open" || status === "closed" ? { status } : {};
  const list = await prisma.ticket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { client: { select: { id: true, email: true, telegramUsername: true } } },
  });
  return res.json({
    items: list.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      client: t.client,
    })),
  });
}));

adminRouter.get("/tickets/:id", asyncRoute(async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { id: true, email: true, telegramUsername: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return res.status(404).json({ message: "Тикет не найден" });
  return res.json({
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    client: ticket.client,
    messages: ticket.messages.map((m) => ({ id: m.id, authorType: m.authorType, content: m.content, createdAt: m.createdAt.toISOString() })),
  });
}));

adminRouter.patch("/tickets/:id", asyncRoute(async (req, res) => {
  const body = z.object({ status: z.enum(["open", "closed"]) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: { status: body.data.status },
    select: { id: true, clientId: true, subject: true, status: true },
  });
  notifyAdminsAboutTicketStatusChange({
    ticketId: ticket.id,
    clientId: ticket.clientId,
    subject: ticket.subject,
    status: ticket.status,
  }).catch(() => {});
  return res.json({ id: ticket.id, status: ticket.status });
}));

const adminTicketMessageSchema = z.object({ content: z.string().min(1).max(10000) });
adminRouter.post("/tickets/:id/messages", asyncRoute(async (req, res) => {
  const body = adminTicketMessageSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) return res.status(404).json({ message: "Тикет не найден" });
  const msg = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorType: "support", content: body.data.content.trim() },
  });
  await prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
  notifyAdminsAboutSupportReply({
    ticketId: ticket.id,
    clientId: ticket.clientId,
    content: body.data.content.trim(),
  }).catch(() => {});
  return res.status(201).json({ id: msg.id, authorType: msg.authorType, content: msg.content, createdAt: msg.createdAt.toISOString() });
}));

// Синхронизация с Remna
adminRouter.post("/sync/from-remna", async (_req, res) => {
  try {
    const result = await syncFromRemna();
    return res.json(result);
  } catch (e) {
    console.error("Sync from Remna error:", e);
    return res.status(500).json({
      ok: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    });
  }
});

adminRouter.post("/sync/to-remna", async (_req, res) => {
  try {
    const result = await syncToRemna();
    return res.json(result);
  } catch (e) {
    console.error("Sync to Remna error:", e);
    return res.status(500).json({
      ok: false,
      updated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    });
  }
});

/** Создать в Remna пользователей для клиентов без remnawaveUuid (привязка «отстающих»). */
adminRouter.post("/sync/create-remna-for-missing", async (_req, res) => {
  try {
    const result = await createRemnaUsersForClientsWithoutUuid();
    return res.json(result);
  } catch (e) {
    console.error("Create Remna for missing error:", e);
    return res.status(500).json({
      ok: false,
      created: 0,
      linked: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    });
  }
});

// ——————————————— Рассылка ———————————————

const broadcastSchema = z.object({
  channel: z.enum(["telegram", "email", "both"]),
  subject: z.string().max(500).optional(),
  message: z.string().min(1, "Текст сообщения обязателен").max(4096),
});

const broadcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

adminRouter.get("/broadcast/recipients-count", asyncRoute(async (_req, res) => {
  const counts = await getBroadcastRecipientsCount();
  return res.json(counts);
}));

adminRouter.post(
  "/broadcast",
  broadcastUpload.single("attachment"),
  asyncRoute(async (req, res) => {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { channel, subject, message } = parsed.data;
    const attachment =
      req.file && req.file.buffer
        ? { buffer: req.file.buffer, mimetype: req.file.mimetype || "application/octet-stream", originalname: req.file.originalname || "file" }
        : undefined;
    const result = await runBroadcast({
      channel,
      subject: subject ?? "",
      message,
      attachment,
    });
    return res.json(result);
  })
);

// ——————————————— Авто-рассылка ———————————————

const autoBroadcastRuleSchema = z.object({
  name: z.string().min(1).max(200),
  triggerType: z.enum([
    "after_registration",
    "inactivity",
    "no_payment",
    "trial_not_connected",
    "trial_used_never_paid",
    "no_traffic",
    "subscription_expired",
    "subscription_ending_soon",
  ]),
  delayDays: z.union([z.number(), z.string()]).transform((v) => (typeof v === "string" ? parseInt(v, 10) : v)).pipe(z.number().int().min(0).max(365)),
  channel: z.enum(["telegram", "email", "both"]),
  subject: z.string().max(500).nullish(),
  message: z.string().min(1).max(4096),
  enabled: z.boolean().optional(),
});

adminRouter.get("/auto-broadcast/rules", asyncRoute(async (_req, res) => {
  const rules = await prisma.autoBroadcastRule.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { logs: true } } },
  });
  return res.json(
    rules.map((r) => ({
      id: r.id,
      name: r.name,
      triggerType: r.triggerType,
      delayDays: r.delayDays,
      channel: r.channel,
      subject: r.subject,
      message: r.message,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sentCount: r._count.logs,
    }))
  );
}));

adminRouter.get("/auto-broadcast/rules/:id/eligible-count", asyncRoute(async (req, res) => {
  const ruleId = req.params.id;
  const ids = await getEligibleClientIds(ruleId);
  return res.json({ count: ids.length });
}));

adminRouter.post("/auto-broadcast/rules", asyncRoute(async (req, res) => {
  const parsed = autoBroadcastRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
  const data = parsed.data;
  const rule = await prisma.autoBroadcastRule.create({
    data: {
      name: data.name,
      triggerType: data.triggerType,
      delayDays: data.delayDays,
      channel: data.channel,
      subject: data.subject ?? null,
      message: data.message,
      enabled: data.enabled ?? true,
    },
  });
  return res.status(201).json({
    id: rule.id,
    name: rule.name,
    triggerType: rule.triggerType,
    delayDays: rule.delayDays,
    channel: rule.channel,
    subject: rule.subject,
    message: rule.message,
    enabled: rule.enabled,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  });
}));

adminRouter.patch("/auto-broadcast/rules/:id", asyncRoute(async (req, res) => {
  const id = req.params.id;
  const parsed = autoBroadcastRuleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
  const rule = await prisma.autoBroadcastRule.update({
    where: { id },
    data: parsed.data as Record<string, unknown>,
  });
  return res.json({
    id: rule.id,
    name: rule.name,
    triggerType: rule.triggerType,
    delayDays: rule.delayDays,
    channel: rule.channel,
    subject: rule.subject,
    message: rule.message,
    enabled: rule.enabled,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  });
}));

adminRouter.delete("/auto-broadcast/rules/:id", asyncRoute(async (req, res) => {
  await prisma.autoBroadcastRule.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}));

adminRouter.post("/auto-broadcast/run", asyncRoute(async (_req, res) => {
  const results = await runAllRules();
  return res.json({ results });
}));

adminRouter.post("/auto-broadcast/run/:ruleId", asyncRoute(async (req, res) => {
  const result = await runRule(req.params.ruleId);
  return res.json(result);
}));

// ——————————————— Промо-группы ———————————————

function generatePromoCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Список промо-групп + статистика активаций */
adminRouter.get("/promo-groups", async (_req, res) => {
  const groups = await prisma.promoGroup.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { activations: true } },
    },
  });
  return res.json(groups.map((g) => ({
    ...g,
    trafficLimitBytes: g.trafficLimitBytes.toString(),
    activationsCount: g._count.activations,
  })));
});

/** Одна промо-группа + список активаций */
adminRouter.get("/promo-groups/:id", async (req, res) => {
  const group = await prisma.promoGroup.findUnique({
    where: { id: req.params.id },
    include: {
      activations: {
        include: {
          client: {
            select: { id: true, email: true, telegramId: true, telegramUsername: true, createdAt: true, remnawaveUuid: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { activations: true } },
    },
  });
  if (!group) return res.status(404).json({ message: "Not found" });
  return res.json({
    ...group,
    trafficLimitBytes: group.trafficLimitBytes.toString(),
    activationsCount: group._count.activations,
  });
});

const createPromoGroupSchema = z.object({
  name: z.string().min(1).max(200),
  squadUuid: z.string().min(1),
  trafficLimitBytes: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  deviceLimit: z.number().int().min(0).nullable().optional(),
  durationDays: z.number().int().min(1),
  maxActivations: z.number().int().min(0).default(0),
  isActive: z.boolean().optional(),
});

/** Создать промо-группу */
adminRouter.post("/promo-groups", async (req, res) => {
  const parsed = createPromoGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
  const data = parsed.data;

  // Генерируем уникальный код
  let code: string;
  let exists = true;
  do {
    code = generatePromoCode();
    const existing = await prisma.promoGroup.findUnique({ where: { code } });
    exists = !!existing;
  } while (exists);

  const group = await prisma.promoGroup.create({
    data: {
      name: data.name,
      code,
      squadUuid: data.squadUuid,
      trafficLimitBytes: data.trafficLimitBytes,
      deviceLimit: data.deviceLimit ?? null,
      durationDays: data.durationDays,
      maxActivations: data.maxActivations,
      isActive: data.isActive ?? true,
    },
  });
  return res.json({ ...group, trafficLimitBytes: group.trafficLimitBytes.toString() });
});

const updatePromoGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  squadUuid: z.string().min(1).optional(),
  trafficLimitBytes: z.union([z.string(), z.number()]).transform((v) => BigInt(v)).optional(),
  deviceLimit: z.number().int().min(0).nullable().optional(),
  durationDays: z.number().int().min(1).optional(),
  maxActivations: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/** Обновить промо-группу */
adminRouter.patch("/promo-groups/:id", async (req, res) => {
  const parsed = updatePromoGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

  const existing = await prisma.promoGroup.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Not found" });

  const group = await prisma.promoGroup.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  return res.json({ ...group, trafficLimitBytes: group.trafficLimitBytes.toString() });
});

/** Удалить промо-группу */
adminRouter.delete("/promo-groups/:id", async (req, res) => {
  const existing = await prisma.promoGroup.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Not found" });
  await prisma.promoGroup.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

// ——————————————— Промокоды (скидки / бесплатные дни) ———————————————

/** Список промокодов */
adminRouter.get("/promo-codes", async (_req, res) => {
  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { usages: true } } },
  });
  return res.json(codes.map((c) => ({
    ...c,
    trafficLimitBytes: c.trafficLimitBytes?.toString() ?? null,
    usagesCount: c._count.usages,
  })));
});

/** Один промокод + использования */
adminRouter.get("/promo-codes/:id", async (req, res) => {
  const code = await prisma.promoCode.findUnique({
    where: { id: req.params.id },
    include: {
      usages: {
        include: {
          client: {
            select: { id: true, email: true, telegramId: true, telegramUsername: true, createdAt: true, remnawaveUuid: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { usages: true } },
    },
  });
  if (!code) return res.status(404).json({ message: "Not found" });
  return res.json({
    ...code,
    trafficLimitBytes: code.trafficLimitBytes?.toString() ?? null,
    usagesCount: code._count.usages,
  });
});

const createPromoCodeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.enum(["DISCOUNT", "FREE_DAYS"]),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  discountFixed: z.number().min(0).nullable().optional(),
  squadUuid: z.string().nullable().optional(),
  trafficLimitBytes: z.union([z.string(), z.number()]).transform((v) => (v != null ? BigInt(v) : null)).nullable().optional(),
  deviceLimit: z.number().int().min(0).nullable().optional(),
  durationDays: z.number().int().min(1).nullable().optional(),
  maxUses: z.number().int().min(0).default(0),
  maxUsesPerClient: z.number().int().min(1).default(1),
  isActive: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

/** Создать промокод */
adminRouter.post("/promo-codes", async (req, res) => {
  const parsed = createPromoCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
  const d = parsed.data;

  // Проверяем уникальность кода
  const exists = await prisma.promoCode.findUnique({ where: { code: d.code } });
  if (exists) return res.status(400).json({ message: "Промокод с таким кодом уже существует" });

  const code = await prisma.promoCode.create({
    data: {
      code: d.code,
      name: d.name,
      type: d.type,
      discountPercent: d.type === "DISCOUNT" ? (d.discountPercent ?? null) : null,
      discountFixed: d.type === "DISCOUNT" ? (d.discountFixed ?? null) : null,
      squadUuid: d.type === "FREE_DAYS" ? (d.squadUuid ?? null) : null,
      trafficLimitBytes: d.type === "FREE_DAYS" ? (d.trafficLimitBytes ?? BigInt(0)) : null,
      deviceLimit: d.type === "FREE_DAYS" ? (d.deviceLimit ?? null) : null,
      durationDays: d.type === "FREE_DAYS" ? (d.durationDays ?? null) : null,
      maxUses: d.maxUses,
      maxUsesPerClient: d.maxUsesPerClient,
      isActive: d.isActive ?? true,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    },
  });
  return res.json({ ...code, trafficLimitBytes: code.trafficLimitBytes?.toString() ?? null });
});

const updatePromoCodeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["DISCOUNT", "FREE_DAYS"]).optional(),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  discountFixed: z.number().min(0).nullable().optional(),
  squadUuid: z.string().nullable().optional(),
  trafficLimitBytes: z.union([z.string(), z.number()]).transform((v) => (v != null ? BigInt(v) : null)).nullable().optional(),
  deviceLimit: z.number().int().min(0).nullable().optional(),
  durationDays: z.number().int().min(1).nullable().optional(),
  maxUses: z.number().int().min(0).optional(),
  maxUsesPerClient: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

/** Обновить промокод */
adminRouter.patch("/promo-codes/:id", async (req, res) => {
  const parsed = updatePromoCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

  const existing = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Not found" });

  const data: Record<string, unknown> = { ...parsed.data };
  if (data.expiresAt !== undefined) {
    data.expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : null;
  }

  const code = await prisma.promoCode.update({
    where: { id: req.params.id },
    data,
  });
  return res.json({ ...code, trafficLimitBytes: code.trafficLimitBytes?.toString() ?? null });
});

/** Удалить промокод */
adminRouter.delete("/promo-codes/:id", async (req, res) => {
  const existing = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Not found" });
  await prisma.promoCode.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  АНАЛИТИКА (полная)
// ═══════════════════════════════════════════════════════════════

/** helper: заполняет дневной ряд нулями */
function fillDaySeries(map: Record<string, number>, from: Date, to: Date): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  const d = new Date(from);
  while (d <= to) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: map[key] ?? 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

adminRouter.get("/analytics", async (_req, res) => {
  const now = new Date();
  const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const day90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // ─── Все оплаченные платежи за 90 дней ───
  const payments90 = await prisma.payment.findMany({
    where: { status: "PAID", paidAt: { gte: day90Ago } },
    select: { amount: true, paidAt: true, provider: true, tariffId: true, clientId: true },
    orderBy: { paidAt: "asc" },
  });

  const revenueByDay: Record<string, number> = {};
  const revenueByProvider: Record<string, number> = {};
  const tariffSalesCount: Record<string, number> = {};
  const tariffRevenue: Record<string, number> = {};
  const uniqueBuyers = new Set<string>();
  let rev7 = 0, rev30 = 0, cnt7 = 0, cnt30 = 0;

  const isExternal = (provider: string | null) => provider !== "balance";
  for (const p of payments90) {
    const day = p.paidAt ? p.paidAt.toISOString().slice(0, 10) : "unknown";
    const prov = p.provider ?? "unknown";
    if (isExternal(p.provider)) {
      revenueByDay[day] = (revenueByDay[day] ?? 0) + p.amount;
      uniqueBuyers.add(p.clientId);
      if (p.paidAt && p.paidAt >= day7Ago) { rev7 += p.amount; cnt7++; }
      if (p.paidAt && p.paidAt >= day30Ago) { rev30 += p.amount; cnt30++; }
      if (p.tariffId) tariffRevenue[p.tariffId] = (tariffRevenue[p.tariffId] ?? 0) + p.amount;
    }
    revenueByProvider[prov] = (revenueByProvider[prov] ?? 0) + p.amount;
    if (p.tariffId) tariffSalesCount[p.tariffId] = (tariffSalesCount[p.tariffId] ?? 0) + 1;
  }

  const revenueSeries = fillDaySeries(revenueByDay, day90Ago, now);

  // ─── Клиенты за 90 дней (включая UTM для аналитики по кампаниям) ───
  const allClients = await prisma.client.findMany({
    select: {
      id: true, createdAt: true, telegramId: true, email: true,
      trialUsed: true, remnawaveUuid: true, referrerId: true, balance: true,
      utmSource: true, utmCampaign: true,
    },
  });

  const clientsByDay: Record<string, number> = {};
  let botClients = 0, siteClients = 0, bothClients = 0;
  let trialUsedCount = 0;
  let withReferrer = 0;
  const totalBalance = allClients.reduce((s, c) => s + c.balance, 0);

  for (const c of allClients) {
    if (c.createdAt >= day90Ago) {
      const day = c.createdAt.toISOString().slice(0, 10);
      clientsByDay[day] = (clientsByDay[day] ?? 0) + 1;
    }
    const hasBot = !!c.telegramId;
    const hasSite = !!c.email;
    if (hasBot && hasSite) bothClients++;
    else if (hasBot) botClients++;
    else if (hasSite) siteClients++;
    if (c.trialUsed) trialUsedCount++;
    if (c.referrerId) withReferrer++;
  }

  const clientsSeries = fillDaySeries(clientsByDay, day90Ago, now);

  // ─── Аналитика по источникам трафика (UTM) ───
  const bySourceKey: Record<string, { registrations: number; trials: number; payments: number; revenue: number }> = {};
  function keyFor(source: string | null, campaign: string | null) {
    const s = source?.trim() || "(без метки)";
    const c = campaign?.trim() || "";
    return `${s}\t${c}`;
  }
  for (const c of allClients) {
    const k = keyFor(c.utmSource, c.utmCampaign);
    if (!bySourceKey[k]) bySourceKey[k] = { registrations: 0, trials: 0, payments: 0, revenue: 0 };
    bySourceKey[k].registrations++;
    if (c.trialUsed) bySourceKey[k].trials++;
  }
  const clientIdToUtm = new Map(allClients.map((c) => [c.id, { source: c.utmSource, campaign: c.utmCampaign }]));
  for (const p of payments90) {
    const utm = clientIdToUtm.get(p.clientId);
    const k = keyFor(utm?.source ?? null, utm?.campaign ?? null);
    if (!bySourceKey[k]) bySourceKey[k] = { registrations: 0, trials: 0, payments: 0, revenue: 0 };
    if (isExternal(p.provider)) {
      bySourceKey[k].payments++;
      bySourceKey[k].revenue += p.amount;
    }
  }
  const campaignsStats = Object.entries(bySourceKey).map(([key, v]) => {
    const [source, campaign] = key.split("\t");
    return { source, campaign: campaign || null, ...v };
  }).sort((a, b) => b.revenue - a.revenue);

  // ─── Триалы по дням (клиенты с trialUsed, приближаем по createdAt) ───
  // Точной даты триала нет, но можем показать клиентов использовавших триал
  // Вместо этого считаем из promo activations и trial по дням
  const trialClients = allClients.filter((c) => c.trialUsed && c.createdAt >= day90Ago);
  const trialsByDay: Record<string, number> = {};
  for (const c of trialClients) {
    const day = c.createdAt.toISOString().slice(0, 10);
    trialsByDay[day] = (trialsByDay[day] ?? 0) + 1;
  }
  const trialsSeries = fillDaySeries(trialsByDay, day90Ago, now);

  // ─── Конверсия: триал → покупка ───
  const trialClientIds = new Set(allClients.filter((c) => c.trialUsed).map((c) => c.id));
  const trialToPaid = [...trialClientIds].filter((id) => uniqueBuyers.has(id)).length;
  const trialConversionRate = trialClientIds.size > 0 ? Math.round((trialToPaid / trialClientIds.size) * 100) : 0;

  // ─── Топ тарифов (продажи + доход) ───
  const tariffIds = Object.keys(tariffSalesCount);
  const tariffRows = tariffIds.length > 0
    ? await prisma.tariff.findMany({ where: { id: { in: tariffIds } }, select: { id: true, name: true } })
    : [];
  const tariffMap = Object.fromEntries(tariffRows.map((t) => [t.id, t.name]));
  const topTariffs = Object.entries(tariffSalesCount)
    .map(([id, count]) => ({ name: tariffMap[id] ?? id, count, revenue: tariffRevenue[id] ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ─── Доход по провайдерам ───
  const providerSeries = Object.entries(revenueByProvider).map(([provider, amount]) => ({
    provider: provider === "balance" ? "Баланс" : provider === "platega" ? "Platega" : provider === "cryptopay" ? "Crypto Pay" : provider === "heleket" ? "Heleket" : provider,
    amount,
  }));

  // ─── Топ рефералов ───
  const referralCredits = await prisma.referralCredit.findMany({
    select: { referrerId: true, amount: true, level: true },
  });
  const refEarnings: Record<string, { total: number; l1: number; l2: number; l3: number; count: number }> = {};
  for (const rc of referralCredits) {
    if (!refEarnings[rc.referrerId]) refEarnings[rc.referrerId] = { total: 0, l1: 0, l2: 0, l3: 0, count: 0 };
    const e = refEarnings[rc.referrerId];
    e.total += rc.amount;
    e.count++;
    if (rc.level === 1) e.l1 += rc.amount;
    else if (rc.level === 2) e.l2 += rc.amount;
    else if (rc.level === 3) e.l3 += rc.amount;
  }

  // Количество рефералов у каждого реферера
  const referralCounts: Record<string, number> = {};
  for (const c of allClients) {
    if (c.referrerId) {
      referralCounts[c.referrerId] = (referralCounts[c.referrerId] ?? 0) + 1;
    }
  }

  const topReferrerIds = Object.entries(refEarnings)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .map(([id]) => id);

  const topReferrerClients = topReferrerIds.length > 0
    ? await prisma.client.findMany({
        where: { id: { in: topReferrerIds } },
        select: { id: true, email: true, telegramUsername: true, telegramId: true },
      })
    : [];
  const refClientMap = Object.fromEntries(topReferrerClients.map((c) => [c.id, c]));
  const topReferrers = topReferrerIds.map((id) => {
    const c = refClientMap[id];
    const e = refEarnings[id];
    return {
      id,
      name: c?.telegramUsername ? `@${c.telegramUsername}` : c?.email ?? c?.telegramId ?? id,
      referrals: referralCounts[id] ?? 0,
      earnings: e.total,
      l1: e.l1,
      l2: e.l2,
      l3: e.l3,
      credits: e.count,
    };
  });

  // ─── Промо аналитика ───
  const [promoActivationsTotal, promoCodeUsagesTotal] = await Promise.all([
    prisma.promoActivation.count(),
    prisma.promoCodeUsage.count(),
  ]);

  // Промо-ссылки по группам
  const promoGroupStats = await prisma.promoGroup.findMany({
    select: { id: true, name: true, code: true, maxActivations: true, _count: { select: { activations: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Промокоды по коду
  const promoCodeStats = await prisma.promoCode.findMany({
    select: { id: true, code: true, name: true, type: true, maxUses: true, _count: { select: { usages: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Промо активации по дням
  const promoActs90 = await prisma.promoActivation.findMany({
    where: { createdAt: { gte: day90Ago } },
    select: { createdAt: true },
  });
  const promoActsByDay: Record<string, number> = {};
  for (const a of promoActs90) {
    const day = a.createdAt.toISOString().slice(0, 10);
    promoActsByDay[day] = (promoActsByDay[day] ?? 0) + 1;
  }
  const promoActsSeries = fillDaySeries(promoActsByDay, day90Ago, now);

  // Промокоды использований по дням
  const promoUsages90 = await prisma.promoCodeUsage.findMany({
    where: { createdAt: { gte: day90Ago } },
    select: { createdAt: true },
  });
  const promoUsagesByDay: Record<string, number> = {};
  for (const u of promoUsages90) {
    const day = u.createdAt.toISOString().slice(0, 10);
    promoUsagesByDay[day] = (promoUsagesByDay[day] ?? 0) + 1;
  }
  const promoUsagesSeries = fillDaySeries(promoUsagesByDay, day90Ago, now);

  // ─── Реферальные начисления по дням ───
  const refCredits90 = await prisma.referralCredit.findMany({
    where: { createdAt: { gte: day90Ago } },
    select: { createdAt: true, amount: true },
  });
  const refCreditsByDay: Record<string, number> = {};
  for (const rc of refCredits90) {
    const day = rc.createdAt.toISOString().slice(0, 10);
    refCreditsByDay[day] = (refCreditsByDay[day] ?? 0) + rc.amount;
  }
  const refCreditsSeries = fillDaySeries(refCreditsByDay, day90Ago, now);

  // ─── Сводка (доход и кол-во платежей — только внешние поступления, без оплаты с баланса) ───
  const [totalClients, activeClients, totalRevenueAgg, totalPayments, referralCreditsSum,
    clientsNew24h, clientsNew7d, clientsNew30d, paymentsPending] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { remnawaveUuid: { not: null } } }),
    prisma.payment.aggregate({ where: PAID_EXTERNAL_WHERE, _sum: { amount: true } }),
    prisma.payment.count({ where: PAID_EXTERNAL_WHERE }),
    prisma.referralCredit.aggregate({ _sum: { amount: true } }),
    prisma.client.count({ where: { createdAt: { gte: day1Ago } } }),
    prisma.client.count({ where: { createdAt: { gte: day7Ago } } }),
    prisma.client.count({ where: { createdAt: { gte: day30Ago } } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);

  const totalRevenue = totalRevenueAgg._sum.amount ?? 0;
  const avgCheck = totalPayments > 0 ? Math.round((totalRevenue / totalPayments) * 100) / 100 : 0;
  const arpu = totalClients > 0 ? Math.round((totalRevenue / totalClients) * 100) / 100 : 0;
  const payingClients = uniqueBuyers.size;
  const payingPercent = totalClients > 0 ? Math.round((payingClients / totalClients) * 100) : 0;

  return res.json({
    // Графики
    revenueSeries,
    clientsSeries,
    trialsSeries,
    promoActsSeries,
    promoUsagesSeries,
    refCreditsSeries,

    // Таблицы / списки
    topTariffs,
    providerSeries,
    topReferrers,
    campaignsStats,
    promoGroupStats: promoGroupStats.map((g) => ({
      name: g.name,
      code: g.code,
      maxActivations: g.maxActivations,
      activations: g._count.activations,
    })),
    promoCodeStats: promoCodeStats.map((c) => ({
      code: c.code,
      name: c.name,
      type: c.type,
      maxUses: c.maxUses,
      usages: c._count.usages,
    })),

    // Сводка
    summary: {
      totalClients,
      activeClients,
      totalRevenue,
      totalPayments,
      totalReferralPaid: referralCreditsSum._sum.amount ?? 0,
      promoActivations: promoActivationsTotal,
      promoCodeUsages: promoCodeUsagesTotal,
      // Новое
      clientsNew24h,
      clientsNew7d,
      clientsNew30d,
      botClients,
      siteClients,
      bothClients,
      trialUsedCount,
      trialToPaid,
      trialConversionRate,
      avgCheck,
      arpu,
      payingClients,
      payingPercent,
      rev7,
      rev30,
      cnt7,
      cnt30,
      paymentsPending,
      totalBalance: Math.round(totalBalance * 100) / 100,
      withReferrer,
    },
  });
});

// ═══════════════════════════════════════════════════════════════
//  ОТЧЁТЫ ПРОДАЖ
// ═══════════════════════════════════════════════════════════════

adminRouter.get("/sales-report", async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : null;
  const to = typeof req.query.to === "string" ? req.query.to : null;
  const provider = typeof req.query.provider === "string" ? req.query.provider : null;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

  const where: Record<string, unknown> = { status: "PAID" };
  if (from || to) {
    const paidAt: Record<string, Date> = {};
    if (from) paidAt.gte = new Date(from);
    if (to) paidAt.lte = new Date(to + "T23:59:59.999Z");
    where.paidAt = paidAt;
  }
  if (provider) where.provider = provider;

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        client: { select: { id: true, email: true, telegramId: true, telegramUsername: true } },
        tariff: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Суммы
  const agg = await prisma.payment.aggregate({ where, _sum: { amount: true }, _count: true });

  return res.json({
    items: payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      amount: p.amount,
      currency: p.currency,
      provider: p.provider ?? "unknown",
      status: p.status,
      tariffName: p.tariff?.name ?? null,
      clientEmail: p.client?.email ?? null,
      clientTelegramId: p.client?.telegramId ?? null,
      clientTelegramUsername: p.client?.telegramUsername ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      metadata: p.metadata,
    })),
    total,
    page,
    limit,
    totalAmount: agg._sum.amount ?? 0,
    totalCount: agg._count,
  });
});

// ═══════════════════════════════════════════════════════════════
//  МЕНЕДЖЕРЫ (только для роли ADMIN)
// ═══════════════════════════════════════════════════════════════

export const ADMIN_ALLOWED_SECTIONS = [
  "dashboard",
  "remna-nodes",
  "clients",
  "tariffs",
  "promo",
  "promo-codes",
  "analytics",
  "marketing",
  "sales-report",
  "broadcast",
  "auto-broadcast",
  "backup",
  "settings",
] as const;

/** Список админов и менеджеров (только ADMIN). */
adminRouter.get("/admins", asyncRoute(async (req, res) => {
  const ext = req as unknown as { adminRole?: string };
  if (ext.adminRole !== "ADMIN") {
    return res.status(403).json({ message: "Only admin can list managers" });
  }
  const list = await prisma.admin.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      allowedSections: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  const allowedSections = (raw: string | null): string[] => {
    if (!raw?.trim()) return [];
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p.filter((s): s is string => typeof s === "string") : [];
    } catch {
      return [];
    }
  };
  return res.json(
    list.map((a) => ({
      id: a.id,
      email: a.email,
      role: a.role,
      allowedSections: allowedSections(a.allowedSections),
      mustChangePassword: a.mustChangePassword,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}));

const createManagerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Min 8 characters"),
  allowedSections: z.array(z.string()).optional(),
});

/** Создать менеджера (только ADMIN). */
adminRouter.post("/admins", asyncRoute(async (req, res) => {
  const ext = req as unknown as { adminRole?: string };
  if (ext.adminRole !== "ADMIN") {
    return res.status(403).json({ message: "Only admin can create managers" });
  }
  const body = createManagerSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  }
  const existing = await prisma.admin.findUnique({ where: { email: body.data.email } });
  if (existing) {
    return res.status(400).json({ message: "Email already registered" });
  }
  const sections = (body.data.allowedSections ?? []).filter((s) =>
    (ADMIN_ALLOWED_SECTIONS as readonly string[]).includes(s)
  );
  const passwordHash = await hashPassword(body.data.password);
  const admin = await prisma.admin.create({
    data: {
      email: body.data.email,
      passwordHash,
      mustChangePassword: true,
      role: "MANAGER",
      allowedSections: JSON.stringify(sections),
    },
    select: { id: true, email: true, role: true, allowedSections: true, createdAt: true },
  });
  const allowed = admin.allowedSections
    ? (() => {
        try {
          const p = JSON.parse(admin.allowedSections) as unknown;
          return Array.isArray(p) ? p.filter((s): s is string => typeof s === "string") : [];
        } catch {
          return [];
        }
      })()
    : [];
  return res.status(201).json({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    allowedSections: allowed,
    createdAt: admin.createdAt.toISOString(),
  });
}));

const updateManagerSchema = z.object({
  allowedSections: z.array(z.string()).optional(),
  password: z.string().min(8, "Min 8 characters").optional(),
});

/** Обновить менеджера (разделы доступа и/или пароль). Только ADMIN. */
adminRouter.patch("/admins/:id", asyncRoute(async (req, res) => {
  const ext = req as unknown as { adminRole?: string; adminId?: string };
  if (ext.adminRole !== "ADMIN") {
    return res.status(403).json({ message: "Only admin can update managers" });
  }
  const body = updateManagerSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
  }
  const target = await prisma.admin.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ message: "Not found" });
  if (target.role === "ADMIN") {
    return res.status(403).json({ message: "Cannot modify full admin" });
  }
  const updates: { allowedSections?: string; passwordHash?: string } = {};
  if (body.data.allowedSections !== undefined) {
    const sections = body.data.allowedSections.filter((s) =>
      (ADMIN_ALLOWED_SECTIONS as readonly string[]).includes(s)
    );
    updates.allowedSections = JSON.stringify(sections);
  }
  if (body.data.password?.trim()) {
    updates.passwordHash = await hashPassword(body.data.password);
  }
  const updated = await prisma.admin.update({
    where: { id: req.params.id },
    data: updates,
    select: { id: true, email: true, role: true, allowedSections: true },
  });
  const allowed = updated.allowedSections
    ? (() => {
        try {
          const p = JSON.parse(updated.allowedSections) as unknown;
          return Array.isArray(p) ? p.filter((s): s is string => typeof s === "string") : [];
        } catch {
          return [];
        }
      })()
    : [];
  return res.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    allowedSections: allowed,
  });
}));

/** Удалить менеджера. Только ADMIN. Нельзя удалить полного админа. */
adminRouter.delete("/admins/:id", asyncRoute(async (req, res) => {
  const ext = req as unknown as { adminRole?: string; adminId?: string };
  if (ext.adminRole !== "ADMIN") {
    return res.status(403).json({ message: "Only admin can delete managers" });
  }
  if (req.params.id === ext.adminId) {
    return res.status(400).json({ message: "Cannot delete yourself" });
  }
  const target = await prisma.admin.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ message: "Not found" });
  if (target.role === "ADMIN") {
    return res.status(403).json({ message: "Cannot delete full admin" });
  }
  await prisma.admin.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
}));
