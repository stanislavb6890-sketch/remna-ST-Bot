import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, Copy, Key, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { api, type ApiKeyListItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ApiKeysPage() {
  const token = useAuth().state.accessToken!;
  const [items, setItems] = useState<ApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getApiKeys(token);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки ключей");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const createKey = async () => {
    if (!name.trim()) return;
    try {
      setCreating(true);
      const data = await api.createApiKey(token, { name: name.trim(), description: description.trim() || undefined });
      setNewKey(data.rawKey);
      setName("");
      setDescription("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания ключа");
    } finally {
      setCreating(false);
    }
  };

  const copyNewKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">API ключи</h1>
          <p className="text-sm text-muted-foreground">Управление ключами для внешней интеграции</p>
        </div>
        <Link to="/admin/api-docs">
          <Button variant="outline" size="sm"><BookOpen className="h-4 w-4 mr-2" />Документация</Button>
        </Link>
      </div>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Создать ключ</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="Название (например: mobile-app)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Описание (опционально)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button onClick={createKey} disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Создать
          </Button>
        </CardContent>
      </Card>

      {newKey && (
        <Card className="border-emerald-500/30">
          <CardHeader><CardTitle className="text-base">Новый ключ (показывается один раз)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <code className="block rounded border bg-muted/40 px-3 py-2 break-all">{newKey}</code>
            <Button variant="outline" size="sm" onClick={copyNewKey}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {items.map((k) => (
            <Card key={k.id}>
              <CardContent className="pt-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2"><Key className="h-4 w-4" />{k.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {k.prefix}... · {k.isActive ? "active" : "disabled"} · создан {new Date(k.createdAt).toLocaleString("ru-RU")}
                  </div>
                  {k.description && <div className="text-xs text-muted-foreground">{k.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await api.toggleApiKey(token, k.id, !k.isActive);
                      await load();
                    }}
                  >
                    <Power className="h-4 w-4 mr-2" />
                    {k.isActive ? "Отключить" : "Включить"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await api.deleteApiKey(token, k.id);
                      await load();
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!items.length && <div className="text-sm text-muted-foreground">Пока нет ключей</div>}
        </div>
      )}
    </div>
  );
}
