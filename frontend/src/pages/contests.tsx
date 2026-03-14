import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { api, type ContestListItem, type ContestDetail, type ContestFormPayload, type ContestPrizeType, type ContestDrawType } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Plus, Pencil, Trash2, Loader2, Users, Shuffle, Send, Clock, X } from "lucide-react";

const PRIZE_TYPES: { value: ContestPrizeType; label: string }[] = [
  { value: "custom", label: "Свой текст" },
  { value: "balance", label: "Деньги на баланс" },
  { value: "vpn_days", label: "Дни VPN в подарок" },
];

const DRAW_TYPES: { value: ContestDrawType; label: string }[] = [
  { value: "random", label: "Случайный выбор" },
  { value: "by_days_bought", label: "Кто больше купил дней" },
  { value: "by_payments_count", label: "По количеству оплат" },
  { value: "by_referrals_count", label: "Кто больше привёл рефералов" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активен",
  ended: "Завершён",
  drawn: "Розыгрыш проведён",
};

function toLocalDatetime(d: string): string {
  if (!d) return "";
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function fromFormDatetime(s: string): string {
  if (!s) return new Date().toISOString();
  return new Date(s).toISOString();
}

function parseConditions(json: string | null): { minTariffDays?: number; minPaymentsCount?: number; minReferrals?: number } {
  if (!json?.trim()) return {};
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    return {
      minTariffDays: typeof o.minTariffDays === "number" ? o.minTariffDays : undefined,
      minPaymentsCount: typeof o.minPaymentsCount === "number" ? o.minPaymentsCount : undefined,
      minReferrals: typeof o.minReferrals === "number" ? o.minReferrals : undefined,
    };
  } catch {
    return {};
  }
}

function stringifyConditions(c: { minTariffDays?: number; minPaymentsCount?: number; minReferrals?: number }): string | null {
  if (!c.minTariffDays && !c.minPaymentsCount && !c.minReferrals) return null;
  return JSON.stringify({
    ...(c.minTariffDays != null && c.minTariffDays > 0 ? { minTariffDays: c.minTariffDays } : {}),
    ...(c.minPaymentsCount != null && c.minPaymentsCount > 0 ? { minPaymentsCount: c.minPaymentsCount } : {}),
    ...(c.minReferrals != null && c.minReferrals > 0 ? { minReferrals: c.minReferrals } : {}),
  });
}

const emptyForm: ContestFormPayload = {
  name: "",
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  prize1Type: "custom",
  prize1Value: "",
  prize2Type: "custom",
  prize2Value: "",
  prize3Type: "custom",
  prize3Value: "",
  conditionsJson: null,
  drawType: "random",
  dailyMessage: null,
};

export function ContestsPage() {
  const { state } = useAuth();
  const token = state.accessToken!;

  const [list, setList] = useState<ContestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContestFormPayload>(emptyForm);
  const [minTariffDays, setMinTariffDays] = useState<string>("");
  const [minPaymentsCount, setMinPaymentsCount] = useState<string>("");
  const [minReferrals, setMinReferrals] = useState<string>("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContestDetail | null>(null);
  const [participantsPreview, setParticipantsPreview] = useState<{ total: number; participants: { clientId: string; totalDaysBought: number; paymentsCount: number; referralsCount?: number }[] } | null>(null);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getContests(token);
      setList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (!detailId || !token) return;
    api.getContest(token, detailId).then(setDetail).catch(() => setDetail(null));
  }, [detailId, token]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    setMinTariffDays("");
    setMinPaymentsCount("");
    setMinReferrals("");
    setShowForm(true);
  };

  const openEdit = (c: ContestListItem) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      startAt: c.startAt,
      endAt: c.endAt,
      prize1Type: c.prize1Type as ContestPrizeType,
      prize1Value: c.prize1Value,
      prize2Type: c.prize2Type as ContestPrizeType,
      prize2Value: c.prize2Value,
      prize3Type: c.prize3Type as ContestPrizeType,
      prize3Value: c.prize3Value,
      conditionsJson: c.conditionsJson,
      drawType: c.drawType as ContestDrawType,
      dailyMessage: c.dailyMessage,
    });
    const cond = parseConditions(c.conditionsJson);
    setMinTariffDays(cond.minTariffDays != null ? String(cond.minTariffDays) : "");
    setMinPaymentsCount(cond.minPaymentsCount != null ? String(cond.minPaymentsCount) : "");
    setMinReferrals(cond.minReferrals != null ? String(cond.minReferrals) : "");
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const conditionsJson = stringifyConditions({
        minTariffDays: minTariffDays ? parseInt(minTariffDays, 10) : undefined,
        minPaymentsCount: minPaymentsCount ? parseInt(minPaymentsCount, 10) : undefined,
        minReferrals: minReferrals ? parseInt(minReferrals, 10) : undefined,
      });
      const payload: ContestFormPayload = {
        ...form,
        startAt: fromFormDatetime(form.startAt),
        endAt: fromFormDatetime(form.endAt),
        conditionsJson,
      };
      if (editingId) {
        await api.updateContest(token, editingId, payload);
      } else {
        await api.createContest(token, payload);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const loadParticipantsPreview = async (id: string) => {
    try {
      const data = await api.getContestParticipantsPreview(token, id);
      setParticipantsPreview(data);
      setDetailId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки участников");
    }
  };

  const runDraw = async (id: string) => {
    setDrawingId(id);
    try {
      await api.runContestDraw(token, id);
      await load();
      setDetailId(id);
      const d = await api.getContest(token, id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка розыгрыша");
    } finally {
      setDrawingId(null);
    }
  };

  const handleLaunch = async (id: string) => {
    setLaunchingId(id);
    setError(null);
    try {
      await api.launchContest(token, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запуска");
    } finally {
      setLaunchingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      await api.deleteContest(token, id);
      setDeleteConfirmId(null);
      setDetailId(null);
      setDetail(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setSaving(false);
    }
  };

  const now = new Date();
  const canDraw = (c: ContestListItem) =>
    c.status !== "drawn" && new Date(c.endAt) <= now && c.winners.length === 0;

  function formatTimeLeft(endAt: string): string {
    const end = new Date(endAt).getTime();
    const diff = end - Date.now();
    if (diff <= 0) return "Завершён";
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return `До конца: ${days} дн. ${hours} ч.`;
    if (hours > 0) return `До конца: ${hours} ч.`;
    const min = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    return `До конца: ${min} мин.`;
  }
  function isContestActive(c: ContestListItem): boolean {
    const start = new Date(c.startAt).getTime();
    const end = new Date(c.endAt).getTime();
    return start <= Date.now() && end >= Date.now();
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trophy className="h-7 w-7" />
          Конкурсы
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Создать конкурс
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Редактировать конкурс" : "Новый конкурс"}</DialogTitle>
            <DialogDescription className="sr-only">Форма создания и редактирования конкурса</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Название</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Название конкурса"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Начало</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDatetime(form.startAt)}
                  onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value ? new Date(e.target.value).toISOString() : f.startAt }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Окончание</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDatetime(form.endAt)}
                  onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value ? new Date(e.target.value).toISOString() : f.endAt }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Тип розыгрыша</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                value={form.drawType}
                onChange={(e) => setForm((f) => ({ ...f, drawType: e.target.value as ContestDrawType }))}
              >
                {DRAW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Условия участия (опционально)</Label>
              <div className="flex gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground text-xs">Мин. дней тарифа</Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    placeholder="30"
                    value={minTariffDays}
                    onChange={(e) => setMinTariffDays(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground text-xs">Мин. оплат</Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    placeholder="1"
                    value={minPaymentsCount}
                    onChange={(e) => setMinPaymentsCount(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground text-xs">Мин. рефералов (привёл реферала)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    placeholder="0"
                    value={minReferrals}
                    onChange={(e) => setMinReferrals(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {([1, 2, 3] as const).map((place) => (
              <div key={place} className="grid grid-cols-2 gap-4 items-end">
                <div className="grid gap-2">
                  <Label>Приз {place} место — тип</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    value={form[`prize${place}Type` as keyof ContestFormPayload] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [`prize${place}Type`]: e.target.value as ContestPrizeType }))}
                  >
                    {PRIZE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Значение (текст / сумма ₽ / кол-во дней)</Label>
                  <Input
                    value={form[`prize${place}Value` as keyof ContestFormPayload] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [`prize${place}Value`]: e.target.value }))}
                    placeholder={form[`prize${place}Type` as keyof ContestFormPayload] === "balance" ? "500" : form[`prize${place}Type` as keyof ContestFormPayload] === "vpn_days" ? "30" : "Описание приза"}
                  />
                </div>
              </div>
            ))}
            <div className="grid gap-2">
              <Label>Текст ежедневной рассылки в боте (опционально)</Label>
              <Textarea
                rows={3}
                value={form.dailyMessage ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, dailyMessage: e.target.value || null }))}
                placeholder="Сообщение, которое бот будет отправлять каждый день во время конкурса"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingId ? "Сохранить" : "Создать"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {list.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Нет конкурсов. Создайте первый.
              </CardContent>
            </Card>
          ) : (
            list.map((c) => (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{c.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">{STATUS_LABELS[c.status] ?? c.status}</span>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {new Date(c.startAt).toLocaleString("ru")} — {new Date(c.endAt).toLocaleString("ru")}
                  </p>
                  {isContestActive(c) && (
                    <p className="text-sm font-medium flex items-center gap-1.5 text-primary">
                      <Clock className="h-4 w-4" />
                      {formatTimeLeft(c.endAt)}
                    </p>
                  )}
                  <p className="text-sm">
                    Розыгрыш: {DRAW_TYPES.find((t) => t.value === c.drawType)?.label ?? c.drawType}. Призы: 1 — {c.prize1Value}, 2 — {c.prize2Value}, 3 — {c.prize3Value}.
                  </p>
                  {c.winners.length > 0 && (
                    <div className="text-sm">
                      Победители: {c.winners.map((w) => `#${w.place} ${w.client?.telegramUsername ?? w.client?.email ?? w.client?.id ?? "—"}`).join(", ")}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {c.status === "draft" && (
                      <Button variant="default" size="sm" onClick={() => handleLaunch(c.id)} disabled={launchingId !== null}>
                        {launchingId === c.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                        Запустить
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Изменить
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => loadParticipantsPreview(c.id)}>
                      <Users className="h-4 w-4 mr-1" />
                      Участники
                    </Button>
                    {canDraw(c) && (
                      <Button variant="default" size="sm" onClick={() => runDraw(c.id)} disabled={drawingId !== null}>
                        {drawingId === c.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Shuffle className="h-4 w-4 mr-1" />}
                        Провести розыгрыш
                      </Button>
                    )}
                    {deleteConfirmId === c.id ? (
                      <>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(c.id)} disabled={saving}>
                          Удалить?
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>Отмена</Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {(detailId && (detail || participantsPreview)) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{detail?.name ?? "Участники"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => { setDetailId(null); setDetail(null); setParticipantsPreview(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail && isContestActive(detail) && (
              <p className="text-sm font-medium flex items-center gap-1.5 text-primary">
                <Clock className="h-4 w-4" />
                {formatTimeLeft(detail.endAt)}
              </p>
            )}
            {participantsPreview !== null && (
              <div>
                <p className="text-sm font-medium">Превью участников (по условиям конкурса): {participantsPreview.total} чел.</p>
                {participantsPreview.participants.length > 0 && (
                  <ul className="text-sm text-muted-foreground mt-2 list-disc pl-4">
                    {participantsPreview.participants.slice(0, 20).map((p, i) => (
                      <li key={i}>
                        clientId: {p.clientId}, дней: {p.totalDaysBought}, оплат: {p.paymentsCount}
                        {p.referralsCount != null && `, рефералов: ${p.referralsCount}`}
                      </li>
                    ))}
                    {participantsPreview.total > 20 && <li>… и ещё {participantsPreview.total - 20}</li>}
                  </ul>
                )}
              </div>
            )}
            {detail?.winners && detail.winners.length > 0 && (
              <div>
                <p className="text-sm font-medium">Победители</p>
                <ul className="text-sm mt-2 space-y-1">
                  {detail.winners.map((w) => (
                    <li key={w.place}>
                      {w.place} место: {w.client?.telegramUsername ?? w.client?.email ?? w.client?.id} — {w.prizeType}: {w.prizeValue}
                      {w.appliedAt ? " (начислено)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
