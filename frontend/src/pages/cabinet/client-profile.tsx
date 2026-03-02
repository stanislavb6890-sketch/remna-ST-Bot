import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Wallet, Copy, Check, CreditCard, Loader2, Link2, Mail, Fingerprint, CalendarDays, Shield, KeyRound, Monitor, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useClientAuth } from "@/contexts/client-auth";
import { useCabinetMiniapp } from "@/pages/cabinet/cabinet-layout";
import { openPaymentInBrowser } from "@/lib/open-payment-url";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ClientPayment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("ru-RU");
  } catch {
    return s;
  }
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency.toUpperCase() === "USD" ? "USD" : currency.toUpperCase() === "RUB" ? "RUB" : "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPaymentStatus(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "Оплачен";
  if (s === "pending") return "Не оплачено";
  if (s === "failed") return "Не прошёл";
  if (s === "refunded") return "Возврат";
  return status || "—";
}

export function ClientProfilePage() {
  const { state, refreshProfile } = useClientAuth();
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [copiedRef, setCopiedRef] = useState<"site" | "bot" | null>(null);
  const [plategaMethods, setPlategaMethods] = useState<{ id: number; label: string }[]>([]);
  const [yoomoneyEnabled, setYoomoneyEnabled] = useState(false);
  const [yookassaEnabled, setYookassaEnabled] = useState(false);
  const [cryptopayEnabled, setCryptopayEnabled] = useState(false);
  const [heleketEnabled, setHeleketEnabled] = useState(false);
  const [publicAppUrl, setPublicAppUrl] = useState<string | null>(null);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [linkTelegramCode, setLinkTelegramCode] = useState<string | null>(null);
  const [linkTelegramLoading, setLinkTelegramLoading] = useState(false);
  const [linkEmailValue, setLinkEmailValue] = useState("");
  const [linkEmailLoading, setLinkEmailLoading] = useState(false);
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [linkEmailError, setLinkEmailError] = useState<string | null>(null);
  const [paymentsHistoryOpen, setPaymentsHistoryOpen] = useState(false);
  const [devices, setDevices] = useState<{ hwid: string; platform?: string; deviceModel?: string; createdAt?: string }[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [deletingHwid, setDeletingHwid] = useState<string | null>(null);
  const [twoFaEnableOpen, setTwoFaEnableOpen] = useState(false);
  const [twoFaDisableOpen, setTwoFaDisableOpen] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFaStep, setTwoFaStep] = useState<1 | 2>(1);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);

  const client = state.client;
  const token = state.token;
  const currency = (client?.preferredCurrency ?? "usd").toLowerCase();

  useEffect(() => {
    if (token) {
      refreshProfile().catch(() => { });
    }
  }, [token, refreshProfile]);

  useEffect(() => {
    if (token) {
      api.clientPayments(token).then((r) => setPayments(r.items ?? [])).catch(() => { });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setDevicesLoading(true);
    setDevicesError(null);
    api.getClientDevices(token).then((r) => setDevices(r.devices ?? [])).catch(() => { setDevicesError("Не удалось загрузить устройства"); setDevices([]); }).finally(() => setDevicesLoading(false));
  }, [token]);

  async function deleteDevice(hwid: string) {
    if (!token) return;
    setDeletingHwid(hwid);
    try {
      await api.deleteClientDevice(token, hwid);
      setDevices((prev) => prev.filter((d) => d.hwid !== hwid));
    } catch {
      setDevicesError("Не удалось отключить устройство");
    } finally {
      setDeletingHwid(null);
    }
  }

  async function openTwoFaEnable() {
    if (!token) return;
    setTwoFaError(null);
    setTwoFaSetupData(null);
    setTwoFaStep(1);
    setTwoFaCode("");
    setTwoFaEnableOpen(true);
    setTwoFaLoading(true);
    try {
      const data = await api.client2FASetup(token);
      setTwoFaSetupData(data);
    } catch (e) {
      setTwoFaError(e instanceof Error ? e.message : "Ошибка настройки 2FA");
    } finally {
      setTwoFaLoading(false);
    }
  }
  function closeTwoFaEnable() {
    setTwoFaEnableOpen(false);
    setTwoFaSetupData(null);
    setTwoFaStep(1);
    setTwoFaCode("");
    setTwoFaError(null);
  }
  async function confirmTwoFaEnable() {
    if (!token || !twoFaCode.trim() || twoFaCode.length !== 6) {
      setTwoFaError("Введите 6-значный код из приложения");
      return;
    }
    setTwoFaError(null);
    setTwoFaLoading(true);
    try {
      await api.client2FAConfirm(token, twoFaCode.trim());
      refreshProfile();
      closeTwoFaEnable();
    } catch (e) {
      setTwoFaError(e instanceof Error ? e.message : "Неверный код");
    } finally {
      setTwoFaLoading(false);
    }
  }
  async function openTwoFaDisable() {
    setTwoFaDisableOpen(true);
    setTwoFaCode("");
    setTwoFaError(null);
  }
  async function confirmTwoFaDisable() {
    if (!token || !twoFaCode.trim() || twoFaCode.length !== 6) {
      setTwoFaError("Введите 6-значный код из приложения");
      return;
    }
    setTwoFaError(null);
    setTwoFaLoading(true);
    try {
      await api.client2FADisable(token, twoFaCode.trim());
      refreshProfile();
      setTwoFaDisableOpen(false);
      setTwoFaCode("");
    } catch (e) {
      setTwoFaError(e instanceof Error ? e.message : "Неверный код");
    } finally {
      setTwoFaLoading(false);
    }
  }

  useEffect(() => {
    api.getPublicConfig().then((c) => {
      setPlategaMethods(c.plategaMethods ?? []);
      setYoomoneyEnabled(Boolean(c.yoomoneyEnabled));
      setYookassaEnabled(Boolean(c.yookassaEnabled));
      setCryptopayEnabled(Boolean(c.cryptopayEnabled));
      setHeleketEnabled(Boolean(c.heleketEnabled));
      setPublicAppUrl(c.publicAppUrl ?? null);
      setTelegramBotUsername(c.telegramBotUsername ?? null);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("yoomoney") === "connected" || params.get("yoomoney_form") === "success" || params.get("yookassa") === "success" || params.get("heleket") === "success") {
      refreshProfile().catch(() => { });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refreshProfile]);

  async function startTopUp(methodId: number) {
    if (!token || !client) return;
    const amount = Number(topUpAmount?.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError("Укажите сумму");
      return;
    }
    setTopUpError(null);
    setTopUpLoading(true);
    try {
      const res = await api.clientCreatePlategaPayment(token, {
        amount,
        currency,
        paymentMethod: methodId,
        description: "Пополнение баланса",
      });
      setTopUpModalOpen(false);
      openPaymentInBrowser(res.paymentUrl);
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setTopUpLoading(false);
    }
  }

  async function startTopUpYoomoneyForm(paymentType: "PC" | "AC") {
    if (!token || !client) return;
    const amount = Number(topUpAmount?.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError("Укажите сумму (в рублях)");
      return;
    }
    setTopUpError(null);
    setTopUpLoading(true);
    try {
      const res = await api.yoomoneyCreateFormPayment(token, { amount, paymentType });
      setTopUpModalOpen(false);
      if (res.paymentUrl) {
        openPaymentInBrowser(res.paymentUrl);
      } else if (res.form) {
        const f = res.form;
        const yoomoneyUrl = `https://yoomoney.ru/quickpay/confirm.xml?quickpay-form=shop&receiver=${encodeURIComponent(f.receiver)}&sum=${f.sum}&label=${encodeURIComponent(f.label)}&paymentType=${f.paymentType}&successURL=${encodeURIComponent(f.successURL)}`;
        openPaymentInBrowser(yoomoneyUrl);
      }
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setTopUpLoading(false);
    }
  }

  async function startTopUpYookassa() {
    if (!token || !client) return;
    const amount = Number(topUpAmount?.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError("Укажите сумму (в рублях)");
      return;
    }
    setTopUpError(null);
    setTopUpLoading(true);
    try {
      const res = await api.yookassaCreatePayment(token, { amount, currency: "RUB" });
      setTopUpModalOpen(false);
      if (res.confirmationUrl) openPaymentInBrowser(res.confirmationUrl);
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setTopUpLoading(false);
    }
  }

  async function startTopUpCryptopay() {
    if (!token || !client) return;
    const amount = Number(topUpAmount?.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError("Укажите сумму");
      return;
    }
    setTopUpError(null);
    setTopUpLoading(true);
    try {
      const res = await api.cryptopayCreatePayment(token, { amount, currency });
      setTopUpModalOpen(false);
      if (res.payUrl) openPaymentInBrowser(res.payUrl);
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setTopUpLoading(false);
    }
  }

  async function startTopUpHeleket() {
    if (!token || !client) return;
    const amount = Number(topUpAmount?.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError("Укажите сумму");
      return;
    }
    setTopUpError(null);
    setTopUpLoading(true);
    try {
      const res = await api.heleketCreatePayment(token, { amount, currency });
      setTopUpModalOpen(false);
      if (res.payUrl) openPaymentInBrowser(res.payUrl);
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setTopUpLoading(false);
    }
  }

  async function requestLinkTelegramCode() {
    if (!token) return;
    setLinkTelegramLoading(true);
    setLinkTelegramCode(null);
    try {
      const res = await api.clientLinkTelegramRequest(token);
      setLinkTelegramCode(res.code);
    } catch {
      setLinkTelegramCode(null);
    } finally {
      setLinkTelegramLoading(false);
    }
  }

  async function linkTelegramFromMiniapp() {
    if (!token) return;
    const initData = (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData;
    if (!initData?.trim()) return;
    setLinkTelegramLoading(true);
    try {
      const res = await api.clientLinkTelegram(token, { initData });
      if (res.client) {
        refreshProfile();
        setLinkTelegramCode(null);
      }
    } finally {
      setLinkTelegramLoading(false);
    }
  }

  async function sendLinkEmailRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !linkEmailValue.trim()) return;
    setLinkEmailError(null);
    setLinkEmailSent(false);
    setLinkEmailLoading(true);
    try {
      await api.clientLinkEmailRequest(token, { email: linkEmailValue.trim() });
      setLinkEmailSent(true);
      setLinkEmailValue("");
    } catch (err) {
      setLinkEmailError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setLinkEmailLoading(false);
    }
  }

  const baseUrl = publicAppUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  const referralLinkSite =
    client?.referralCode && baseUrl
      ? `${String(baseUrl).replace(/\/$/, "")}/cabinet/register?ref=${encodeURIComponent(client.referralCode)}`
      : "";
  const referralLinkBot =
    client?.referralCode && telegramBotUsername
      ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}?start=ref_${client.referralCode}`
      : "";
  const hasReferralLinks = Boolean(referralLinkSite || referralLinkBot);
  function copyReferral(which: "site" | "bot") {
    const url = which === "site" ? referralLinkSite : referralLinkBot;
    if (url) {
      navigator.clipboard.writeText(url);
      setCopiedRef(which);
      setTimeout(() => setCopiedRef(null), 2000);
    }
  }

  if (!client) return null;
  const isMiniapp = useCabinetMiniapp();
  const cardClass = isMiniapp ? "min-w-0 overflow-hidden" : "";

  return (
    <div className="space-y-6 w-full min-w-0 pb-10">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Профиль</h1>
        <p className="text-muted-foreground text-sm mt-1 truncate">Личные данные и настройки</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`grid gap-6 ${isMiniapp ? "grid-cols-1" : "lg:grid-cols-2"} min-w-0`}
      >
        <div className={cn("relative flex flex-col rounded-[2rem] shadow-[0_8px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.3)]", cardClass)}>
          <div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/10 dark:border-white/5 bg-background/40 backdrop-blur-2xl">
            <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
          </div>

          <div className="relative p-6 sm:p-8 flex flex-col h-full min-w-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold tracking-tight text-foreground truncate">Данные</h3>
                <p className="text-xs text-muted-foreground mt-[1px] truncate">Контактная информация</p>
              </div>
            </div>

            <div className="space-y-4 flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-primary/10 text-primary">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">ID Аккаунта</p>
                    <p className="font-medium text-sm truncate font-mono select-all">{client.id}</p>
                  </div>
                </div>
              </div>

              {client.email != null && client.email !== "" ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-primary/10 text-primary">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                      <p className="font-medium text-sm truncate">{client.email}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-orange-500/10 text-orange-500">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                      <p className="font-medium text-sm truncate text-orange-500">Не привязан</p>
                    </div>
                  </div>
                  <form onSubmit={sendLinkEmailRequest} className="flex gap-2 mt-2">
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={linkEmailValue}
                      onChange={(e) => setLinkEmailValue(e.target.value)}
                      className="h-9 bg-background/50 border-white/10 text-sm"
                      disabled={linkEmailLoading}
                    />
                    <Button type="submit" size="sm" className="h-9 shrink-0 gap-2 px-4 shadow-sm" disabled={linkEmailLoading || !linkEmailValue.trim()}>
                      {linkEmailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      <span className="hidden sm:inline">Привязать</span>
                    </Button>
                  </form>
                  {linkEmailSent && <p className="text-xs font-medium text-green-500 mt-1">Отправлено, проверьте почту.</p>}
                  {linkEmailError && <p className="text-xs font-medium text-destructive mt-1">{linkEmailError}</p>}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-[#0088cc]/10 text-[#0088cc]">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.888-.667 3.475-1.512 5.79-2.511 6.945-2.993 3.303-1.385 3.99-1.623 4.43-1.63z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Telegram</p>
                    {client.telegramId ? (
                      <p className="font-medium text-sm truncate">
                        {client.telegramUsername ? `@${client.telegramUsername}` : `ID ${client.telegramId}`}
                      </p>
                    ) : (
                      <p className="font-medium text-sm truncate text-orange-500">Не привязан</p>
                    )}
                  </div>
                </div>
                {!client.telegramId && (
                  <div className="shrink-0">
                    {isMiniapp ? (
                      <Button variant="outline" size="sm" onClick={linkTelegramFromMiniapp} disabled={linkTelegramLoading} className="shadow-sm">
                        {linkTelegramLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать текущий"}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={requestLinkTelegramCode} disabled={linkTelegramLoading || !!linkTelegramCode} className="shadow-sm">
                        {linkTelegramLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Получить код"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {!isMiniapp && !client.telegramId && linkTelegramCode && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Код привязки</p>
                    <p className="font-mono text-xl tracking-wider font-bold text-primary">{linkTelegramCode}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/80">
                    Отправьте боту <code className="bg-primary/10 text-primary font-mono px-1.5 py-0.5 rounded">/link {linkTelegramCode}</code><br />Код действует 10 минут.
                  </p>
                </motion.div>
              )}

              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-green-500/10 text-green-500">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Баланс</p>
                    <p className="font-bold text-lg truncate tracking-tight">{formatMoney(client.balance, client.preferredCurrency)}</p>
                  </div>
                </div>
                <Button variant="default" size="sm" className="bg-green-500 hover:bg-green-600 text-white shrink-0 shadow-lg shadow-green-500/20 px-5" onClick={() => {
                  const el = document.getElementById("topup");
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}>
                  Пополнить
                </Button>
              </div>

              {client.createdAt && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                  <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-primary/10 text-primary">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Дата регистрации</p>
                    <p className="text-sm font-medium">{new Date(client.createdAt).toLocaleDateString("ru-RU", { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
              )}

              {hasReferralLinks && (
                <div className="pt-4 border-t border-border/20 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Реферальная программа</h4>
                    <p className="text-xs text-muted-foreground mt-1">Приглашайте друзей — при регистрации вы получите бонус</p>
                  </div>
                  <div className="space-y-2">
                    {referralLinkSite && (
                      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-border/30 dark:bg-white/5 dark:border-white/5">
                        <div className="shrink-0 w-12 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Сайт</div>
                        <code className="flex-1 min-w-[140px] truncate text-xs font-mono text-primary/80 select-all">{referralLinkSite}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg ml-auto" onClick={() => copyReferral("site")}>
                          {copiedRef === "site" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    )}
                    {referralLinkBot && (
                      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-border/30 dark:bg-white/5 dark:border-white/5">
                        <div className="shrink-0 w-12 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Бот</div>
                        <code className="flex-1 min-w-[140px] truncate text-xs font-mono text-primary/80 select-all">{referralLinkBot}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg ml-auto" onClick={() => copyReferral("bot")}>
                          {copiedRef === "bot" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={cn("relative flex flex-col rounded-[2rem] shadow-[0_8px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.3)]", cardClass)}>
          <div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/10 dark:border-white/5 bg-background/40 backdrop-blur-2xl">
            <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
          </div>

          <div className="relative p-6 sm:p-8 flex flex-col h-full min-w-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500 shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold tracking-tight text-foreground truncate">Безопасность</h3>
                <p className="text-xs text-muted-foreground mt-[1px] truncate">Защита вашего аккаунта</p>
              </div>
            </div>

            <div className="flex-1 space-y-4 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/40 border border-border/50 transition-colors hover:bg-muted/60 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-primary/10 text-primary">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Двухфакторная аутентификация</p>
                    <p className="font-medium text-sm truncate">Многоуровневая защита</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {client.totpEnabled ? (
                    <>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-green-500/20 text-green-700 dark:text-green-400 dark:bg-green-500/20">Включена</span>
                      <Button variant="outline" size="sm" className="shadow-sm border-red-500/50 text-red-600 hover:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/20" onClick={openTwoFaDisable}>Отключить</Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="shadow-sm" onClick={openTwoFaEnable}>Включить</Button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-muted/40 border border-border/50 overflow-hidden dark:bg-white/5 dark:border-white/5">
                <div className="p-4 border-b border-border/50 dark:border-white/5">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center shrink-0 rounded-xl bg-primary/10 text-primary">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Сеансы</p>
                      <p className="font-medium text-sm truncate">Управление устройствами</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {devicesLoading ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : devicesError ? (
                    <p className="text-sm text-destructive">{devicesError}</p>
                  ) : devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Привязанных устройств пока нет. Подключитесь к VPN с приложения — устройство появится здесь.</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">Отключите устройство, чтобы освободить слот для другого:</p>
                      <ul className="space-y-2">
                        {devices.map((d) => {
                          const label = [d.platform, d.deviceModel].filter(Boolean).join(" · ") || (d.hwid.slice(0, 12) + (d.hwid.length > 12 ? "…" : ""));
                          const isDeleting = deletingHwid === d.hwid;
                          return (
                            <li key={d.hwid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-background/50 border border-border/50 dark:bg-white/5 dark:border-white/5">
                              <span className="text-sm font-medium truncate" title={d.hwid}>{label}</span>
                              <Button variant="outline" size="sm" className="shrink-0 border-red-500 bg-red-500/15 text-red-600 hover:bg-red-500/25 hover:text-red-700 hover:border-red-500 dark:text-red-400 dark:hover:text-red-300 dark:bg-red-500/20 dark:hover:bg-red-500/30" disabled={isDeleting} onClick={() => deleteDevice(d.hwid)}>
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {isDeleting ? "Отключение…" : "Отключить"}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className={`grid gap-6 ${isMiniapp ? "grid-cols-1" : "lg:grid-cols-2"} min-w-0`}
      >
        {(plategaMethods.length > 0 || yoomoneyEnabled || yookassaEnabled || cryptopayEnabled || heleketEnabled) && (
          <div id="topup" className="relative flex flex-col rounded-[2rem] shadow-[0_8px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
            <div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/10 dark:border-white/5 bg-background/40 backdrop-blur-2xl">
              <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-primary/20 blur-[80px] pointer-events-none" />
            </div>

            <div className="relative p-6 sm:p-8 flex flex-col h-full">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner shrink-0">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-foreground">Пополнить баланс</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Оплата откроется в новой вкладке</p>
                </div>
              </div>

              <div className="space-y-6 mt-auto">
                <div className="relative flex h-32 w-full items-center justify-center rounded-3xl border border-border/50 bg-background/50 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                  <Input
                    type="number"
                    min={1}
                    step={0.01}
                    placeholder="0"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="absolute inset-0 h-full w-full border-0 bg-transparent px-20 text-center text-5xl sm:text-6xl font-extrabold tracking-tighter shadow-none focus-visible:ring-0"
                    style={{ WebkitAppearance: "none", MozAppearance: "textfield" }}
                  />
                  <span className="pointer-events-none absolute right-[12%] top-1/2 -translate-y-1/2 text-2xl sm:text-3xl font-bold text-muted-foreground uppercase opacity-80">
                    {currency}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[100, 300, 500, 1000].map((n) => {
                    const isActive = topUpAmount === String(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTopUpAmount(String(n))}
                        className={cn(
                          "flex items-center justify-center rounded-2xl py-3 text-sm font-bold transition-all duration-300",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105"
                            : "bg-muted/60 text-foreground hover:bg-muted hover:scale-105"
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>

                {topUpError && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center text-sm font-medium text-destructive">
                    {topUpError}
                  </div>
                )}

                <Button
                  className="group relative w-full overflow-hidden rounded-2xl py-7 text-lg font-bold shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-primary/25"
                  onClick={() => {
                    const amount = Number(topUpAmount?.replace(",", "."));
                    if (!Number.isFinite(amount) || amount < 1) {
                      setTopUpError("Минимальная сумма пополнения — 1");
                      return;
                    }
                    setTopUpError(null);
                    setTopUpModalOpen(true);
                  }}
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform duration-300 group-hover:translate-y-0" />
                  <span className="relative flex items-center justify-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Оплатить {topUpAmount ? `${topUpAmount} ${currency.toUpperCase()}` : ""}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="relative flex flex-col rounded-[2rem] shadow-[0_8px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.3)] min-h-[400px]">
          <div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/10 dark:border-white/5 bg-background/40 backdrop-blur-2xl">
            <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
          </div>

          <div className="relative p-6 sm:p-8 flex flex-col h-full min-w-0">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner shrink-0">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold tracking-tight text-foreground truncate">История платежей</h3>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">Последние 3 транзакции</p>
                </div>
              </div>
              {payments.length > 3 && (
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setPaymentsHistoryOpen(true)}>
                  Вся история ({payments.length})
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar min-w-0 -mx-2 px-2">
              {payments.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-70">
                  <Wallet className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Платежей пока нет</p>
                </div>
              ) : (
                <ul className="space-y-3 min-w-0">
                  {payments.slice(0, 3).map((p) => (
                    <li
                      key={p.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 dark:bg-black/10 dark:hover:bg-black/20 p-4 transition-all duration-300"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/50 text-muted-foreground shadow-sm">
                          <Check className={cn("h-4 w-4", p.status?.toLowerCase() === "paid" && "text-green-500")} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate" title={p.orderId}>{p.orderId}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(p.paidAt ?? p.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center shrink-0">
                        <span className="font-bold tracking-tight">{formatMoney(p.amount, p.currency)}</span>
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                          p.status?.toLowerCase() === "paid" ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                        )}>
                          {formatPaymentStatus(p.status)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <Dialog open={paymentsHistoryOpen} onOpenChange={setPaymentsHistoryOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Вся история платежей
            </DialogTitle>
            <DialogDescription>
              {payments.length} {payments.length === 1 ? "транзакция" : payments.length < 5 ? "транзакции" : "транзакций"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 space-y-2 py-2">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Платежей пока нет</p>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
                      <Check className={cn("h-3.5 w-3.5", p.status?.toLowerCase() === "paid" && "text-green-500")} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" title={p.orderId}>{p.orderId}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.paidAt ?? p.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1 shrink-0">
                    <span className="font-semibold text-sm">{formatMoney(p.amount, p.currency)}</span>
                    <span className={cn(
                      "text-[10px] font-medium uppercase px-2 py-0.5 rounded-full",
                      p.status?.toLowerCase() === "paid" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"
                    )}>
                      {formatPaymentStatus(p.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentsHistoryOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={topUpModalOpen} onOpenChange={(open) => !topUpLoading && setTopUpModalOpen(open)}>
        <DialogContent className="max-w-sm" showCloseButton={!topUpLoading} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Способ оплаты</DialogTitle>
            <DialogDescription>
              Пополнение на {topUpAmount ? `${Number(topUpAmount.replace(",", "."))} ${currency.toUpperCase()}` : "—"}
              {(yoomoneyEnabled || yookassaEnabled) && " (ЮMoney и ЮKassa — только рубли). Crypto Bot и Heleket — USD, RUB, EUR и др."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {yoomoneyEnabled && (
              <Button
                variant="outline"
                className="justify-start border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/15 transition-all duration-200"
                disabled={topUpLoading}
                onClick={() => startTopUpYoomoneyForm("AC")}
              >
                {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : <CreditCard className="h-4 w-4 mr-2 shrink-0 text-primary" />}
                ЮMoney — оплата картой
              </Button>
            )}
            {yookassaEnabled && (
              <Button
                variant="outline"
                className="justify-start border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/15 transition-all duration-200"
                disabled={topUpLoading}
                onClick={() => startTopUpYookassa()}
              >
                {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : <CreditCard className="h-4 w-4 mr-2 shrink-0 text-primary" />}
                ЮKassa — карта / СБП
              </Button>
            )}
            {cryptopayEnabled && (
              <Button
                variant="outline"
                className="justify-start border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/15 transition-all duration-200"
                disabled={topUpLoading}
                onClick={() => startTopUpCryptopay()}
              >
                {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : <CreditCard className="h-4 w-4 mr-2 shrink-0 text-primary" />}
                Crypto Bot — криптовалюта
              </Button>
            )}
            {heleketEnabled && (
              <Button
                variant="outline"
                className="justify-start border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/15 transition-all duration-200"
                disabled={topUpLoading}
                onClick={() => startTopUpHeleket()}
              >
                {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : <CreditCard className="h-4 w-4 mr-2 shrink-0 text-primary" />}
                Heleket — криптовалюта
              </Button>
            )}
            {plategaMethods.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                className="justify-start border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/15 transition-all duration-200"
                disabled={topUpLoading}
                onClick={() => startTopUp(m.id)}
              >
                {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : <CreditCard className="h-4 w-4 mr-2 shrink-0 text-primary" />}
                {m.label}
              </Button>
            ))}
          </div>
          {topUpError && <p className="text-sm text-destructive">{topUpError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTopUpModalOpen(false)} disabled={topUpLoading}>
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={twoFaEnableOpen} onOpenChange={(open) => !open && closeTwoFaEnable()}>
        <DialogContent className="max-w-sm" showCloseButton={!twoFaLoading} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Включить 2FA
            </DialogTitle>
            <DialogDescription>
              {twoFaStep === 1
                ? "Отсканируйте QR-код в приложении-аутентификаторе (Google Authenticator, Authy и т.п.) или введите ключ вручную."
                : "Введите 6-значный код из приложения для подтверждения."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {twoFaLoading && !twoFaSetupData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : twoFaStep === 1 && twoFaSetupData ? (
              <>
                <div className="flex justify-center rounded-xl bg-white p-4 dark:bg-white/95">
                  <QRCodeSVG value={twoFaSetupData.otpauthUrl} size={200} level="M" />
                </div>
                <p className="text-xs text-muted-foreground break-all font-mono bg-muted/50 rounded-lg p-2">
                  Ключ: {twoFaSetupData.secret}
                </p>
                <Button onClick={() => setTwoFaStep(2)}>Далее — ввести код</Button>
              </>
            ) : twoFaStep === 2 ? (
              <>
                <Input
                  placeholder="000000"
                  maxLength={6}
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.4em] font-mono"
                />
                <Button onClick={confirmTwoFaEnable} disabled={twoFaLoading || twoFaCode.length !== 6}>
                  {twoFaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Подтвердить
                </Button>
              </>
            ) : null}
            {twoFaError && <p className="text-sm text-destructive">{twoFaError}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={twoFaDisableOpen} onOpenChange={(open) => !open && setTwoFaDisableOpen(false)}>
        <DialogContent className="max-w-sm" showCloseButton={!twoFaLoading} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Отключить 2FA</DialogTitle>
            <DialogDescription>
              Введите 6-значный код из приложения-аутентификатора для отключения двухфакторной аутентификации.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <Input
              placeholder="000000"
              maxLength={6}
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-[0.4em] font-mono"
            />
            <Button onClick={confirmTwoFaDisable} disabled={twoFaLoading || twoFaCode.length !== 6}>
              {twoFaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Отключить 2FA
            </Button>
            {twoFaError && <p className="text-sm text-destructive">{twoFaError}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
