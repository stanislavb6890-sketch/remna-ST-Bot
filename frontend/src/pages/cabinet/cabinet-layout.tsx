import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useClientAuth } from "@/contexts/client-auth";
import { CabinetConfigProvider, useCabinetConfig } from "@/contexts/cabinet-config";
import { createContext, useContext } from "react";
import { useIsMiniapp } from "@/hooks/use-is-miniapp";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GlassSelect } from "@/components/ui/glass-select";
import { LayoutDashboard, Package, User, LogOut, Shield, Users, Sun, Moon, PlusCircle, Globe, KeyRound, MessageSquare, Palette, Monitor, Check, Loader2, Settings } from "lucide-react";
import { useTheme, ACCENT_PALETTES, type ThemeMode, type ThemeAccent } from "@/contexts/theme";
import { cn } from "@/lib/utils";

function AnalyticsScripts() {
  useEffect(() => {
    api.getPublicConfig().then((c) => {
      if (c.googleAnalyticsId?.trim()) {
        const id = c.googleAnalyticsId.trim();
        if (document.getElementById("ga4-script")) return;
        const script = document.createElement("script");
        script.id = "ga4-script";
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        document.head.appendChild(script);
        const init = document.createElement("script");
        init.id = "ga4-init";
        init.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`;
        document.head.appendChild(init);
      }
      if (c.yandexMetrikaId?.trim()) {
        const id = c.yandexMetrikaId.trim();
        const ymId = /^\d+$/.test(id) ? id : "0";
        if (document.getElementById("ym-script")) return;
        const script = document.createElement("script");
        script.id = "ym-script";
        script.async = true;
        script.textContent = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");ym(${ymId}, "init", {clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`;
        document.head.appendChild(script);
      }
    }).catch(() => { });
  }, []);
  return null;
}

const IsMiniappContext = createContext(false);
export function useCabinetMiniapp() {
  return useContext(IsMiniappContext);
}

/** Экран ввода кода 2FA после успешной проверки пароля или Telegram */
function Client2FAStepScreen() {
  const { state, submit2FACode, clearPending2FA } = useClientAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!state.pending2FAToken || code.trim().length !== 6) {
        setError("Введите 6-значный код из приложения");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        await submit2FACode(code.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неверный код");
      } finally {
        setLoading(false);
      }
    },
    [state.pending2FAToken, code, submit2FACode]
  );

  if (!state.pending2FAToken) return null;

  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 p-6 bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card/60 backdrop-blur-xl p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Код из приложения</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Введите 6-значный код двухфакторной аутентификации</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full text-center text-2xl tracking-[0.4em] font-mono rounded-xl border border-border bg-background px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Войти"}
          </Button>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button type="button" variant="ghost" className="w-full" onClick={clearPending2FA}>
            Отмена
          </Button>
        </form>
      </div>
    </div>
  );
}

const ALL_NAV_ITEMS = [
  { to: "/cabinet/dashboard", label: "Главная", icon: LayoutDashboard },
  { to: "/cabinet/tariffs", label: "Тарифы", icon: Package },
  { to: "/cabinet/extra-options", label: "Опции", icon: PlusCircle },
  { to: "/cabinet/proxy", label: "Прокси", icon: Globe },
  { to: "/cabinet/singbox", label: "Доступы", icon: KeyRound },
  { to: "/cabinet/referral", label: "Рефералы", icon: Users },
  { to: "/cabinet/tickets", label: "Тикеты", icon: MessageSquare },
  { to: "/cabinet/profile", label: "Профиль", icon: User },
];

const MODE_OPTIONS: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Светлая" },
  { value: "dark", icon: Moon, label: "Тёмная" },
  { value: "system", icon: Monitor, label: "Система" },
];

function ThemePopover() {
  const [show, setShow] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { config: themeConfig, setMode, setAccent, resolvedMode, allowUserThemeChange } = useTheme();

  useEffect(() => {
    if (!show) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    // defer to next tick so the opening click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClick); };
  }, [show]);

  // Если смена темы запрещена — просто кнопка солнышко/луна без дропдауна
  if (!allowUserThemeChange) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 bg-background/20 hover:bg-background/40 transition-all duration-300"
        onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
      >
        <span className="relative h-4 w-4">
          <Sun className={cn("absolute inset-0 h-4 w-4 transition-all duration-500", resolvedMode === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
          <Moon className={cn("absolute inset-0 h-4 w-4 transition-all duration-500", resolvedMode === "light" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0")} />
        </span>
      </Button>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 px-2 bg-background/20 hover:bg-background/40" onClick={() => setShow(!show)}>
        <Palette className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Внешний вид</span>
      </Button>
      <div
        className={cn(
          "absolute right-0 top-full z-50 mt-3 w-[320px] rounded-3xl border border-white/10 dark:border-white/5 bg-background/70 backdrop-blur-3xl p-5 shadow-[0_8px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4)] transition-all duration-300 origin-top-right",
          show
            ? "opacity-100 scale-100 pointer-events-auto translate-y-0"
            : "opacity-0 scale-95 pointer-events-none -translate-y-2"
        )}
      >
        <div className="mb-5">
          <h4 className="mb-3 text-sm font-semibold tracking-tight text-foreground">Тема</h4>
          <div className="flex rounded-xl bg-muted/60 p-1 border border-border/50">
            {MODE_OPTIONS.map((opt) => {
              const isActive = themeConfig.mode === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all duration-300",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {allowUserThemeChange && (
          <div>
            <h4 className="mb-3 text-sm font-semibold tracking-tight text-foreground">Цветовой акцент</h4>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(ACCENT_PALETTES) as [ThemeAccent, typeof ACCENT_PALETTES["default"]][]).map(([key, palette]) => {
                const isActive = themeConfig.accent === key;
                return (
                  <button
                    key={key}
                    onClick={() => setAccent(key)}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-xl p-2 transition-all duration-300",
                      isActive ? "bg-primary/10" : "hover:bg-muted/60"
                    )}
                  >
                    <div
                      className={cn(
                        "relative flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-transform duration-300",
                        isActive ? "scale-110 ring-4 ring-primary/20" : "group-hover:scale-110"
                      )}
                      style={{ backgroundColor: palette.swatch }}
                    >
                      {isActive && <Check className="h-4 w-4 text-white drop-shadow-md" />}
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium tracking-tight truncate w-full text-center transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}>
                      {palette.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPopover() {
  const [show, setShow] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { state, refreshProfile } = useClientAuth();

  const [activeLanguages, setActiveLanguages] = useState<string[]>([]);
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([]);
  const [preferredLang, setPreferredLang] = useState(state.client?.preferredLang ?? "ru");
  const [preferredCurrency, setPreferredCurrency] = useState(state.client?.preferredCurrency ?? "usd");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) {
      if (state.client) {
        setPreferredLang(state.client.preferredLang);
        setPreferredCurrency(state.client.preferredCurrency);
      }
      return;
    }

    api.getPublicConfig()
      .then((c) => {
        setActiveLanguages(c.activeLanguages?.length ? c.activeLanguages : ["ru", "en"]);
        setActiveCurrencies(c.activeCurrencies?.length ? c.activeCurrencies : ["usd", "rub"]);
      })
      .catch(() => { });

    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClick); };
  }, [show, state.client]);

  async function handleSave() {
    if (!state.token) return;
    setSaving(true);
    try {
      await api.clientUpdateProfile(state.token, { preferredLang, preferredCurrency });
      await refreshProfile();
      setShow(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const langs = activeLanguages.length ? activeLanguages : ["ru", "en"];
  const currencies = activeCurrencies.length ? activeCurrencies : ["usd", "rub"];

  return (
    <div className="relative" ref={popoverRef}>
      <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 px-2 bg-background/20 hover:bg-background/40" onClick={() => setShow(!show)}>
        <Settings className="h-3.5 w-3.5" />
      </Button>
      <div
        className={cn(
          "absolute right-0 top-full z-50 mt-3 w-[260px] rounded-3xl border border-white/10 dark:border-white/5 bg-background/70 backdrop-blur-3xl p-5 shadow-[0_8px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4)] transition-all duration-300 origin-top-right",
          show ? "opacity-100 scale-100 pointer-events-auto translate-y-0" : "opacity-0 scale-95 pointer-events-none -translate-y-2"
        )}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Settings className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-bold tracking-tight text-foreground truncate">Настройки</h4>
            <p className="text-[10px] text-muted-foreground mt-[1px] uppercase tracking-wider font-semibold truncate">Язык и валюта</p>
          </div>
        </div>

        <div className="space-y-4 mb-5">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium pl-1 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Язык</label>
            <GlassSelect
              value={preferredLang}
              onChange={(v) => setPreferredLang(v)}
              options={langs.map((l) => ({ value: l, label: l === "ru" ? "Русский" : l === "en" ? "English" : l.toUpperCase() }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium pl-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Валюта</label>
            <GlassSelect
              value={preferredCurrency}
              onChange={(v) => setPreferredCurrency(v)}
              options={currencies.map((c) => ({ value: c, label: c.toUpperCase() }))}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full h-10 rounded-xl shadow-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-all hover:scale-[1.02] active:scale-95">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function resolveNavItems(config: { sellOptionsEnabled?: boolean; showProxyEnabled?: boolean; showSingboxEnabled?: boolean; ticketsEnabled?: boolean } | null) {
  let items = ALL_NAV_ITEMS;
  if (!config?.sellOptionsEnabled) items = items.filter((i) => i.to !== "/cabinet/extra-options");
  if (!config?.showProxyEnabled) items = items.filter((i) => i.to !== "/cabinet/proxy");
  if (!config?.showSingboxEnabled) items = items.filter((i) => i.to !== "/cabinet/singbox");
  if (!config?.ticketsEnabled) items = items.filter((i) => i.to !== "/cabinet/tickets");
  return items;
}

function MobileCabinetShell() {
  const location = useLocation();
  const { state, logout, refreshProfile } = useClientAuth();
  const config = useCabinetConfig();
  const navItems = useMemo(() => resolveNavItems(config), [config?.sellOptionsEnabled, config?.showProxyEnabled, config?.showSingboxEnabled, config?.ticketsEnabled]);
  const [logoError, setLogoError] = useState(false);
  useEffect(() => { setLogoError(false); }, [config?.logo]);
  useEffect(() => {
    if (state.token) refreshProfile().catch(() => { });
  }, [state.token, refreshProfile]);
  const serviceName = config?.serviceName ?? "";
  const logo = config?.logo && !logoError ? config.logo : null;

  return (
    <div className="min-h-svh flex flex-col bg-transparent min-w-0 overflow-x-hidden pb-20">
      <header className="sticky top-0 z-50 border-b border-border bg-card/40 backdrop-blur-xl shrink-0 transition-all duration-300" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex h-14 items-center justify-between gap-3 px-4 min-w-0 w-full max-w-7xl mx-auto">
          <Link to="/cabinet/dashboard" className="flex items-center gap-2.5 font-semibold text-base tracking-tight shrink-0 min-w-0">
            {logo ? (
              <img src={logo} alt="" className="h-8 w-8 rounded-lg object-contain bg-background/50 shrink-0 shadow-sm" onError={() => setLogoError(true)} />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary shadow-sm">
                <Shield className="h-4 w-4" />
              </span>
            )}
            {serviceName ? <span className="truncate">{serviceName}</span> : null}
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemePopover />
            <Button variant="ghost" size="icon" className="shrink-0 bg-background/20 hover:bg-background/40 text-muted-foreground hover:text-foreground" asChild>
              <Link to="/cabinet/login" onClick={() => logout()} title="Выйти">
                <LogOut className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full min-w-0 px-4 py-6 max-w-7xl mx-auto transition-all duration-300">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/60 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] transition-all duration-300">
        <div className="flex items-center w-full overflow-x-auto no-scrollbar h-[4.5rem] px-2">
          <div className="flex items-center justify-between sm:justify-center w-full min-w-max gap-1 md:gap-2 mx-auto">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-1 px-1 h-14 flex-1 min-w-[4.2rem] max-w-[6rem] rounded-xl transition-all duration-300",
                    active ? "bg-primary/20 text-primary shadow-sm scale-105" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground hover:scale-105"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-300", active && "scale-110 drop-shadow-md")} />
                  <span className="text-[10px] font-medium leading-none tracking-tight whitespace-nowrap">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <style dangerouslySetInnerHTML={{
        __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      ` }} />
    </div>
  );
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

function CabinetShell() {
  const location = useLocation();
  const { state, logout, refreshProfile } = useClientAuth();
  const config = useCabinetConfig();
  const navItems = useMemo(() => resolveNavItems(config), [config?.sellOptionsEnabled, config?.showProxyEnabled, config?.showSingboxEnabled, config?.ticketsEnabled]);
  const isMiniapp = useIsMiniapp();
  const isMobile = useIsMobile();
  const [logoError, setLogoError] = useState(false);
  useEffect(() => { setLogoError(false); }, [config?.logo]);
  useEffect(() => {
    if (state.token) refreshProfile().catch(() => { });
  }, [state.token, refreshProfile]);
  const serviceName = config?.serviceName ?? "";
  const logo = config?.logo && !logoError ? config.logo : null;

  if (isMiniapp || isMobile) {
    return <MobileCabinetShell />;
  }

  return (
    <div className="min-h-svh flex flex-col bg-transparent">
      <header className="sticky top-0 z-50 border-b border-border bg-card/40 backdrop-blur-xl shadow-sm transition-all duration-300">
        <div className="w-full max-w-7xl mx-auto flex h-16 items-center justify-between gap-4 px-4">
          <Link to="/cabinet/dashboard" className="flex items-center gap-2.5 font-semibold text-lg tracking-tight shrink-0 hover:opacity-80 transition-opacity">
            {logo ? (
              <img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain bg-background/50 shadow-sm" onError={() => setLogoError(true)} />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary shadow-sm">
                <Shield className="h-5 w-5" />
              </span>
            )}
            {serviceName ? <span className="hidden sm:inline truncate">{serviceName}</span> : null}
          </Link>
          <nav className="flex items-center gap-1 flex-wrap justify-center flex-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link key={to} to={to}>
                  <Button
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "inline-flex items-center gap-2 whitespace-nowrap transition-all duration-300",
                      active ? "bg-primary/20 hover:bg-primary/30 text-primary shadow-sm scale-105" : "hover:scale-105 hover:bg-background/40"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Button>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1 shrink-0">
            <ThemePopover />
            <SettingsPopover />
            <span className="max-w-[160px] truncate text-sm text-muted-foreground bg-background/30 px-3 py-1.5 rounded-full border border-border" title={state.client?.email?.trim() || (state.client?.telegramUsername ? `@${state.client.telegramUsername}` : "")}>
              {state.client?.email?.trim() ? state.client.email : state.client?.telegramUsername ? `@${state.client.telegramUsername}` : "—"}
            </span>
            <Button variant="outline" size="sm" className="inline-flex items-center gap-2 whitespace-nowrap bg-background/50 hover:bg-background/80 transition-all hover:scale-105" asChild>
              <Link to="/cabinet/login" onClick={() => logout()}>
                <LogOut className="h-4 w-4 shrink-0" />
                Выйти
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}

export function CabinetLayout() {
  const location = useLocation();
  const { state } = useClientAuth();
  const isAuthPage = location.pathname === "/cabinet/login" || location.pathname === "/cabinet/register";
  const isLoggedIn = Boolean(state.token);
  const needs2FA = !isLoggedIn && Boolean(state.pending2FAToken);

  return (
    <>
      <AnalyticsScripts />
      {needs2FA ? (
        <Client2FAStepScreen />
      ) : isAuthPage || !isLoggedIn ? (
        <Outlet />
      ) : (
        <CabinetConfigProvider>
          <CabinetShellWithMiniapp />
        </CabinetConfigProvider>
      )}
    </>
  );
}

function CabinetShellWithMiniapp() {
  const isMiniapp = useIsMiniapp();
  const isMobile = useIsMobile();
  return (
    <IsMiniappContext.Provider value={isMiniapp || isMobile}>
      <CabinetShell />
    </IsMiniappContext.Provider>
  );
}
