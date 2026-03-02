import { useEffect, useState, type ChangeEvent } from "react";
import { MessageSquarePlus, Inbox, Loader2, Send, ArrowLeft, CircleDot, CircleCheck } from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
type TicketItem = { id: string; subject: string; status: string; createdAt: string; updatedAt: string };
type TicketMessage = { id: string; authorType: string; content: string; createdAt: string };

export function ClientTicketsPage() {
  const { state } = useClientAuth();
  const token = state.token ?? null;

  const [list, setList] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    subject: string;
    status: string;
    messages: TicketMessage[];
    createdAt: string;
    updatedAt: string;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [createSending, setCreateSending] = useState(false);

  const loadList = () => {
    if (!token) return;
    setError(null);
    api
      .getTickets(token)
      .then((r) => {
        setList(r.items);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
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
  }, [token]);

  useEffect(() => {
    if (!detailId || !token) {
      setDetail(null);
      return;
    }
    const loadDetail = () => {
      setDetailLoading(true);
      api
        .getTicket(token, detailId)
        .then((t) => setDetail({ ...t, messages: t.messages }))
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
      .replyTicket(token, detailId, { content: replyText.trim() })
      .then((msg) => {
        setDetail((d) => (d ? { ...d, messages: [...d.messages, msg] } : d));
        setReplyText("");
      })
      .finally(() => setReplySending(false));
  };

  const createTicket = () => {
    if (!token || !newSubject.trim() || !newMessage.trim()) return;
    setCreateSending(true);
    api
      .createTicket(token, { subject: newSubject.trim(), message: newMessage.trim() })
      .then((t) => {
        setList((prev) => [{ id: t.id, subject: t.subject, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt }, ...prev]);
        setDetailId(t.id);
        setDetail({ id: t.id, subject: t.subject, status: t.status, messages: t.messages, createdAt: t.createdAt, updatedAt: t.updatedAt });
        setShowNewForm(false);
        setNewSubject("");
        setNewMessage("");
      })
      .finally(() => setCreateSending(false));
  };

  const formatDate = (s: string) => {
    try {
      const d = new Date(s);
      return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return s;
    }
  };

  if (loading && list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if (error && list.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={loadList}>
          Повторить
        </Button>
      </div>
    );
  }

  if (detailId && detail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setDetailId(null); setDetail(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            К списку
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
            <p className="text-xs text-muted-foreground mt-1">Обновлён {formatDate(detail.updatedAt)}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 text-sm ${m.authorType === "support" ? "bg-primary/10 border border-primary/20" : "bg-muted/50"}`}
                >
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                    <span>{m.authorType === "support" ? "Поддержка" : "Вы"}</span>
                    <span>{formatDate(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>
            {detail.status === "open" && (
              <div className="flex flex-col gap-2 pt-2 border-t">
                <Label htmlFor="reply">Ваш ответ</Label>
                <Textarea
                  id="reply"
                  placeholder="Введите сообщение…"
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
        <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
          К списку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold">Тикеты</h2>
        {!showNewForm ? (
          <Button onClick={() => setShowNewForm(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Создать тикет
          </Button>
        ) : null}
      </div>

      {showNewForm ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Новый тикет</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="new-subject">Тема</Label>
              <Input
                id="new-subject"
                placeholder="Кратко опишите вопрос"
                value={newSubject}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewSubject(e.target.value)}
                maxLength={500}
              />
            </div>
            <div>
              <Label htmlFor="new-message">Сообщение</Label>
              <Textarea
                id="new-message"
                placeholder="Опишите проблему или вопрос…"
                value={newMessage}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewMessage(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={createTicket} disabled={createSending || !newSubject.trim() || !newMessage.trim()}>
                {createSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className="ml-2">Создать</span>
              </Button>
              <Button variant="outline" onClick={() => { setShowNewForm(false); setNewSubject(""); setNewMessage(""); }}>
                Отмена
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {list.length === 0 && !showNewForm ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Нет тикетов</p>
            <Button className="mt-3" variant="outline" onClick={() => setShowNewForm(true)}>
              Создать тикет
            </Button>
          </CardContent>
        </Card>
      ) : list.length > 0 ? (
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
                    <span className="text-xs text-muted-foreground">{formatDate(t.updatedAt)}</span>
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0">→</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
