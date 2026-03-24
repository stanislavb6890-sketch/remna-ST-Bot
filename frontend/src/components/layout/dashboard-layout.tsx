import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, LayoutDashboard, Users, CreditCard, Settings, LogOut, KeyRound,
  Megaphone, Tag, BarChart3, FileText, ExternalLink, Sun, Moon, Monitor,
  Palette, Menu, X, Database, Target, UserCog, Send, CalendarClock, Globe, Server, MessageSquare, Trophy,
  Network, ShieldAlert, Key,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTheme, ACCENT_PALETTES, type ThemeMode, type ThemeAccent } from "@/contexts/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type AdminNotificationCounters } from "@/lib/api";

const PANEL_VERSION = "3.2.6";
const GITHUB_URL = "https://github.com/systemmaster1200-eng/remnawave-STEALTHNET-Bot";

const navWithSections: { to: string; label: string; icon: typeof LayoutDashboard; section: string; category: string }[] = [
  { to: "/admin", label: "Дашборд", icon: LayoutDashboard, section: "dashboard", category: "ОБЗОР" },
  { to: "/admin/analytics", label: "Аналитика", icon: BarChart3, section: "analytics", category: "ОБЗОР" },
  { to: "/admin/sales-report", label: "Отчёты продаж", icon: FileText, section: "sales-report", category: "ОБЗОР" },
  { to: "/admin/traffic-abuse", label: "Анализ трафика", icon: ShieldAlert, section: "analytics", category: "ОБЗОР" },
  { to: "/admin/clients", label: "Клиенты", icon: Users, section: "clients", category: "УПРАВЛЕНИЕ" },
  { to: "/admin/proxy", label: "Прокси", icon: Globe, section: "proxy", category: "УПРАВЛЕНИЕ" },
  { to: "/admin/singbox", label: "Sing-box", icon: Server, section: "singbox", category: "УПРАВЛЕНИЕ" },
  { to: "/admin/backup", label: "Бэкапы", icon: Database, section: "backup", category: "УПРАВЛЕНИЕ" },
  { to: "/admin/tickets", label: "Тикеты", icon: MessageSquare, section: "tickets", category: "УПРАВЛЕНИЕ" },
  { to: "/admin/tariffs", label: "Тарифы", icon: CreditCard, section: "tariffs", category: "ПОДПИСКА" },
  { to: "/admin/promo", label: "Промо-ссылки", icon: Megaphone, section: "promo", category: "ПОДПИСКА" },
  { to: "/admin/promo-codes", label: "Промокоды", icon: Tag, section: "promo-codes", category: "ПОДПИСКА" },
  { to: "/admin/marketing", label: "Маркетинг", icon: Target, section: "marketing", category: "ПОДПИСКА" },
  { to: "/admin/referral-network", label: "Реф. сеть", icon: Network, section: "clients", category: "ПОДПИСКА" },
  { to: "/admin/broadcast", label: "Рассылка", icon: Send, section: "broadcast", category: "ИНСТРУМЕНТЫ" },
  { to: "/admin/auto-broadcast", label: "Авто-рассылка", icon: CalendarClock, section: "auto-broadcast", category: "ИНСТРУМЕНТЫ" },
  { to: "/admin/contests", label: "Конкурсы", icon: Trophy, section: "contests", category: "ИНСТРУМЕНТЫ" },
  { to: "/admin/settings", label: "Настройки", icon: Settings, section: "settings", category: "НАСТРОЙКИ" },
  { to: "/admin/admins", label: "Менеджеры", icon: UserCog, section: "admins", category: "НАСТРОЙКИ" },
  { to: "/admin/api-keys", label: "API Ключи", icon: Key, section: "settings", category: "НАСТРОЙКИ" },
];

function canAccessSection(role: string, allowedSections: string[] | undefined, section: string): boolean {
  if (role === "ADMIN") return true;
  if (section === "admins") return false;
  return Array.isArray(allowedSections) && allowedSections.includes(section);
}

const MODE_OPTIONS: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Светлая" },
  { value: "dark", icon: Moon, label: "Тёмная" },
  { value: "system", icon: Monitor, label: "Система" },
];

function isNavActive(pathname: string, to: string): boolean {
  if (to === "/admin") return pathname === "/admin";
  if (pathname === to) return true;
  if (pathname.startsWith(to)) {
    const next = pathname[to.length];
    return next === "/" || next === undefined;
  }
  return false;
}

function NavItems({ onClick }: { onClick?: () => void }) {
  const location = useLocation();
  const admin = useAuth().state.admin;
  const nav = admin
    ? navWithSections.filter((item) => canAccessSection(admin.role, admin.allowedSections, item.section))
    : navWithSections;

  const groupedNav = nav.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof navWithSections>);

  const categoryOrder = ["ОБЗОР", "УПРАВЛЕНИЕ", "ПОДПИСКА", "ИНСТРУМЕНТЫ", "НАСТРОЙКИ"];
  const sortedCategories = Object.keys(groupedNav).sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));

  return (
    <>
      {sortedCategories.map((category, index) => (
        <div key={category} className="mb-4 last:mb-0">
          {index > 0 && <div className="mx-6 mb-4 border-t border-dotted border-white/10 dark:border-white/20"></div>}
          <div className="flex items-center gap-2 px-6 mb-2">
            <div className="w-[2px] h-[12px] bg-primary"></div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{category}</div>
          </div>
          <div className="space-y-1.5 px-3">
            {groupedNav[category].map((item) => {
              const isActive = isNavActive(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClick}
                  className={cn(
                    "flex items-center gap-3.5 py-2.5 px-3 rounded-xl transition-all duration-300 relative border-x-[4px]",
                    isActive
                      ? "bg-primary/15 backdrop-blur-md text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)] scale-[1.02] z-10 border-x-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 border-x-transparent"
                  )}
                >
                  <item.icon className={cn("h-[19px] w-[19px] shrink-0 transition-transform duration-300", isActive ? "text-primary scale-110" : "text-muted-foreground/70")} />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/50 font-mono text-[13px]">~</span>
                    <span className="text-[14.5px] font-mono tracking-wide">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function DashboardLayout() {
  const { state, logout } = useAuth();
  const { config: themeConfig, setMode, setAccent } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [brand, setBrand] = useState<{ serviceName: string; logo: string | null }>({ serviceName: "", logo: null });
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationToasts, setNotificationToasts] = useState<{ id: number; text: string; icon: string }[]>([]);
  const lastCountersRef = useRef<AdminNotificationCounters | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const admin = state.admin;
    if (!admin || admin.role !== "MANAGER") return;
    const path = location.pathname.replace(/^\/admin\/?/, "") || "dashboard";
    const section = path.split("/")[0] || "dashboard";
    const allowed = admin.allowedSections ?? [];
    if (section === "admins" || !allowed.includes(section)) {
      const first = allowed[0];
      const to = !first ? "/admin" : first === "dashboard" ? "/admin" : `/admin/${first}`;
      navigate(to, { replace: true });
    }
  }, [state.admin, location.pathname, navigate]);

  useEffect(() => {
    const token = state.accessToken;
    if (token) {
      api.getSettings(token).then((s) => {
        setBrand({ serviceName: s.serviceName, logo: s.logo ?? null });
        setNotificationsEnabled(s.adminFrontNotificationsEnabled ?? true);
      }).catch(() => {});
    }
  }, [state.accessToken]);

  useEffect(() => {
    const token = state.accessToken;
    if (!token || !notificationsEnabled) return;
    let cancelled = false;
    const pushToast = (text: string, icon = "") => {
      const id = Date.now() + Math.random();
      setNotificationToasts((prev) => [...prev, { id, text, icon }]);
      window.setTimeout(() => { setNotificationToasts((prev) => prev.filter((t) => t.id !== id)); }, 5000);
    };
    const fetchCounters = async () => {
      try {
        const data = await api.getAdminNotificationCounters(token);
        if (cancelled) return;
        const last = lastCountersRef.current;
        if (last) {
          const newClients = data.totalClients - last.totalClients;
          const newPayments = data.totalTariffPayments - last.totalTariffPayments;
          const newTopups = data.totalBalanceTopups - last.totalBalanceTopups;
          const newTickets = data.totalTickets - last.totalTickets;
          if (newClients > 0) pushToast(newClients === 1 ? "Новый клиент зарегистрировался" : `+${newClients} новых клиентов`, "\u{1F464}");
          if (newPayments > 0) pushToast(newPayments === 1 ? "Новая оплата тарифа" : `+${newPayments} оплат тарифов`, "\u{1F4E6}");
          if (newTopups > 0) pushToast(newTopups === 1 ? "Пополнение баланса" : `+${newTopups} пополнений баланса`, "\u{1F4B0}");
          if (newTickets > 0) pushToast(newTickets === 1 ? "Новый тикет" : `+${newTickets} новых тикетов`, "\u{1F4AC}");
        }
        lastCountersRef.current = data;
      } catch { /* ignore */ }
    };
    fetchCounters();
    const id = window.setInterval(fetchCounters, 15000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [state.accessToken, notificationsEnabled]);

  async function handleLogout() {
    await logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="flex min-h-svh bg-background relative overflow-hidden">
      {/* ═══ Desktop sidebar ═══ */}
      <aside className="hidden md:flex flex-col shrink-0 fixed left-0 top-3 bottom-3 w-[290px] z-50 rounded-r-[2rem] border-y border-r border-white/10 bg-background/40 backdrop-blur-3xl shadow-[20px_0_40px_-10px_rgba(0,0,0,0.5)] transition-all overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-0 right-0 h-[300px] pointer-events-none z-0 flex items-start justify-center opacity-60">
          <div className="w-[400px] h-[400px] -mt-[200px] rounded-full bg-primary/40 blur-[100px]" />
        </div>

        <div className="flex h-16 items-center justify-center gap-3 px-4 relative z-10">
          <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent"></div>
          {brand.logo ? (
            <img src={brand.logo} alt="" className="h-8 w-auto object-contain" />
          ) : (
            <Shield className="h-7 w-7 text-primary shrink-0" />
          )}
          {brand.serviceName ? <span className="font-bold text-lg tracking-wide truncate">{brand.serviceName}</span> : null}
        </div>
        <nav className="flex-1 space-y-1.5 p-4 overflow-y-auto relative z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
          <NavItems />
        </nav>
        <div className="border-t border-white/10 p-4 space-y-1.5 relative z-10">
          <div className="text-[12px] font-mono font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] uppercase tracking-widest px-3 py-1 mb-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            [ ONLINE ]
          </div>
          <div className="text-xs font-mono text-muted-foreground truncate px-3 py-1 mb-2">{state.admin?.email}</div>
          <Link to="/admin/change-password" className="block">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 hover:bg-primary/10 hover:text-primary transition-all font-mono text-[13px]">
              <KeyRound className="h-4 w-4" />
              Изменить пароль
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start gap-2 text-red-500/80 hover:bg-red-500/20 hover:text-red-400 hover:shadow-[0_0_10px_rgba(239,68,68,0.3)] transition-all font-mono font-bold text-[13px] mt-1" 
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            [ ВЫЙТИ ]
          </Button>
        </div>
      </aside>

      {/* ═══ Mobile sidebar overlay ═══ */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)} />
            <motion.aside
              initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[290px] flex flex-col md:hidden bg-background/60 backdrop-blur-3xl border-r border-white/10 shadow-[20px_0_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden"
            >
              {/* Ambient Glow */}
              <div className="absolute top-0 left-0 right-0 h-[300px] pointer-events-none z-0 flex items-start justify-center opacity-60">
                <div className="w-[400px] h-[400px] -mt-[200px] rounded-full bg-primary/40 blur-[100px]" />
              </div>

              <div className="flex h-16 items-center justify-center px-4 relative z-10">
                <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent"></div>
                <div className="flex items-center gap-3 min-w-0">
                  {brand.logo ? <img src={brand.logo} alt="" className="h-8 w-auto object-contain" /> : <Shield className="h-7 w-7 text-primary shrink-0" />}
                  {brand.serviceName ? <span className="font-bold text-lg tracking-wide truncate">{brand.serviceName}</span> : null}
                </div>
                <Button variant="ghost" size="icon" className="absolute right-4 shrink-0" onClick={() => setMobileMenuOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 space-y-1.5 p-4 overflow-y-auto relative z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
                <NavItems onClick={() => setMobileMenuOpen(false)} />
              </nav>
              <div className="border-t border-white/10 p-4 space-y-1.5 relative z-10">
                <div className="text-[12px] font-mono font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] uppercase tracking-widest px-3 py-1 mb-1 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  [ ONLINE ]
                </div>
                <div className="text-xs font-mono text-muted-foreground truncate px-3 py-1 mb-2">{state.admin?.email}</div>
                <Link to="/admin/change-password" className="block" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2 hover:bg-primary/10 hover:text-primary transition-all font-mono text-[13px]">
                    <KeyRound className="h-4 w-4" />
                    Изменить пароль
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start gap-2 text-red-500/80 hover:bg-red-500/20 hover:text-red-400 hover:shadow-[0_0_10px_rgba(239,68,68,0.3)] transition-all font-mono font-bold text-[13px] mt-1" 
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  [ ВЫЙТИ ]
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ═══ Main content ═══ */}
      <main className="flex-1 overflow-auto min-w-0 flex flex-col relative z-0 md:pl-[290px] w-full">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:pr-6 md:-ml-[290px] md:pl-[calc(290px+1.5rem)] bg-card/60 backdrop-blur-xl border-b border-white/10 md:border-r rounded-none md:rounded-br-[2rem] mb-6 md:mb-10 shadow-sm md:mr-6 transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            {brand.serviceName ? <span className="text-sm text-muted-foreground md:hidden truncate">{brand.serviceName}</span> : null}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 px-2" onClick={() => setShowThemePanel(!showThemePanel)}>
                <Palette className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Тема</span>
              </Button>
              {showThemePanel && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemePanel(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border bg-card p-4 shadow-xl">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Режим</p>
                    <div className="flex gap-1 mb-4">
                      {MODE_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => setMode(opt.value)}
                          className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                            themeConfig.mode === opt.value ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted")}>
                          <opt.icon className="h-3.5 w-3.5" />{opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Акцент</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.entries(ACCENT_PALETTES) as [ThemeAccent, typeof ACCENT_PALETTES["default"]][]).map(([key, palette]) => (
                        <button key={key} onClick={() => setAccent(key)}
                          className={cn("flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] transition-all",
                            themeConfig.accent === key ? "ring-2 ring-primary bg-muted" : "hover:bg-muted/50")}>
                          <div className="h-6 w-6 rounded-full border-2 border-foreground/10" style={{ backgroundColor: palette.swatch }} />
                          <span className="text-muted-foreground truncate w-full text-center">{palette.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent">
              <Shield className="h-3 w-3" />Версия {PANEL_VERSION}<ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          </div>
        </header>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex-1 px-4 md:px-6 pb-6">
          <Outlet />
        </motion.div>
      </main>

      {notificationToasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {notificationToasts.map((t) => (
            <div key={t.id} className="max-w-xs rounded-lg border bg-card px-4 py-3 text-sm shadow-lg flex items-center gap-2 animate-in slide-in-from-right-5 fade-in duration-300">
              {t.icon && <span className="text-base shrink-0">{t.icon}</span>}
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
