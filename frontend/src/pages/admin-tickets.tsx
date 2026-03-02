import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Loader2, Send, ArrowLeft, Lock, Unlock, CircleDot, CircleCheck } from "lucide-react";

type TicketListItem = {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  client: { id: string; email: string | null; telegramUsername: string | null };
};
type TicketMessage = { id: string; authorType: string; content: string; createdAt: string };

export function AdminTicketsPage() {
  const { state } = useAuth();
  const token = state.accessToken ?? "";

  const [list, setList] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    subject: string;
    status: string;
    client: { id: string; email: string | null; telegramUsername: string | null };
    messages: TicketMessage[];
    createdAt: string;
    updatedAt: string;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  const loadList = () => {
    if (!token) return;
    const status = filter === "open" || filter === "closed" ? filter : undefined;
    api
      .getAdminTickets(token, status)
      .then((r) => {
        setList(r.items);
        setLoading(false);
      })
      .catch(() => {
        setList([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    loadList();
    const intervalId = window.setInterval(loadList, 10000);
    return () => {
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filter]);

  useEffect(() => {
    if (!detailId || !token) {
      setDetail(null);
      return;
    }
    const loadDetail = () => {
      setDetailLoading(true);
      api
        .getAdminTicket(token, detailId)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setDetailLoading(false));
    };
    loadDetail();
    const intervalId = window.setInterval(loadDetail, 10000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [detailId, token]);

  const sendReply = () => {
    if (!token || !detailId || !replyText.trim()) return;
    setReplySending(true);
    api
      .postAdminTicketMessage(token, detailId, { content: replyText.trim() })
      .then((msg) => {
        setDetail((d) => (d ? { ...d, messages: [...d.messages, msg] } : d));
        setReplyText("");
      })
      .finally(() => setReplySending(false));
  };

  const toggleStatus = () => {
    if (!token || !detail) return;
    const next = detail.status === "open" ? "closed" : "open";
    api.patchAdminTicket(token, detail.id, { status: next }).then(() => {
      setDetail((d) => (d ? { ...d, status: next } : d));
      setList((prev) => prev.map((t) => (t.id === detail.id ? { ...t, status: next } : t)));
    });
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return s;
    }
  };

  if (detailId && detail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setDetailId(null); setDetail(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            К списку
          </Button>
          <Button variant="outline" size="sm" onClick={toggleStatus}>
            {detail.status === "open" ? <Lock className="h-4 w-4 mr-1" /> : <Unlock className="h-4 w-4 mr-1" />}
            {detail.status === "open" ? "Закрыть" : "Открыть"}
          </Button>
        </div>
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 border-b bg-muted/20">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base mr-2">{detail.subject}</CardTitle>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  detail.status === "open"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {detail.status === "open" ? <CircleDot className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
                {detail.status === "open" ? "Открыт" : "Закрыт"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Клиент: {detail.client.email ?? detail.client.telegramUsername ?? detail.client.id} · обновлён {formatDate(detail.updatedAt)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 text-sm ${m.authorType === "support" ? "bg-primary/10 border border-primary/20" : "bg-muted/50"}`}
                >
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                    <span>{m.authorType === "support" ? "Поддержка" : "Клиент"}</span>
                    <span>{formatDate(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>
            {detail.status === "open" && (
              <div className="flex flex-col gap-2 pt-2 border-t">
                <Label htmlFor="admin-reply">Ответ поддержки</Label>
                <Textarea
                  id="admin-reply"
                  placeholder="Введите ответ…"
                  value={replyText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReplyText(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <Button onClick={sendReply} disabled={replySending || !replyText.trim()} size="sm">
                  {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="ml-2">Отправить</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detailId && detailLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>К списку</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold">Тикеты</h2>
        <div className="flex gap-2">
          {(["all", "open", "closed"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Все" : f === "open" ? "Открытые" : "Закрытые"}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Нет тикетов</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <Card
              key={t.id}
              className={`cursor-pointer transition-all hover:shadow-md ${t.status === "open" ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-muted-foreground/30"}`}
              onClick={() => setDetailId(t.id)}
            >
              <CardContent className="py-3 flex flex-row items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.subject}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.status === "open"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.status === "open" ? <CircleDot className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}
                      {t.status === "open" ? "Открыт" : "Закрыт"}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.client.email ?? t.client.telegramUsername ?? t.client.id}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(t.updatedAt)}</span>
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0">→</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
