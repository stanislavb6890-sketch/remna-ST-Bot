/**
 * Публичный API конкурсов для бота: активный конкурс и текст ежедневной рассылки.
 */

import { Router, Request, Response } from "express";
import { prisma } from "../../db.js";

export const contestPublicRouter = Router();

/** GET /api/public/contests/active — активный конкурс (startAt <= now <= endAt) для рассылки в боте */
contestPublicRouter.get("/contests/active", async (_req: Request, res: Response) => {
  const now = new Date();
  const contest = await prisma.contest.findFirst({
    where: {
      startAt: { lte: now },
      endAt: { gte: now },
      status: "active",
    },
    orderBy: { startAt: "desc" },
    select: {
      id: true,
      name: true,
      startAt: true,
      endAt: true,
      dailyMessage: true,
      prize1Type: true,
      prize1Value: true,
      prize2Type: true,
      prize2Value: true,
      prize3Type: true,
      prize3Value: true,
      conditionsJson: true,
      drawType: true,
    },
  });
  if (!contest) {
    return res.json({ active: false, contest: null });
  }
  return res.json({
    active: true,
    contest: {
      ...contest,
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
    },
  });
});
