import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type PublicConfig, type PublicTariffCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type ThemeAccent, useTheme } from "@/contexts/theme";
import {
  Apple,
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  Globe,
  LayoutDashboard,
  Lock,
  Monitor,
  Rocket,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";

type LandingFeatureItem = {
  icon: LucideIcon;
  label: string;
  sub: string;
  desc: string;
  chips: string[];
};

const FEATURES_STRIP: LandingFeatureItem[] = [
  {
    icon: Shield,
    label: "Защита",
    sub: "AES-256 шифрование",
    desc: "Современные протоколы и аккуратная защита трафика без ощущения технарского конструктора.",
    chips: ["Шифрование", "Стабильность"],
  },
  {
    icon: Lock,
    label: "Zero-Log",
    sub: "История не сохраняется",
    desc: "Доступ строится вокруг приватности: без лишних следов, без визуального мусора и без тревоги за данные.",
    chips: ["Zero-Log", "Приватность"],
  },
  {
    icon: Star,
    label: "Оплата",
    sub: "Анонимно и безопасно",
    desc: "Карта, СБП, кошелёк и крипта собираются в один понятный сценарий оплаты без сюрпризов.",
    chips: ["Карта / СБП", "Крипта"],
  },
  {
    icon: Zap,
    label: "Серверы",
    sub: "Собственная инфраструктура",
    desc: "Свои мощности и продуманная маршрутизация дают нормальную скорость и предсказуемую работу сервиса.",
    chips: ["Скорость", "Своя сеть"],
  },
  {
    icon: Smartphone,
    label: "Установка",
    sub: "За 30 секунд",
    desc: "Минимум кликов до подключения: зарегистрировался, оплатил и сразу получил инструкции внутри кабинета.",
    chips: ["Быстрый старт", "Все устройства"],
  },
];

const BENEFITS = [
  {
    icon: Zap,
    title: "Всегда онлайн",
    desc: "Работает стабильно даже в перегруженных сетях. Быстрый доступ с мобильного и десктопа без возни с настройками.",
  },
  {
    icon: Globe,
    title: "РФ-сервисы за границей",
    desc: "Смотри, звони, работай и плати без лишних плясок — маршруты уже продуманы под реальные сценарии.",
  },
  {
    icon: Shield,
    title: "Без посредников",
    desc: "Своя инфраструктура, аккуратная маршрутизация и понятный личный кабинет вместо хаоса из сторонних сервисов.",
  },
  {
    icon: Lock,
    title: "Чистая приватность",
    desc: "Шифрование, маскировка и аккуратная архитектура без ощущения, что ты подключаешь что-то сомнительное.",
  },
  {
    icon: LayoutDashboard,
    title: "Управление в одном месте",
    desc: "Telegram-бот, кабинет, тарифы, продление, инструкции и поддержка — всё собрано в единую систему.",
  },
  {
    icon: Sparkles,
    title: "Красиво и понятно",
    desc: "Нормальный продуктовый опыт: от первого экрана до покупки всё выглядит премиально и читается без боли.",
  },
];

const DEVICES = [
  { name: "Windows", icon: Monitor },
  { name: "macOS", icon: Apple },
  { name: "iPhone / iPad", icon: Smartphone },
  { name: "Android", icon: Smartphone },
  { name: "Linux", icon: Terminal },
];

const FAQ_ITEMS = [
  {
    q: "Что такое VPN и зачем он нужен?",
    a: "VPN шифрует трафик, помогает обходить блокировки и даёт стабильный доступ к нужным сервисам дома, в поездках и за рубежом.",
  },
  {
    q: "Ведётся ли логирование подключений?",
    a: "Нет. Сервис ориентирован на zero-log подход: без хранения истории активности и лишней привязки действий к личности.",
  },
  {
    q: "Сколько устройств можно подключить?",
    a: "Зависит от выбранного тарифа. Лимиты, срок и условия отображаются в кабинете и могут гибко настраиваться в админке.",
  },
  {
    q: "Как быстро начать?",
    a: "Регистрируешься, выбираешь тариф, оплачиваешь удобным способом и сразу получаешь доступ к инструкциям и подключению в кабинете.",
  },
];

const JOURNEY_STEPS = [
  {
    icon: Sparkles,
    title: "Выбираешь сценарий",
    desc: "Доступны гибкие тарифы: выбери то, что подходит именно тебе, без переплат.",
  },
  {
    icon: CreditCard,
    title: "Оплачиваешь как удобно",
    desc: "Карта, СБП, крипта — выбирай любой удобный и безопасный метод оплаты.",
  },
  {
    icon: Rocket,
    title: "Подключаешься без боли",
    desc: "После оплаты бот или личный кабинет сразу выдадут все инструкции. Настройка за 1 минуту.",
  },
];


const EXPERIENCE_PANELS = [
  {
    icon: Sparkles,
    title: "Никаких зависаний",
    desc: "Смотри видео в 4K, играй в игры и работай без задержек.",
  },
  {
    icon: Zap,
    title: "Мгновенное подключение",
    desc: "Достаточно нажать одну кнопку, чтобы оказаться в защищенной сети.",
  },
  {
    icon: LayoutDashboard,
    title: "Удобный кабинет",
    desc: "Управляй подпиской, устройствами и получай поддержку в пару кликов.",
  },
];

const TRUST_POINTS = [
  "Современные протоколы шифрования",
  "Строгая политика Zero-Log: мы не храним данные",
  "Высокая пропускная способность без ограничений",
];

const SECTION_SCROLL_OFFSET = "scroll-mt-24 md:scroll-mt-28";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const UTM_STORAGE_KEY = "stealthnet_utm";

function useUtmCaptureAndBuildLink() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const fromUrl: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
    for (const key of UTM_KEYS) {
      const v = searchParams.get(key);
      if (v) fromUrl[key] = v;
    }
    if (Object.keys(fromUrl).length === 0) return;
    try {
      const raw = localStorage.getItem(UTM_STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ ...existing, ...fromUrl }));
    } catch {
      // ignore corrupt storage
    }
  }, [searchParams]);

  const buildLink = useCallback((path: string) => {
    let stored: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(UTM_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as Record<string, string>;
    } catch {
      // ignore
    }
    const params = new URLSearchParams();
    for (const key of UTM_KEYS) {
      const v = stored[key];
      if (v) params.set(key, v);
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }, []);

  return { buildLink };
}

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.55, ease: "easeOut" },
};

type LandingAccentTheme = {
  primary: string;
  secondary: string;
  tertiary: string;
};

const LANDING_ACCENT_THEMES: Record<ThemeAccent, LandingAccentTheme> = {
  default: { primary: "#10b981", secondary: "#06b6d4", tertiary: "#38bdf8" },
  blue: { primary: "#3b82f6", secondary: "#06b6d4", tertiary: "#60a5fa" },
  violet: { primary: "#8b5cf6", secondary: "#6366f1", tertiary: "#a78bfa" },
  rose: { primary: "#f43f5e", secondary: "#fb7185", tertiary: "#fda4af" },
  orange: { primary: "#f97316", secondary: "#fb923c", tertiary: "#fdba74" },
  green: { primary: "#22c55e", secondary: "#10b981", tertiary: "#4ade80" },
  emerald: { primary: "#10b981", secondary: "#14b8a6", tertiary: "#2dd4bf" },
  cyan: { primary: "#06b6d4", secondary: "#0ea5e9", tertiary: "#67e8f9" },
  amber: { primary: "#f59e0b", secondary: "#f97316", tertiary: "#fcd34d" },
  red: { primary: "#ef4444", secondary: "#f97316", tertiary: "#fca5a5" },
  pink: { primary: "#ec4899", secondary: "#f43f5e", tertiary: "#f9a8d4" },
  indigo: { primary: "#6366f1", secondary: "#8b5cf6", tertiary: "#a5b4fc" },
};

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToHsl(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getLandingAccentTheme(themeAccent?: string): LandingAccentTheme {
  if (!themeAccent) return LANDING_ACCENT_THEMES.default;
  const isKnownAccent = themeAccent in LANDING_ACCENT_THEMES;
  return isKnownAccent
    ? LANDING_ACCENT_THEMES[themeAccent as ThemeAccent]
    : LANDING_ACCENT_THEMES.default;
}

function formatMonthlyPrice(price: number, durationDays: number): string | null {
  if (durationDays < 30) return null;
  return (price / (durationDays / 30)).toFixed(0);
}

function getPaymentLabels(config: PublicConfig): string[] {
  const labels = new Set<string>();

  if (config.plategaMethods?.length) {
    for (const method of config.plategaMethods) {
      labels.add(method.label);
    }
  }

  if (config.yookassaEnabled) labels.add("Карта / СБП");
  if (config.yoomoneyEnabled) labels.add("ЮMoney");
  if (config.cryptopayEnabled) labels.add("Крипта");
  if (config.heleketEnabled) labels.add("Heleket");

  return Array.from(labels).slice(0, 4);
}

export function LandingPage({ config }: { config: PublicConfig }) {
  const { buildLink } = useUtmCaptureAndBuildLink();
  const { resolvedMode } = useTheme();
  const lc = (config as any).landingConfig;
  const [tariffs, setTariffs] = useState<{ items: PublicTariffCategory[] } | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    if (!lc?.showTariffs) {
      setTariffs(null);
      return;
    }

    api
      .getPublicTariffs()
      .then((response) => setTariffs(response))
      .catch(() => setTariffs({ items: [] }));
  }, [lc?.showTariffs]);

  const title = lc?.heroTitle || config.serviceName || "STEALTHNET";
  const subtitle =
    lc?.heroSubtitle ||
    "Telegram, YouTube, видеозвонки и доступ к любым сервисам в одной подписке. Без ограничений, мусора и скрытых платежей.";
  const ctaText = lc?.heroCtaText || "Начать сейчас";
  const heroBadge = lc?.heroBadge ?? "Приватность, скорость и доступ";
  const heroHint = lc?.heroHint ?? "Регистрация за минуту · Оплата картой, СБП, кошельком и криптой";

  const heroHeadline1 = lc?.heroHeadline1 ?? "Тихий доступ,";
  const heroHeadline2 = lc?.heroHeadline2 ?? "который выглядит дорого.";
  const headerBadge = lc?.headerBadge ?? "premium access";
  const buttonLogin = lc?.buttonLogin ?? "Вход";
  const buttonLoginCabinet = lc?.buttonLoginCabinet ?? "Войти в кабинет";
  const defaultPaymentText = lc?.defaultPaymentText ?? "Карта, СБП, крипта и быстрый старт";
  const buttonChooseTariff = lc?.buttonChooseTariff ?? "Выбрать тариф";
  const buttonWatchTariffs = lc?.buttonWatchTariffs ?? "Смотреть тарифы";
  const buttonStart = lc?.buttonStart ?? "Начать";
  const buttonOpenCabinet = lc?.buttonOpenCabinet ?? "Открыть кабинет и подключиться";
  const noTariffsMessage = lc?.noTariffsMessage ?? "Тарифы пока не опубликованы, но лендинг уже готов — контент подтянется автоматически из админки.";

  const comfortTitle = lc?.comfortTitle ?? "Всё для твоего комфорта и безопасности в сети";
  const comfortBadge = lc?.comfortBadge ?? "стабильность · скорость · безопасность";
  const principlesTitle = lc?.principlesTitle ?? "Мы строим сервис, которому доверяют. Без компромиссов в скорости.";
  const pulseTitle = lc?.pulseTitle ?? "Не просто VPN, а аккуратно собранный сервис с человеческим UX";
  const infraTitle = lc?.infraTitle ?? "Один доступ — все нужные сервисы под рукой";
  const techTitle = lc?.techTitle ?? "Продуманная инфраструктура для твоей свободы.";
  const techDesc = lc?.techDesc ?? "Мы используем только современные протоколы и мощные серверы, чтобы обеспечить максимальную скорость и стабильность соединения в любых условиях.";
  const categorySubtitle = lc?.categorySubtitle ?? "Подбирай вариант под свой сценарий — от базового доступа до долгого спокойного использования.";
  const tariffDefaultDesc = lc?.tariffDefaultDesc ?? "Чистый доступ без лишних ограничений и путаницы.";
  const tariffBullet1 = lc?.tariffBullet1 ?? "Подключение через личный кабинет";
  const tariffBullet2 = lc?.tariffBullet2 ?? "Поддержка и инструкции внутри сервиса";
  const tariffBullet3 = lc?.tariffBullet3 ?? "Автоматическая активация после оплаты";
  const lowestTariffDesc = lc?.lowestTariffDesc ?? null;
  const devicesCockpitText = lc?.devicesCockpitText ?? "Один аккаунт, много устройств, ноль ощущения хаоса";
  const universalityTitle = lc?.universalityTitle ?? "Одинаково приятный опыт на десктопе, телефоне и планшете";
  const universalityDesc = lc?.universalityDesc ?? "Один аккаунт для всех твоих устройств. Подключай что угодно и когда угодно.";
  const quickSetupTitle = lc?.quickSetupTitle ?? "Установка займет меньше минуты";
  const quickSetupDesc = lc?.quickSetupDesc ?? "Нажал, оплатил, получил доступ. Подробные инструкции помогут сделать всё быстро.";
  const premiumServiceTitle = lc?.premiumServiceTitle ?? "Премиальный сервис без технической боли";
  const premiumServicePara1 = lc?.premiumServicePara1 ?? "Один вход, одна подписка и понятные шаги: зарегистрировался, оплатил, подключил нужное устройство и забыл про блокировки.";
  const premiumServicePara2 = lc?.premiumServicePara2 ?? "Наша цель — предоставить инструмент, который просто работает. Всегда, везде и на любом устройстве.";
  const howItWorksTitle = lc?.howItWorksTitle ?? "От первого визита до безопасного интернета — всего пара шагов";
  const howItWorksDesc = lc?.howItWorksDesc ?? "Мы сделали всё, чтобы процесс подключения был максимально простым и понятным. Никаких сложных инструкций и лишних действий.";

  const showFeatures = lc?.showFeatures !== false;
  const showBenefits = lc?.showBenefits !== false;
  const showDevices = lc?.showDevices !== false;
  const showFaq = lc?.showFaq !== false;
  const showHowItWorks = lc?.showHowItWorks !== false;
  const showCta = lc?.showCta !== false;

  const featuresList = lc?.features?.length
    ? lc.features.map((feature: { label?: string | null; sub?: string | null }, index: number) => {
      const fallback = FEATURES_STRIP[index] ?? FEATURES_STRIP[0];

      return {
        icon: fallback.icon,
        label: feature.label?.trim() || fallback.label,
        sub: feature.sub?.trim() || fallback.sub,
        desc: fallback.desc,
        chips: fallback.chips,
      };
    })
    : FEATURES_STRIP;
  const benefitsTitle = lc?.benefitsTitle ?? "Почему STEALTHNET ощущается как продукт, а не костыль";
  const benefitsSubtitle =
    lc?.benefitsSubtitle ??
    "Всё, что нужно для спокойного доступа, нормальной скорости и уверенного пользовательского опыта, уже собрано в одном месте.";
  const benefitsBadge = lc?.benefitsBadge ?? "Почему мы";
  const benefitsList = lc?.benefits?.length
    ? lc.benefits.map((benefit: any, index: number) => ({
      icon: BENEFITS[index]?.icon ?? Sparkles,
      title: benefit.title,
      desc: benefit.desc,
    }))
    : BENEFITS;
  const tariffsTitle = lc?.tariffsTitle ?? "Тарифы без неприятных сюрпризов";
  const tariffsSubtitle = lc?.tariffsSubtitle ?? "Платишь за понятный доступ, а не за хаос из скрытых ограничений.";
  const devicesTitle = lc?.devicesTitle ?? "Работает на всех твоих устройствах";
  const devicesSubtitle =
    lc?.devicesSubtitle ?? "Один аккаунт, один кабинет и одинаково приятный опыт на ноутбуке, телефоне и планшете.";
  const faqTitle = lc?.faqTitle ?? "Частые вопросы";
  const faqList = lc?.faq?.length ? lc.faq : FAQ_ITEMS;

  const journeySteps = lc?.journeySteps?.length ? lc.journeySteps.map((s: any, i: number) => ({
    icon: JOURNEY_STEPS[i]?.icon ?? Sparkles,
    title: s.title || JOURNEY_STEPS[i]?.title || "",
    desc: s.desc || JOURNEY_STEPS[i]?.desc || "",
  })) : JOURNEY_STEPS;

  const experiencePanels = lc?.experiencePanels?.length ? lc.experiencePanels.map((p: any, i: number) => ({
    icon: EXPERIENCE_PANELS[i]?.icon ?? Sparkles,
    title: p.title || EXPERIENCE_PANELS[i]?.title || "",
    desc: p.desc || EXPERIENCE_PANELS[i]?.desc || "",
  })) : EXPERIENCE_PANELS;

  const trustPoints = lc?.trustPoints?.length ? lc.trustPoints : TRUST_POINTS;

  const quickStartList = lc?.quickStartList?.length ? lc.quickStartList : [
    "Регистрация и вход через кабинет без лишней бюрократии",
    "Моментальное получение тарифов, способов оплаты и инструкций",
    "Поддержка, оферта и контакты доступны прямо на лендинге",
  ];

  const paymentLabels = getPaymentLabels(config);
  const totalTariffs = tariffs?.items.reduce((sum, category) => sum + category.tariffs.length, 0) ?? 0;
  const lowestTariff = useMemo(() => {
    if (!tariffs?.items.length) return null;

    const allTariffs = tariffs.items.flatMap((category) =>
      category.tariffs.map((tariff) => ({ tariff, category })),
    );

    if (!allTariffs.length) return null;

    return allTariffs.reduce((min, current) => (current.tariff.price < min.tariff.price ? current : min));
  }, [tariffs]);

  const statsPlatforms = lc?.statsPlatforms ?? "платформ";
  const statsTariffsLabel = lc?.statsTariffsLabel ?? "тарифов онлайн";
  const statsAccessLabel = lc?.statsAccessLabel ?? "доступ";
  const statsPaymentMethods = lc?.statsPaymentMethods ?? "способа оплаты";

  const heroStats = [
    { value: `${DEVICES.length}+`, label: statsPlatforms },
    { value: lc?.showTariffs ? `${totalTariffs || "∞"}` : "24/7", label: lc?.showTariffs ? statsTariffsLabel : statsAccessLabel },
    { value: paymentLabels.length ? `${paymentLabels.length}+` : "4", label: statsPaymentMethods },
  ];

  const navBenefits = lc?.navBenefits ?? "Преимущества";
  const navTariffs = lc?.navTariffs ?? "Тарифы";
  const navDevices = lc?.navDevices ?? "Устройства";
  const navFaq = lc?.navFaq ?? "FAQ";

  const navItems: { label: string; href: string }[] = [];
  if (showBenefits) navItems.push({ label: navBenefits, href: "#benefits" });
  if (lc?.showTariffs) navItems.push({ label: navTariffs, href: "#tariffs" });
  if (showDevices) navItems.push({ label: navDevices, href: "#devices" });
  if (showFaq) navItems.push({ label: navFaq, href: "#faq" });

  const accentTheme = getLandingAccentTheme(config.themeAccent);
  const primarySoft = withAlpha(accentTheme.primary, resolvedMode === "dark" ? 0.24 : 0.18);
  const secondarySoft = withAlpha(accentTheme.secondary, resolvedMode === "dark" ? 0.18 : 0.14);
  const tertiarySoft = withAlpha(accentTheme.tertiary, resolvedMode === "dark" ? 0.16 : 0.1);
  const buttonShadow = withAlpha(accentTheme.primary, 0.28);
  const landingSurfaceStyle: CSSProperties = {
    backgroundImage:
      resolvedMode === "dark"
        ? `radial-gradient(circle at top, ${withAlpha(accentTheme.primary, 0.22)}, transparent 24%), radial-gradient(circle at 85% 20%, ${withAlpha(accentTheme.secondary, 0.18)}, transparent 22%), linear-gradient(180deg, rgba(2,6,23,1) 0%, rgba(4,14,33,0.98) 45%, rgba(3,7,18,1) 100%)`
        : `radial-gradient(circle at top, ${withAlpha(accentTheme.primary, 0.18)}, transparent 28%), radial-gradient(circle at 85% 20%, ${withAlpha(accentTheme.secondary, 0.14)}, transparent 24%), linear-gradient(180deg, rgba(248,250,252,0.98) 0%, ${withAlpha(accentTheme.primary, 0.05)} 35%, rgba(255,255,255,1) 100%)`,
    ["--primary" as string]: hexToHsl(accentTheme.primary),
    ["--primary-foreground" as string]: "0 0% 100%",
    ["--ring" as string]: hexToHsl(accentTheme.primary),
  };
  const accentTextStyle: CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${accentTheme.primary}, ${accentTheme.secondary}, ${accentTheme.tertiary})`,
  };
  const primaryButtonStyle: CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${accentTheme.primary}, ${accentTheme.secondary})`,
    boxShadow: `0 18px 50px ${buttonShadow}`,
    borderColor: withAlpha(accentTheme.primary, 0.4),
  };
  const accentGlowStyle: CSSProperties = {
    backgroundImage: `linear-gradient(135deg, ${withAlpha(accentTheme.primary, 0.12)}, ${withAlpha(accentTheme.secondary, 0.1)}, ${withAlpha(accentTheme.tertiary, 0.12)})`,
  };
  const darkPanelStyle: CSSProperties = {
    backgroundColor: '#0f172a',
    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.98), ${withAlpha(accentTheme.primary, 0.2)} 70%, ${withAlpha(accentTheme.secondary, 0.15)} 100%)`,
  };

  if (!lc) return null;

  return (
    <div className="relative min-h-svh overflow-x-clip text-slate-950 dark:text-white" style={landingSurfaceStyle}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-20 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: primarySoft }} />
        <div className="absolute right-[-10rem] top-40 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: secondarySoft }} />
        <div className="absolute bottom-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl" style={{ backgroundColor: tertiarySoft }} />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/20 bg-white/80 dark:bg-white/5 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/45">
        <div className="container mx-auto flex h-18 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3">
            {config.logo ? (
              <img src={config.logo} alt={config.serviceName || title} className="h-10 w-10 rounded-2xl object-cover shadow-lg ring-1 ring-white/30" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg" style={primaryButtonStyle}>
                <Shield className="h-5 w-5" />
              </div>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">{headerBadge}</p>
              <p className="text-lg font-black tracking-[0.14em] text-slate-950 dark:text-white">{config.serviceName || title}</p>
            </div>
          </Link>

          {navItems.length > 0 && (
            <nav className="hidden items-center gap-1 rounded-full border border-white/30 bg-white/80 dark:bg-white/5 px-2 py-1 backdrop-blur-xl lg:flex dark:border-white/10 dark:bg-white/6">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-full px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}

          <nav className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="rounded-full px-4 text-slate-700 hover:bg-white/80 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10" asChild>
              <Link to={buildLink("/cabinet/login")}>{buttonLogin}</Link>
            </Button>
            <Button
              className="rounded-full border px-5 text-white shadow-lg"
              style={primaryButtonStyle}
              asChild
            >
              <Link to={buildLink("/cabinet/register")}>{ctaText}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <section id="home" className={`container mx-auto px-4 pb-10 pt-10 md:pb-16 md:pt-14 lg:pb-24 lg:pt-18 ${SECTION_SCROLL_OFFSET}`}>
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <motion.div {...fadeUp} className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-slate-600 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/12 dark:bg-white/8 dark:text-slate-300">
                <Sparkles className="h-4 w-4" style={{ color: accentTheme.primary }} />
                {heroBadge}
              </div>

              <h1 className="max-w-5xl text-5xl font-black leading-[0.9] tracking-[-0.06em] text-slate-950 md:text-6xl lg:text-[5.4rem] dark:text-white">
                {heroHeadline1}
                <span className="block bg-clip-text text-transparent" style={accentTextStyle}>
                  {heroHeadline2}
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300 md:text-xl">
                <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
                {" — "}
                {subtitle}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="group h-14 rounded-full border px-7 text-base font-semibold text-white"
                  style={primaryButtonStyle}
                  asChild
                >
                  <Link to={buildLink("/cabinet/register")} className="flex flex-row items-center justify-center gap-2">
                    {ctaText}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 rounded-full border-slate-200/80 dark:border-white/12 bg-white/70 px-7 text-base text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl hover:bg-white dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                  asChild
                >
                  <Link to={buildLink("/cabinet/login")}>{buttonLoginCabinet}</Link>
                </Button>
              </div>

              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">{heroHint}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                {paymentLabels.length > 0 ? (
                  paymentLabels.map((label) => (
                    <div
                      key={label}
                      className="rounded-full border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-2 text-sm text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/7 dark:text-slate-200"
                    >
                      {label}
                    </div>
                  ))
                ) : (
                  <div className="rounded-full border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-2 text-sm text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/7 dark:text-slate-200">
                    {defaultPaymentText}
                  </div>
                )}
              </div>

              <div className="mt-8 grid gap-3 md:max-w-2xl md:grid-cols-3">
                {journeySteps.map(({ icon: Icon, title: stepTitle }: any, index: number) => (
                  <motion.div
                    key={stepTitle}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: index * 0.08 }}
                    className="rounded-[24px] border border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/6"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">0{index + 1}. {stepTitle}</p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {heroStats.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.08 * index }}
                    className="rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-white/80 dark:bg-white/5 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/6"
                  >
                    <div className="text-3xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{item.value}</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div {...fadeUp} transition={{ duration: 0.6, ease: "easeOut", delay: 0.08 }} className="relative">
              <div className="absolute -left-6 top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: primarySoft }} />
              <div className="absolute -right-8 bottom-8 h-44 w-44 rounded-full blur-3xl" style={{ backgroundColor: secondarySoft }} />

                            <div className="relative overflow-hidden rounded-[32px] border border-slate-200/60 dark:border-white/10 bg-white/85 dark:bg-white/5 p-6 shadow-[0_30px_100px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/7 md:p-7">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-emerald-300/70" />

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">{headerBadge}</p>
                    <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">
                      {infraTitle}
                    </h2>
                  </div>
                  <div className="rounded-2xl border p-3" style={{ borderColor: withAlpha(accentTheme.primary, 0.28), backgroundColor: withAlpha(accentTheme.primary, 0.12), color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                    <Shield className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  {featuresList.slice(0, 4).map(({ icon: Icon, label, sub }: any, index: number) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, x: 18 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.08 * index }}
                      className="flex items-center gap-4 rounded-3xl border border-slate-200 dark:border-white/15 bg-white/85 dark:bg-white/5 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/35"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-slate-950 px-5 py-5 text-white shadow-xl shadow-slate-950/15 dark:border-white/12 dark:bg-slate-900/90">
                    <p className="text-xs uppercase tracking-[0.28em]" style={{ color: withAlpha(accentTheme.tertiary, 0.8) }}>от</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-[-0.05em]">
                        {lowestTariff ? lowestTariff.tariff.price : "∞"}
                      </span>
                      <span className="text-sm text-slate-300">
                        {lowestTariff ? lowestTariff.tariff.currency.toUpperCase() : "privacy"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300/90">
                      {lowestTariff
                        ? (lowestTariffDesc || `${lowestTariff.tariff.name} · ${lowestTariff.tariff.durationDays} дней доступа`)
                        : "Тарифы и условия подтягиваются из админки автоматически"}
                    </p>
                  </div>

                  <div className="rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-white/95 dark:bg-white/5 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">быстрый старт</p>
                    <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                      {quickStartList.slice(0, 3).map((item: string) => (
                        <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4" style={{ color: accentTheme.primary }} />{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 rounded-[28px] border border-slate-200/80 dark:border-white/12 p-5 backdrop-blur-xl dark:border-white/10" style={accentGlowStyle}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">ощущение продукта</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">{pulseTitle}</p>
                    </div>
                    <Button className="h-12 rounded-full px-5 text-white" style={primaryButtonStyle} asChild>
                      <Link to={lc.showTariffs ? "#tariffs" : buildLink("/cabinet/register")}>{lc.showTariffs ? buttonWatchTariffs : buttonStart}</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {showFeatures && (
        <section className="container mx-auto px-4 pb-8 md:pb-12">
          <motion.div {...fadeUp} className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="overflow-hidden rounded-[34px] border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/6 md:p-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">{headerBadge}</p>
                  <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl dark:text-white">
                    {comfortTitle}
                  </h2>
                </div>
                <div className="rounded-full border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-white/8 px-4 py-2 text-sm text-slate-600 backdrop-blur-xl dark:text-slate-300">
                  {comfortBadge}
                </div>
              </div>

              <div className="mt-7 grid gap-4 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[30px] border border-slate-200/80 dark:border-white/12 bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/15 dark:border-white/12 dark:bg-slate-900/90">
                  <p className="text-xs uppercase tracking-[0.28em]" style={{ color: withAlpha(accentTheme.tertiary, 0.78) }}>главные принципы</p>
                  <p className="mt-4 text-2xl font-black leading-tight tracking-[-0.04em]">
                    {principlesTitle}
                  </p>
                  <div className="mt-6 space-y-4">
                    {trustPoints.map((point: string) => (
                      <div key={point} className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-white/7 px-4 py-3">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentTheme.tertiary }} />
                        <span className="text-sm leading-6 text-slate-200">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {experiencePanels.map(({ icon: Icon, title: itemTitle, desc }: any, index: number) => (
                    <motion.div
                      key={itemTitle}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: index * 0.08 }}
                      className={`rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-white/95 dark:bg-white/5 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/6 ${index === 2 ? "sm:col-span-2" : ""}`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">{itemTitle}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid content-start gap-4 self-start sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {featuresList.slice(0, 4).map(({ icon: Icon, label, sub, desc, chips }: LandingFeatureItem, index: number) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="group rounded-[30px] border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/6"
                >
                  <div className="flex min-h-[220px] flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div
                          className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em]"
                          style={{
                            borderColor: withAlpha(accentTheme.primary, 0.22),
                            backgroundColor: withAlpha(accentTheme.primary, 0.08),
                            color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary,
                          }}
                        >
                          0{index + 1}
                        </div>
                      </div>

                      <div className="mt-5">
                        <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{sub}</p>
                        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{desc}</p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {chips.map((chip: string) => (
                        <span
                          key={`${label}-${chip}`}
                          className="rounded-full border border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-600 backdrop-blur-xl dark:text-slate-300"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
        )}

        {showBenefits && (
        <section id="benefits" className={`container mx-auto px-4 py-14 md:py-20 ${SECTION_SCROLL_OFFSET}`}>
          <motion.div {...fadeUp} className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/7 dark:text-slate-300">
              <Sparkles className="h-4 w-4" style={{ color: accentTheme.primary }} />
              {benefitsBadge}
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-5xl dark:text-white">
              {benefitsTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-500 dark:text-slate-400 md:text-lg">
              {benefitsSubtitle}
            </p>
          </motion.div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <motion.div
              {...fadeUp}
              className="overflow-hidden rounded-[34px] border border-slate-200/60 dark:border-white/10 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl md:p-8"
              style={resolvedMode === "dark" ? darkPanelStyle : accentGlowStyle}
            >
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500 dark:text-slate-300">технологии</p>
              <h3 className="mt-4 max-w-md text-3xl font-black tracking-[-0.04em] text-slate-950 dark:text-white md:text-4xl">
                {techTitle}
              </h3>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                {techDesc}
              </p>

              <div className="mt-8 space-y-4">
                {benefitsList.slice(0, 3).map(({ icon: Icon, title: itemTitle, desc }: any, index: number) => (
                  <motion.div
                    key={itemTitle}
                    initial={{ opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                    className="rounded-[26px] border border-white/20 bg-white/70 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/7"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">{itemTitle}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <div className="grid gap-5 md:grid-cols-2">
              {benefitsList.map(({ icon: Icon, title: itemTitle, desc }: any, index: number) => (
                <motion.div
                  key={itemTitle}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.45, delay: index * 0.06 }}
                  className={index === 0 ? "md:col-span-2" : ""}
                >
                  <Card className="h-full rounded-[30px] border-slate-200/60 dark:border-white/10 bg-white/85 dark:bg-white/5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/6">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em]" style={{ borderColor: withAlpha(accentTheme.primary, 0.28), backgroundColor: withAlpha(accentTheme.primary, 0.1), color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                          0{index + 1}
                        </div>
                      </div>
                      <CardTitle className="pt-4 text-xl text-slate-950 dark:text-white">{itemTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-7 text-slate-600 dark:text-slate-400">{desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
        )}

        {lc.showTariffs && (
          <section id="tariffs" className={`container mx-auto px-4 py-14 md:py-20 ${SECTION_SCROLL_OFFSET}`}>
            <motion.div
              {...fadeUp}
              className="overflow-hidden rounded-[36px] border border-slate-200/60 dark:border-white/10 px-6 py-8 text-white shadow-[0_30px_120px_rgba(15,23,42,0.22)] md:px-8 md:py-10"
              style={darkPanelStyle}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs uppercase tracking-[0.32em]" style={{ color: withAlpha(accentTheme.tertiary, 0.75) }}>pricing</p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] md:text-5xl">{tariffsTitle}</h2>
                  <p className="mt-4 text-sm leading-7 text-slate-200 md:text-base">{tariffsSubtitle}</p>
                </div>
                <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm backdrop-blur-xl" style={{ color: withAlpha(accentTheme.tertiary, 0.95) }}>
                  {tariffs === null ? "Загружаем тарифы…" : `${tariffs.items.length} категорий · ${totalTariffs} вариантов`}
                </div>
              </div>

              {tariffs === null ? (
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="h-56 animate-pulse rounded-[28px] border border-white/10 bg-white/8" />
                  ))}
                </div>
              ) : tariffs.items.length > 0 ? (
                <div className="mt-8 space-y-6">
                  {tariffs.items.map((category, categoryIndex) => (
                    <motion.div
                      key={category.id}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{ duration: 0.45, delay: categoryIndex * 0.06 }}
                      className="rounded-[30px] border border-white/12 bg-white/7 p-5 backdrop-blur-xl md:p-6"
                    >
                      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-xl">
                            {category.emoji || "✨"}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white">{category.name}</h3>
                            <p className="text-sm text-slate-300">{categorySubtitle}</p>
                          </div>
                        </div>
                        <div className="text-sm text-slate-300">{category.tariffs.length} тарифов в категории</div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-3">
                        {category.tariffs.map((tariff) => {
                          const monthlyPrice = formatMonthlyPrice(tariff.price, tariff.durationDays);
                          return (
                            <div
                              key={tariff.id}
                              className="group flex h-full flex-col rounded-[28px] border border-white/12 bg-white/10 p-5 shadow-lg shadow-black/10 transition-transform duration-300 hover:-translate-y-1 hover:bg-white/12"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-lg font-semibold text-white">{tariff.name}</p>
                                  {tariff.description ? (
                                    <p className="mt-2 text-sm leading-6 text-slate-300">{tariff.description}</p>
                                  ) : (
                                    <p className="mt-2 text-sm leading-6 text-slate-400">{tariffDefaultDesc}</p>
                                  )}
                                </div>
                                <div className="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.24em]" style={{ borderColor: withAlpha(accentTheme.primary, 0.3), backgroundColor: withAlpha(accentTheme.primary, 0.12), color: withAlpha(accentTheme.tertiary, 0.95) }}>
                                  {tariff.durationDays} дн.
                                </div>
                              </div>

                              <div className="mt-6">
                                <div className="flex items-end gap-2">
                                  <span className="text-4xl font-black tracking-[-0.05em] text-white">{tariff.price}</span>
                                  <span className="pb-1 text-sm uppercase text-slate-300">{tariff.currency}</span>
                                </div>
                                {monthlyPrice && (
                                  <p className="mt-2 text-sm" style={{ color: withAlpha(accentTheme.tertiary, 0.9) }}>≈ {monthlyPrice} {tariff.currency.toUpperCase()}/мес</p>
                                )}
                              </div>

                              <div className="mt-6 space-y-3 text-sm text-slate-300">
                                <div className="flex items-center gap-3"><Check className="h-4 w-4" style={{ color: accentTheme.tertiary }} />{tariffBullet1}</div>
                                <div className="flex items-center gap-3"><Check className="h-4 w-4" style={{ color: accentTheme.tertiary }} />{tariffBullet2}</div>
                                <div className="flex items-center gap-3"><Check className="h-4 w-4" style={{ color: accentTheme.tertiary }} />{tariffBullet3}</div>
                              </div>

                              <Button className="mt-6 h-12 rounded-full text-white" style={primaryButtonStyle} asChild>
                                <Link to={buildLink("/cabinet/register")}>{buttonChooseTariff}</Link>
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="mt-8 rounded-[30px] border border-white/12 bg-white/7 p-8 text-center text-slate-300 backdrop-blur-xl">
                  {noTariffsMessage}
                </div>
              )}
            </motion.div>
          </section>
        )}

        {showDevices && (
        <section id="devices" className={`container mx-auto px-4 py-14 md:py-20 ${SECTION_SCROLL_OFFSET}`}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <motion.div {...fadeUp} className="rounded-[32px] border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl md:p-8 dark:border-white/10 dark:bg-white/6">
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">devices</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl dark:text-white">{devicesTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-400 md:text-base">{devicesSubtitle}</p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="relative overflow-hidden rounded-[30px] border border-slate-200/80 dark:border-white/12 bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/15 dark:border-white/12 dark:bg-slate-900/90 sm:col-span-2">
                  <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ backgroundColor: withAlpha(accentTheme.primary, 0.25) }} />
                  <div className="relative flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">device cockpit</p>
                      <p className="mt-2 text-lg font-semibold">{devicesCockpitText}</p>
                    </div>
                    <div className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-200">
                      synced
                    </div>
                  </div>

                  <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
                    {DEVICES.map(({ name, icon: Icon }, index) => (
                      <motion.div
                        key={name}
                        initial={{ opacity: 0, scale: 0.96 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.35, delay: index * 0.05 }}
                        className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: withAlpha(accentTheme.primary, 0.16), color: accentTheme.tertiary }}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{name}</p>
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">native flow</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-white/95 dark:bg-white/5 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">универсальность</p>
                  <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">{universalityTitle}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{universalityDesc}</p>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 dark:border-white/12 p-5 backdrop-blur-xl dark:border-white/10" style={accentGlowStyle}>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">быстрая настройка</p>
                  <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">{quickSetupTitle}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{quickSetupDesc}</p>
                </div>
              </div>
            </motion.div>

            <motion.div {...fadeUp} transition={{ duration: 0.6, ease: "easeOut", delay: 0.05 }} className="rounded-[32px] border border-slate-200/60 dark:border-white/10 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] md:p-8 dark:border-white/10" style={darkPanelStyle}>
              <p className="text-xs uppercase tracking-[0.32em]" style={{ color: withAlpha(accentTheme.tertiary, 0.8) }}>быстрый старт</p>
              <h3 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">{premiumServiceTitle}</h3>
              <div className="mt-6 space-y-4 text-sm leading-7 text-slate-300 md:text-base">
                <p>{premiumServicePara1}</p>
                <p>{premiumServicePara2}</p>
              </div>

              <div className="mt-8 space-y-4">
                {journeySteps.map(({ icon: Icon, title: stepTitle, desc }: any, index: number) => (
                  <motion.div
                    key={stepTitle}
                    initial={{ opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.08 }}
                    className="rounded-[26px] border border-white/10 bg-white/7 p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: withAlpha(accentTheme.primary, 0.16), color: accentTheme.tertiary }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm uppercase tracking-[0.22em] text-slate-400">0{index + 1}</p>
                        <p className="mt-2 text-xl font-semibold text-white">{stepTitle}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <Button className="mt-8 h-13 rounded-full px-6 text-white" style={primaryButtonStyle} asChild>
                <Link to={buildLink("/cabinet/register")}>{buttonOpenCabinet}</Link>
              </Button>
            </motion.div>
          </div>
        </section>
        )}

        {showHowItWorks && (
        <section className="container mx-auto px-4 py-6 md:py-10">
          <motion.div
            {...fadeUp}
            className="overflow-hidden rounded-[36px] border border-slate-200/60 dark:border-white/10 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/10 md:p-8"
            style={resolvedMode === "dark" ? darkPanelStyle : accentGlowStyle}
          >
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-slate-500" style={resolvedMode === "dark" ? { color: withAlpha(accentTheme.tertiary, 0.75) } : undefined}>как это работает</p>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl dark:text-white">
                  {howItWorksTitle}
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                  {howItWorksDesc}
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-white/85 dark:bg-white/5 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">narrative</p>
                  <div className="mt-5 space-y-5">
                    {journeySteps.map(({ title: stepTitle, desc }: any, index: number) => (
                      <div key={stepTitle} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundImage: `linear-gradient(135deg, ${accentTheme.primary}, ${accentTheme.secondary})` }}>
                            0{index + 1}
                          </div>
                          {index < journeySteps.length - 1 && <div className="mt-2 h-full w-px bg-slate-200 dark:bg-white/12" />}
                        </div>
                        <div className="pb-5 pt-1">
                          <p className="font-semibold text-slate-950 dark:text-white">{stepTitle}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid content-start gap-4 sm:grid-cols-2">
                  {featuresList.slice(0, 2).map(({ icon: Icon, label, sub, desc }: LandingFeatureItem) => (
                    <div
                      key={label}
                      className="rounded-[28px] border border-slate-200/80 dark:border-white/12 bg-white/85 dark:bg-white/5 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/6"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ ...accentGlowStyle, color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">{label}</h3>
                      <p className="mt-3 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{sub}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{desc}</p>
                    </div>
                  ))}

                  <div className="rounded-[28px] border border-slate-200/80 dark:border-white/12 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 sm:col-span-2" style={accentGlowStyle}>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">прозрачность</p>
                    <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Честные условия без скрытых платежей и ограничений скорости.</p>
                    <div className="mt-6 flex flex-wrap gap-4">
                      {heroStats.map((item) => (
                        <div key={item.label} className="rounded-full border border-slate-200/80 dark:border-white/12 bg-white/80 dark:bg-white/8 px-6 py-3 text-base text-slate-700 backdrop-blur-xl dark:text-slate-200 shadow-sm">
                          <span className="font-bold text-xl text-slate-950 dark:text-white mr-1.5">{item.value}</span> {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>
        )}

        {showFaq && (
        <section id="faq" className={`container mx-auto grid gap-8 px-4 py-14 md:py-20 lg:grid-cols-[minmax(0,1fr)_360px] ${SECTION_SCROLL_OFFSET}`}>
          <motion.div {...fadeUp} className="rounded-[32px] border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl md:p-8 dark:border-white/10 dark:bg-white/6">
            <p className="text-xs uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">faq</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl dark:text-white">{faqTitle}</h2>

            <div className="mt-8 space-y-3">
              {faqList.map(({ q, a }: any) => (
                <Collapsible key={q} open={openFaq === q} onOpenChange={(open) => setOpenFaq(open ? q : null)}>
                  <Card className="overflow-hidden rounded-[26px] border-slate-200/60 dark:border-white/10 bg-white/95 dark:bg-white/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/30">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-base font-semibold text-slate-900 transition-colors dark:text-white dark:hover:bg-white/6"
                        style={openFaq === q ? accentGlowStyle : undefined}
                      >
                        <span>{q}</span>
                        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${openFaq === q ? "rotate-180" : ""}`} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-slate-200/80 dark:border-white/12 px-5 pb-5 pt-4 text-sm leading-7 text-slate-600 dark:border-white/10 dark:text-slate-400">
                        {a}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          </motion.div>

          <motion.aside {...fadeUp} transition={{ duration: 0.6, ease: "easeOut", delay: 0.05 }} className="space-y-5">
            <div className="rounded-[32px] border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/6">
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">контакты</p>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">Нужна помощь или детали?</h3>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-400">
                Все ссылки и тексты здесь тоже управляются из админки, так что лендинг остаётся живой частью продукта, а не отдельной картинкой.
              </p>

              {lc.contacts ? (
                <div
                  className="prose prose-sm mt-5 max-w-none text-slate-600 dark:prose-invert dark:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: lc.contacts.replace(/\n/g, "<br />") }}
                />
              ) : (
                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">Контакты пока не заполнены в админке.</p>
              )}
            </div>

            <div className="rounded-[32px] border border-slate-200/60 dark:border-white/10 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-white/10" style={darkPanelStyle}>
              <p className="text-xs uppercase tracking-[0.32em]" style={{ color: withAlpha(accentTheme.tertiary, 0.8) }}>legal</p>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.04em]">Документы и прозрачность</h3>

              <div className="mt-6 flex flex-col gap-3">
                {lc.offerLink && (
                  <a
                    href={lc.offerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/12 bg-white/7 px-4 py-3 text-sm text-slate-100 transition-colors hover:bg-white/12"
                  >
                    Оферта
                  </a>
                )}
                {lc.privacyLink && (
                  <a
                    href={lc.privacyLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/12 bg-white/7 px-4 py-3 text-sm text-slate-100 transition-colors hover:bg-white/12"
                  >
                    Политика конфиденциальности
                  </a>
                )}
                {!lc.offerLink && !lc.privacyLink && (
                  <p className="text-sm text-slate-400">Юридические ссылки ещё не заполнены, но место под них уже готово.</p>
                )}
              </div>
            </div>
          </motion.aside>
        </section>
        )}

        {showCta && (
        <section className="container mx-auto px-4 pb-16 pt-2 md:pb-24">
          <motion.div
            {...fadeUp}
            className="relative overflow-hidden rounded-[38px] border border-slate-200/60 dark:border-white/10 px-6 py-8 text-white shadow-[0_30px_120px_rgba(15,23,42,0.22)] md:px-10 md:py-10"
            style={darkPanelStyle}
          >
            <div className="absolute -right-16 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full blur-3xl" style={{ backgroundColor: primarySoft }} />
            <div className="absolute left-10 top-0 h-28 w-28 rounded-full blur-3xl" style={{ backgroundColor: secondarySoft }} />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.34em]" style={{ color: withAlpha(accentTheme.tertiary, 0.75) }}>{lc?.readyToConnectEyebrow ?? "ready to connect"}</p>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-5xl">
                  {lc?.readyToConnectTitle ?? "Если честно — теперь это уже не \"лендинг\", а витрина продукта."}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                  {lc?.readyToConnectDesc ?? "Весь контент продолжает жить в админке, а визуально страница наконец ощущается как сервис, за который не стыдно брать деньги."}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                <Button className="h-13 rounded-full px-6 text-white" style={primaryButtonStyle} asChild>
                  <Link to={buildLink("/cabinet/register")}>{ctaText}</Link>
                </Button>
                <Button variant="outline" className="h-13 rounded-full border-white/20 bg-white/8 px-6 text-white hover:bg-white/12" asChild>
                  <Link to={buildLink("/cabinet/login")}>У меня уже есть аккаунт</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
        )}
      </main>

      <footer className="relative z-10 border-t border-slate-200/50 dark:border-white/10 bg-white/40 px-4 py-8 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/35">
        <div className="container mx-auto flex flex-col gap-4 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{config.serviceName || title}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {lc.footerText ? (
                <span dangerouslySetInnerHTML={{ __html: lc.footerText.replace(/\n/g, "<br />") }} />
              ) : (
                `© ${new Date().getFullYear()} ${config.serviceName || title}. Все права защищены.`
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-end">
            <Button variant="ghost" className="rounded-full text-slate-700 hover:bg-white/80 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10" asChild>
              <Link to={buildLink("/cabinet/login")}>{buttonLogin}</Link>
            </Button>
            <Button className="rounded-full text-white" style={primaryButtonStyle} asChild>
              <Link to={buildLink("/cabinet/register")}>{ctaText}</Link>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LandingPageWrapper() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPublicConfig()
      .then((cfg) => setConfig(cfg))
      .catch((err) => {
        console.error("Failed to load public config:", err);
        setConfig(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-slate-400">Загрузка...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-slate-400">Ошибка загрузки конфигурации</div>
      </div>
    );
  }

  return <LandingPage config={config} />;
}
