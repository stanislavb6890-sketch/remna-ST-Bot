import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  
  Package,
  Wallet,
  Wifi,
  Calendar,
  
  
  ArrowRight,
  PlusCircle,
  
  Copy,
  Check,
  Gift,
  Loader2,
  Users,
  
  Tag,
  AlertCircle,
  Zap
} from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { useCabinetConfig } from "@/contexts/cabinet-config";
import { useCabinetMiniapp } from "@/pages/cabinet/cabinet-layout";
import { api } from "@/lib/api";
import { formatRuDays } from "@/lib/i18n";
import type { ClientPayment, ClientReferralStats } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " ГБ";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " МБ";
  return (bytes / 1024).toFixed(0) + " КБ";
}


function getSubscriptionPayload(sub: unknown): Record<string, unknown> | null {
  if (!sub || typeof sub !== "object") return null;
  const raw = sub as Record<string, unknown>;
  if (raw.response && typeof raw.response === "object") return raw.response as Record<string, unknown>;
  if (raw.data && typeof raw.data === "object") {
    const d = raw.data as Record<string, unknown>;
    if (d.response && typeof d.response === "object") return d.response as Record<string, unknown>;
  }
  return raw;
}

function parseSubscription(sub: unknown): {
  status?: string;
  expireAt?: string;
  trafficUsed?: number;
  trafficLimitBytes?: number;
  hwidDeviceLimit?: number;
  subscriptionUrl?: string;
  productName?: string;
} {
  const o = getSubscriptionPayload(sub);
  if (!o) return {};
  const userTraffic = o.userTraffic && typeof o.userTraffic === "object" ? (o.userTraffic as Record<string, unknown>) : null;
  const usedBytes = userTraffic != null && typeof userTraffic.usedTrafficBytes === "number"
    ? userTraffic.usedTrafficBytes
    : typeof o.trafficUsed === "number"
      ? o.trafficUsed
      : undefined;
  const subUrl = typeof o.subscriptionUrl === "string" ? o.subscriptionUrl : undefined;
  const productName = typeof o.productName === "string" ? o.productName.trim() : undefined;
  const subscriptionProductName = typeof (o as Record<string, unknown>).subscriptionProductName === "string" ? (o as Record<string, unknown>).subscriptionProductName as string : undefined;
  return {
    status: typeof o.status === "string" ? o.status : undefined,
    expireAt: typeof o.expireAt === "string" ? o.expireAt : undefined,
    trafficUsed: usedBytes,
    trafficLimitBytes: typeof o.trafficLimitBytes === "number" ? o.trafficLimitBytes : undefined,
    hwidDeviceLimit: typeof o.hwidDeviceLimit === "number" ? o.hwidDeviceLimit : (o.hwidDeviceLimit != null ? Number(o.hwidDeviceLimit) : undefined),
    subscriptionUrl: subUrl?.trim() || undefined,
    productName: productName || subscriptionProductName || undefined,
  };
}

export function ClientDashboardPage() {
  const { state, refreshProfile } = useClientAuth();
  const config = useCabinetConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subscription, setSubscription] = useState<unknown>(null);
  const [tariffDisplayName, setTariffDisplayName] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [_payments, setPayments] = useState<ClientPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMessage, setPaymentMessage] = useState<"success_topup" | "success_tariff" | "success" | "failed" | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [_referralStats, setReferralStats] = useState<ClientReferralStats | null>(null);

  const token = state.token;
  const isMiniapp = useCabinetMiniapp();
  const client = state.client;
  const showTrial = config?.trialEnabled && !client?.trialUsed;
  const trialDays = config?.trialDays ?? 0;

  useEffect(() => {
    const payment = searchParams.get("payment");
    const yoomoneyForm = searchParams.get("yoomoney_form");
    const paymentKind = searchParams.get("payment_kind");
    if (payment === "success") {
      if (paymentKind === "topup") setPaymentMessage("success_topup");
      else if (paymentKind === "tariff") setPaymentMessage("success_tariff");
      else setPaymentMessage("success");
      setSearchParams({}, { replace: true });
      if (token) refreshProfile().catch(() => {});
    } else if (payment === "failed") {
      setPaymentMessage("failed");
      setSearchParams({}, { replace: true });
      if (token) refreshProfile().catch(() => {});
    } else if (yoomoneyForm === "success") {
      setSearchParams({}, { replace: true });
      if (token) refreshProfile().catch(() => {});
    } else if (searchParams.get("yookassa") === "success") {
      setSearchParams({}, { replace: true });
      if (token) refreshProfile().catch(() => {});
    } else if (searchParams.get("heleket") === "success") {
      setSearchParams({}, { replace: true });
      if (token) refreshProfile().catch(() => {});
    }
  }, [searchParams, setSearchParams, token, refreshProfile]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setSubscriptionError(null);
    Promise.all([
      api.clientSubscription(token),
      api.clientPayments(token),
    ])
      .then(([subRes, payRes]) => {
        if (cancelled) return;
        setSubscription(subRes.subscription ?? null);
        setTariffDisplayName(subRes.tariffDisplayName ?? null);
        if (subRes.message) setSubscriptionError(subRes.message);
        setPayments(payRes.items ?? []);
      })
      .catch((e) => {
        if (!cancelled) setSubscriptionError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, refreshKey]);

  useEffect(() => {
    if (!token || !isMiniapp) return;
    api.getClientReferralStats(token).then(setReferralStats).catch(() => {});
  }, [token, isMiniapp]);

  async function activateTrial() {
    if (!token) return;
    setTrialError(null);
    setTrialLoading(true);
    try {
      await api.clientActivateTrial(token);
      await refreshProfile();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setTrialError(e instanceof Error ? e.message : "Ошибка активации триала");
    } finally {
      setTrialLoading(false);
    }
  }

  if (!client) return null;

  const subParsed = parseSubscription(subscription);
  const hasActiveSubscription =
    subscription && typeof subscription === "object" && (subParsed.status === "ACTIVE" || subParsed.status === undefined);
  const vpnUrl = subParsed.subscriptionUrl || null;
  const [referralCopied, setReferralCopied] = useState<"site" | "bot" | null>(null);
  const siteOrigin = config?.publicAppUrl?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const referralLinkSite =
    client.referralCode && siteOrigin
      ? `${siteOrigin}/cabinet/register?ref=${encodeURIComponent(client.referralCode)}`
      : "";
  const referralLinkBot =
    client.referralCode && config?.telegramBotUsername
      ? `https://t.me/${config.telegramBotUsername.replace(/^@/, "")}?start=ref_${client.referralCode}`
      : "";
  const hasReferralLinks = Boolean(referralLinkSite || referralLinkBot);
  const copyReferral = (which: "site" | "bot") => {
    const url = which === "site" ? referralLinkSite : referralLinkBot;
    if (url) {
      navigator.clipboard.writeText(url);
      setReferralCopied(which);
      setTimeout(() => setReferralCopied(null), 2000);
    }
  };
  const trafficPercent = subParsed.trafficLimitBytes != null && subParsed.trafficLimitBytes > 0 && subParsed.trafficUsed != null
    ? Math.min(100, Math.round((subParsed.trafficUsed / subParsed.trafficLimitBytes) * 100))
    : null;

  const expireDate = subParsed.expireAt ? (() => { try { const d = new Date(subParsed.expireAt); return Number.isNaN(d.getTime()) ? null : d; } catch { return null; } })() : null;
  const daysLeft = expireDate && expireDate > new Date()
    ? Math.max(0, Math.ceil((expireDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  // Компонент-состояние отсутствия подписки
  const NoSubscriptionState = () => (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Package className="h-8 w-8 text-primary/70" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">Нет активной подписки</h3>
        <p className="text-[14px] text-muted-foreground max-w-xs mt-2 mx-auto leading-relaxed">
          У вас пока нет привязанной подписки. Перейдите во вкладку Тарифы, чтобы выбрать и оплатить доступ.
        </p>
      </div>
      <Button className="mt-2 shadow-lg h-11 px-6 rounded-xl hover:scale-105 transition-transform duration-300" asChild>
        <Link to="/cabinet/tariffs">Выбрать тариф</Link>
      </Button>
    </div>
  );

  if (isMiniapp) {
    return (
      <div className="w-full min-w-0 overflow-hidden space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {(paymentMessage === "success" || paymentMessage === "success_topup" || paymentMessage === "success_tariff") && (
          <div className="rounded-xl bg-green-500/15 backdrop-blur-md border border-green-500/30 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400 shadow-sm">
            {paymentMessage === "success_topup"
              ? "Оплата прошла успешно. Баланс пополнен."
              : paymentMessage === "success_tariff"
                ? "Оплата прошла успешно. Тариф активируется автоматически."
                : "Оплата прошла успешно. Статус обновляется автоматически."}
          </div>
        )}
        {paymentMessage === "failed" && (
          <div className="rounded-xl bg-destructive/15 backdrop-blur-md border border-destructive/30 px-4 py-3 text-sm font-medium text-destructive shadow-sm">
            Оплата не прошла. Попробуйте снова.
          </div>
        )}

        {/* 1. Статус, срок, тариф, трафик, устройства — с иконками */}
        <section className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 shadow-sm overflow-hidden transition-all duration-300">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-5">
            <div className="p-1.5 bg-primary/20 rounded-lg">
              <Zap className="h-4 w-4 shrink-0 text-primary" />
            </div>
            Статус Подписки
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : subscriptionError || !hasActiveSubscription ? (
            <NoSubscriptionState />
          ) : (
            <div className="space-y-4 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  Активна
                </span>
                {daysLeft != null && (
                  <span className="text-sm font-semibold text-foreground bg-foreground/5 px-3 py-1.5 rounded-full border border-border/50">
                    Осталось {daysLeft} {daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}
                  </span>
                )}
              </div>

              <div className="space-y-3 border-t border-border/50 pt-4 mt-2">
                {subParsed.expireAt && (
                  <div className="flex items-center gap-3 min-w-0 bg-background/30 p-2.5 rounded-xl border border-border/50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Calendar className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">До окончания</p>
                      <p className="text-[15px] font-semibold truncate text-foreground">{formatDate(subParsed.expireAt)}</p>
                    </div>
                  </div>
                )}
                {(tariffDisplayName ?? subParsed.productName) && (
                  <div className="flex items-center gap-3 min-w-0 bg-background/30 p-2.5 rounded-xl border border-border/50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Package className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Тариф</p>
                      <p className="text-[15px] font-semibold truncate text-foreground" title={tariffDisplayName ?? subParsed.productName ?? ""}>{tariffDisplayName ?? subParsed.productName ?? ""}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 min-w-0 bg-background/30 p-2.5 rounded-xl border border-border/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Wifi className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Трафик</p>
                    <p className="text-[15px] font-semibold truncate text-foreground">
                      {subParsed.trafficLimitBytes != null && subParsed.trafficLimitBytes > 0
                        ? subParsed.trafficUsed != null
                          ? `${formatBytes(subParsed.trafficUsed)} из ${formatBytes(subParsed.trafficLimitBytes)}`
                          : `Лимит ${formatBytes(subParsed.trafficLimitBytes)}`
                        : subParsed.trafficUsed != null
                          ? `Использовано ${formatBytes(subParsed.trafficUsed)}`
                          : "Без лимита"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2. Как подключиться — ссылка и кнопка */}
        <section className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 shadow-sm overflow-hidden transition-all duration-300">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-4">
             <div className="p-1.5 bg-primary/20 rounded-lg">
              <Wifi className="h-4 w-4 shrink-0 text-primary" />
            </div>
            Подключение
          </h2>
          {vpnUrl ? (
            <div className="space-y-4">
              <p className="text-[14px] text-muted-foreground leading-relaxed">Нажмите кнопку ниже — откроется страница с приложениями и настройкой в 1 клик.</p>
              <div className="flex gap-2 min-w-0">
                <code className="flex-1 min-w-0 truncate rounded-xl bg-background/50 border border-border/50 px-3 py-2.5 text-xs font-mono flex items-center text-foreground/80" title={vpnUrl}>
                  {vpnUrl}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0 h-auto w-11 rounded-xl bg-background/50 hover:bg-background/80 transition-transform hover:scale-105"
                  onClick={() => {
                    navigator.clipboard.writeText(vpnUrl);
                    window.Telegram?.WebApp?.showPopup?.({ title: "Скопировано", message: "Ссылка в буфере обмена" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button className="w-full gap-2 shadow-lg h-12 rounded-xl text-md hover:scale-[1.02] transition-transform duration-300" asChild>
                <Link to="/cabinet/subscribe">
                  <Wifi className="h-5 w-5 shrink-0" />
                  Подключиться к VPN
                </Link>
              </Button>
            </div>
          ) : showTrial ? (
            <div className="space-y-4 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600 mb-2">
                 <Gift className="h-6 w-6" />
              </div>
              <p className="text-[14px] text-muted-foreground">
                Получите бесплатный доступ на {formatRuDays(trialDays)}.
              </p>
              <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 rounded-xl hover:scale-[1.02] transition-transform duration-300" onClick={activateTrial} disabled={trialLoading}>
                {trialLoading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Gift className="h-5 w-5 shrink-0" />}
                <span className="font-medium text-base">Активировать триал</span>
              </Button>
              {trialError && <p className="text-sm text-destructive break-words text-center">{trialError}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-[14px] text-primary flex gap-3 items-start">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="leading-relaxed">Ссылка появится после оплаты тарифа. Перейдите во вкладку «Тарифы» и оплатите.</p>
              </div>
              <Button className="w-full shadow-md rounded-xl hover:scale-[1.02] transition-transform duration-300 h-12" variant="default" asChild>
                <Link to="/cabinet/tariffs">Выбрать тариф</Link>
              </Button>
            </div>
          )}
        </section>

        {/* 3. Баланс */}
        <section className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm overflow-hidden flex items-center justify-between transition-all duration-300">
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">Мой баланс</h2>
            <p className="text-3xl font-bold tracking-tight text-foreground">{formatMoney(client.balance, client.preferredCurrency)}</p>
          </div>
          <Button className="gap-2 shadow-md hover:scale-105 transition-transform duration-300 rounded-2xl h-12 px-5" asChild>
            <Link to="/cabinet/profile#topup">
              <PlusCircle className="h-5 w-5 shrink-0" />
              Пополнить
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  // DESKTOP LAYOUT
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      {/* Hero + CTA */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-card/40 backdrop-blur-2xl border border-border/50 p-8 sm:p-10 shadow-xl"
      >
        {/* Декоративное свечение */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-primary/20 blur-[80px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
              Добро пожаловать{client.email ? `, ${client.email.split("@")[0]}` : client.telegramUsername ? `, @${client.telegramUsername}` : ""}
            </h1>
            <p className="mt-3 text-[16px] text-muted-foreground max-w-xl leading-relaxed">
              {hasActiveSubscription
                ? "Ваша подписка активна. Подключитесь к VPN и наслаждайтесь свободным интернетом."
                : "Подключитесь к VPN — выберите удобный тариф и оплатите прямо на сайте."}
            </p>
            
            {(paymentMessage === "success" || paymentMessage === "success_topup" || paymentMessage === "success_tariff") && (
              <div className="mt-4 inline-flex items-center gap-2 bg-green-500/15 border border-green-500/30 px-4 py-2 rounded-xl text-green-700 dark:text-green-400 font-medium text-sm">
                <Check className="h-4 w-4" />
                {paymentMessage === "success_topup" ? "Баланс пополнен." : paymentMessage === "success_tariff" ? "Тариф активирован." : "Оплата прошла успешно."}
              </div>
            )}
            {paymentMessage === "failed" && (
              <div className="mt-4 inline-flex items-center gap-2 bg-destructive/15 border border-destructive/30 px-4 py-2 rounded-xl text-destructive font-medium text-sm">
                <AlertCircle className="h-4 w-4" />
                Оплата не прошла. Попробуйте снова.
              </div>
            )}
            {trialError && <p className="mt-3 text-sm text-destructive font-medium">{trialError}</p>}
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0 min-w-[240px]">
            {showTrial ? (
              <Button size="lg" className="w-full gap-2 shadow-xl bg-green-600 hover:bg-green-700 text-white rounded-xl h-14 hover:scale-105 transition-transform" onClick={activateTrial} disabled={trialLoading}>
                {trialLoading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Gift className="h-5 w-5 shrink-0" />}
                <span className="text-base font-medium">Бесплатный триал</span>
              </Button>
            ) : vpnUrl ? (
              <Button size="lg" className="w-full gap-2 shadow-xl rounded-xl h-14 hover:scale-105 transition-transform bg-primary text-primary-foreground" asChild>
                <Link to="/cabinet/subscribe">
                  <Wifi className="h-5 w-5 shrink-0" />
                  <span className="text-base font-medium">Настроить VPN</span>
                </Link>
              </Button>
            ) : (
              <Button size="lg" variant="default" className="w-full gap-2 shadow-xl rounded-xl h-14 hover:scale-105 transition-transform" asChild>
                <Link to="/cabinet/tariffs">
                  <Package className="h-5 w-5 shrink-0" />
                  <span className="text-base font-medium">Выбрать тариф</span>
                </Link>
              </Button>
            )}
            <Button variant="secondary" size="lg" className="w-full gap-2 rounded-xl h-14 hover:scale-105 transition-transform bg-background/50 hover:bg-background/80 border border-border/50" asChild>
              <Link to="/cabinet/profile#topup">
                <PlusCircle className="h-5 w-5 shrink-0 text-foreground/70" />
                <span className="text-base font-medium">Пополнить баланс</span>
              </Link>
            </Button>
          </div>
        </div>
      </motion.section>

      {/* Cards grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Подписка / тариф */}
        <Card className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 sm:col-span-2 lg:col-span-1 flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl text-foreground">
              <div className="p-2.5 bg-primary/20 rounded-xl">
                <Package className="h-6 w-6 text-primary" />
              </div>
              Моя Подписка
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : subscriptionError || !hasActiveSubscription ? (
              <NoSubscriptionState />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Активна
                  </span>
                </div>
                {((tariffDisplayName ?? subParsed.productName) || client?.trialUsed) && (
                  <div className="flex items-center gap-3 text-[15px] font-medium text-foreground bg-background/40 p-3.5 rounded-xl border border-border/50">
                    <Tag className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate">Тариф: {((tariffDisplayName ?? subParsed.productName?.trim() ?? "").trim()) || "Триал"}</span>
                  </div>
                )}
                {subParsed.expireAt && (
                  <div className="flex items-center gap-3 text-[15px] font-medium text-foreground bg-background/40 p-3.5 rounded-xl border border-border/50">
                    <Calendar className="h-5 w-5 shrink-0 text-primary" />
                    <span>До {formatDate(subParsed.expireAt)}</span>
                  </div>
                )}
                <div className="space-y-3 bg-background/40 p-4 rounded-xl border border-border/50">
                  <div className="flex items-center justify-between text-[15px] font-medium text-foreground">
                    <span className="flex items-center gap-3">
                      <Wifi className="h-5 w-5 shrink-0 text-primary" />
                      {subParsed.trafficLimitBytes != null && subParsed.trafficLimitBytes > 0
                        ? `${formatBytes(subParsed.trafficUsed ?? 0)} / ${formatBytes(subParsed.trafficLimitBytes)}`
                        : "Трафик: Безлимит"}
                    </span>
                    {trafficPercent != null && <span className="text-muted-foreground text-[14px]">{trafficPercent}%</span>}
                  </div>
                  {trafficPercent != null && (
                    <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${trafficPercent}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Баланс + пополнение */}
        <Card className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl text-foreground">
              <div className="p-2.5 bg-primary/20 rounded-xl">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              Баланс
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col justify-center text-center">
            <div>
              <p className="text-5xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
                {formatMoney(client.balance, client.preferredCurrency)}
              </p>
              <p className="text-[15px] text-muted-foreground mt-3">На счету для продления тарифов</p>
            </div>
            <Button variant="default" size="lg" className="w-full gap-2 shadow-lg h-14 rounded-xl text-[16px] hover:scale-105 transition-transform" asChild>
              <Link to="/cabinet/profile#topup">
                <PlusCircle className="h-5 w-5" />
                Пополнить баланс
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Справа от баланса: Рефералы или Подключение */}
        <Card className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl text-foreground">
              <div className="p-2.5 bg-primary/20 rounded-xl">
                {hasReferralLinks ? <Users className="h-6 w-6 text-primary" /> : <Wifi className="h-6 w-6 text-primary" />}
              </div>
              {hasReferralLinks ? "Рефералы" : "Подключение"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-2 flex flex-col justify-center h-[calc(100%-5rem)]">
            {hasReferralLinks ? (
              <>
                <p className="text-[15px] text-muted-foreground leading-relaxed">Делитесь ссылкой и получайте <strong className="text-foreground">бонус на баланс</strong> за каждого приглашенного друга!</p>
                {referralLinkSite && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Сайт</p>
                    <div className="flex items-center gap-2">
                      <code className="rounded-xl bg-background/50 border border-border/50 px-4 py-3 text-[15px] font-mono flex-1 truncate block text-foreground/80" title={referralLinkSite}>
                        {referralLinkSite}
                      </code>
                      <Button variant="secondary" size="icon" onClick={() => copyReferral("site")} className="shrink-0 h-12 w-12 rounded-xl hover:scale-105 transition-transform border border-border/50 bg-background/50" title="Копировать">
                        {referralCopied === "site" ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-foreground/70" />}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="pt-3">
                  <Button variant="outline" className="w-full rounded-xl h-12 text-[15px] bg-background/30 hover:bg-background/60 transition-colors border-border/50" asChild>
                     <Link to="/cabinet/referral">Подробная статистика <ArrowRight className="h-4 w-4 ml-2"/></Link>
                  </Button>
                </div>
              </>
            ) : vpnUrl ? (
              <div className="flex flex-col h-full justify-between space-y-6">
                <p className="text-[15px] text-muted-foreground leading-relaxed">Ваша подписка готова к использованию. Перейдите к настройке приложения.</p>
                <div className="p-6 bg-primary/10 rounded-2xl border border-primary/20 text-center">
                   <Wifi className="h-12 w-12 text-primary mx-auto mb-3 opacity-80" />
                   <p className="text-[15px] text-foreground font-medium">Всё готово к работе</p>
                </div>
                <Button variant="default" size="lg" className="w-full gap-2 rounded-xl shadow-lg h-14 text-[16px] hover:scale-105 transition-transform" asChild>
                  <Link to="/cabinet/subscribe">
                    <Wifi className="h-5 w-5" />
                    Настроить VPN
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col h-full justify-center space-y-6">
                <div className="p-6 bg-background/30 rounded-2xl border border-border/50 text-center">
                   <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                   <p className="text-[15px] text-muted-foreground">Оплатите тариф, чтобы получить ссылку</p>
                </div>
                <Button variant="outline" size="lg" className="w-full rounded-xl h-14 text-[16px] bg-background/30 hover:bg-background/60 border-border/50 transition-colors" asChild>
                  <Link to="/cabinet/tariffs">Выбрать тариф</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
