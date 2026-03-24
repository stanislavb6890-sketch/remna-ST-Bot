import { useEffect, useState } from "react";
import {
  ShieldAlert, Loader2, RefreshCw, AlertTriangle, Activity,
  Users, Server, TrendingUp, ChevronDown, ChevronUp, Search,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { api, type TrafficAbuseResponse, type TrafficAbuser } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function severityColor(score: number): string {
  if (score >= 200) return "text-red-500";
  if (score >= 100) return "text-orange-500";
  if (score >= 80) return "text-yellow-500";
  return "text-muted-foreground";
}

function severityBg(score: number): string {
  if (score >= 200) return "bg-red-500";
  if (score >= 100) return "bg-orange-500";
  if (score >= 80) return "bg-yellow-500";
  return "bg-muted-foreground";
}

function severityLabel(score: number): string {
  if (score >= 200) return "Критический";
  if (score >= 100) return "Высокий";
  if (score >= 80) return "Средний";
  return "Низкий";
}

function AbuserRow({ user }: { user: TrafficAbuser }) {
  const [open, setOpen] = useState(false);
  const barWidth = Math.min(user.usagePercent, 100);

  return (
    <div className="border rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
      <button
        type="button"
        className="w-full text-left p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{user.username}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              user.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-500" :
              user.status === "EXPIRED" ? "bg-red-500/10 text-red-500" :
              "bg-muted text-muted-foreground"
            }`}>{user.status}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {user.email && <span>{user.email}</span>}
            {user.telegramId && <span>TG: {user.telegramId}</span>}
            {user.onlineAt && <span>Онлайн: {new Date(user.onlineAt).toLocaleString("ru-RU")}</span>}
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end gap-1 min-w-[140px]">
          <span className="text-sm font-semibold">{formatBytes(user.periodUsageBytes)}</span>
          <span className="text-xs text-muted-foreground">
            лимит: {user.trafficLimitBytes > 0 ? formatBytes(user.trafficLimitBytes) : "∞"}
          </span>
        </div>

        <div className="hidden md:flex flex-col items-center gap-1 min-w-[90px]">
          <span className={`text-lg font-bold ${severityColor(user.abuseScore)}`}>
            {user.abuseScore.toFixed(0)}%
          </span>
          <span className={`text-[10px] font-semibold uppercase ${severityColor(user.abuseScore)}`}>
            {severityLabel(user.abuseScore)}
          </span>
        </div>

        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t px-4 py-3 bg-muted/10 space-y-3">
          <div className="sm:hidden flex items-center justify-between text-sm">
            <span>Период: <strong>{formatBytes(user.periodUsageBytes)}</strong></span>
            <span className={`font-bold ${severityColor(user.abuseScore)}`}>{user.abuseScore.toFixed(0)}% — {severityLabel(user.abuseScore)}</span>
          </div>

          {user.trafficLimitBytes > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Использование лимита</span>
                <span className="font-medium">{user.usagePercent.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${severityBg(user.abuseScore)}`}
                  style={{ width: `${Math.min(barWidth, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Текущий трафик</span>
              <span className="font-medium">{formatBytes(user.usedTrafficBytes)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Всего за всё время</span>
              <span className="font-medium">{formatBytes(user.lifetimeUsedTrafficBytes)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Стратегия</span>
              <span className="font-medium">{user.trafficLimitStrategy}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Истекает</span>
              <span className="font-medium">{user.expireAt ? new Date(user.expireAt).toLocaleDateString("ru-RU") : "—"}</span>
            </div>
          </div>

          {user.perNodeUsage.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-2 block">Трафик по нодам:</span>
              <div className="space-y-1.5">
                {user.perNodeUsage.map((n, i) => {
                  const maxBytes = user.perNodeUsage[0]?.bytes ?? 1;
                  const pct = maxBytes > 0 ? (n.bytes / maxBytes) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-32 truncate text-muted-foreground">{n.nodeName}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right font-medium">{formatBytes(n.bytes)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TrafficAbusePage() {
  const token = useAuth().state.accessToken!;
  const [days, setDays] = useState("7");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TrafficAbuseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTrafficAbuseAnalytics(token, { days: Number(days) || 7 });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки аналитики");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = data?.abusers.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.username.toLowerCase().includes(q) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.telegramId && String(u.telegramId).includes(q));
  }) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-destructive/10 text-destructive rounded-xl">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Анализ трафика</h1>
            <p className="text-sm text-muted-foreground">Поиск пользователей с аномально высоким потреблением</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>Период:</span>
            <Input
              className="w-16 h-8 text-center"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
            />
            <span>дн.</span>
          </div>
          <Button variant="secondary" size="sm" className="shadow-sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Обновить
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Ошибка получения данных</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Анализ данных с нод...</p>
        </div>
      ) : data && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardContent className="pt-5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-500" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Всего пользователей</div>
                  <div className="text-2xl font-bold mt-0.5">{data.stats.totalUsers}</div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Нарушителей</div>
                  <div className="text-2xl font-bold mt-0.5">{data.stats.abusersCount}</div>
                  {data.stats.abuserTrafficPercent > 0 && (
                    <div className="text-xs text-red-500 mt-0.5">{data.stats.abuserTrafficPercent}% трафика</div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10"><TrendingUp className="h-5 w-5 text-orange-500" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Трафик нарушителей</div>
                  <div className="text-2xl font-bold mt-0.5">{formatBytes(data.stats.abuserTrafficTotal)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">из {formatBytes(data.stats.totalTrafficPeriod)}</div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><Server className="h-5 w-5 text-emerald-500" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Активные ноды</div>
                  <div className="text-2xl font-bold mt-0.5">{data.stats.activeNodes}</div>
                  {data.stats.nodesWithData != null && (
                    <div className="text-xs text-muted-foreground mt-0.5">{data.stats.nodesWithData} с данными</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Период: {data.stats.periodStart} — {data.stats.periodEnd} ({data.stats.periodDays} дн.) · Порог: {(data.stats.threshold * 100).toFixed(0)}% · Мин. трафик: {formatBytes(data.stats.minBytes)}
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Список нарушителей
                  {filtered.length > 0 && <span className="text-muted-foreground font-normal ml-2">({filtered.length})</span>}
                </CardTitle>
                {data.abusers.length > 5 && (
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-8 w-48 pl-8 text-sm"
                      placeholder="Поиск..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {filtered.length > 0 ? (
                filtered.map((u) => <AbuserRow key={`${u.uuid}-${u.username}`} user={u} />)
              ) : data.abusers.length > 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Нет совпадений по запросу «{search}»</div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
                  <ShieldAlert className="h-10 w-10 text-emerald-500/50" />
                  <p className="text-sm font-medium">Нарушители не обнаружены</p>
                  <p className="text-xs">Все пользователи в рамках допустимого потребления трафика</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
