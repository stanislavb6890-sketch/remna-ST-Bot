import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { prisma } from "../../db.js";
import { env } from "../../config/index.js";

const SALT_ROUNDS = 12;

export type ClientTokenPayload = { clientId: string; type: "client_access" };
export type Client2FAPendingPayload = { clientId: string; type: "client_2fa_pending" };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signClientToken(clientId: string, expiresIn = "7d"): string {
  return jwt.sign(
    { clientId, type: "client_access" } as ClientTokenPayload,
    env.JWT_SECRET,
    { expiresIn } as jwt.SignOptions
  );
}

export function verifyClientToken(token: string): ClientTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as ClientTokenPayload;
    return decoded?.type === "client_access" ? decoded : null;
  } catch {
    return null;
  }
}

/** Временный токен для шага «ввод кода 2FA» после успешной проверки пароля/Telegram. Живёт 5 минут. */
export function signClient2FAPendingToken(clientId: string, expiresIn = "5m"): string {
  return jwt.sign(
    { clientId, type: "client_2fa_pending" } as Client2FAPendingPayload,
    env.JWT_SECRET,
    { expiresIn } as jwt.SignOptions
  );
}

export function verifyClient2FAPendingToken(token: string): Client2FAPendingPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as Client2FAPendingPayload;
    return decoded?.type === "client_2fa_pending" ? decoded : null;
  } catch {
    return null;
  }
}

export function generateReferralCode(): string {
  return "REF-" + randomBytes(4).toString("hex").toUpperCase();
}

const SYSTEM_CONFIG_KEYS = [
  "active_languages", "active_currencies", "default_language", "default_currency",
  "default_referral_percent", "referral_percent_level_2", "referral_percent_level_3",
  "trial_days", "trial_squad_uuid", "trial_device_limit", "trial_traffic_limit",
  "service_name", "logo", "logo_bot", "favicon", "remna_client_url",
  "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_password",
  "smtp_from_email", "smtp_from_name", "public_app_url",
  "telegram_bot_token", "telegram_bot_username", "bot_admin_telegram_ids",
  "notification_telegram_group_id", // Группа/чат для дублирования админских уведомлений (chat_id, например -1001234567890)
  "platega_merchant_id", "platega_secret", "platega_methods",
  "yoomoney_client_id", "yoomoney_client_secret", "yoomoney_receiver_wallet", "yoomoney_notification_secret",
  "yookassa_shop_id", "yookassa_secret_key",
  "cryptopay_api_token", "cryptopay_testnet",
  "heleket_merchant_id", "heleket_api_key",
  "bot_buttons", "bot_buttons_per_row", "bot_back_label", "bot_menu_texts", "bot_menu_line_visibility", "bot_inner_button_styles",
  "bot_tariffs_text", "bot_tariffs_fields", "bot_payment_text",
  "bot_emojis", // JSON: { "TRIAL": { "unicode": "🎁", "tgEmojiId": "..." }, "PACKAGE": ... } — эмодзи кнопок/текста, TG ID для премиум
  "category_emojis", // JSON: { "ordinary": "📦", "premium": "⭐" } — эмодзи категорий по коду
  "subscription_page_config",
  "support_link", "agreement_link", "offer_link", "instructions_link", // Поддержка: тех поддержка, соглашения, оферта, инструкции
  "tickets_enabled", // Тикет-система: true/false
  "admin_front_notifications_enabled", // Всплывающие уведомления в админке: true/false
  "theme_accent", // Глобальная цветовая тема: default, blue, violet, rose, orange, green, emerald, cyan, amber, red, pink, indigo
  "allow_user_theme_change", // Разрешить пользователям менять тему: true/false
  "force_subscribe_enabled", "force_subscribe_channel_id", "force_subscribe_message", // Принудительная подписка на канал/группу
  // Продажа опций: доп. трафик, доп. устройства, доп. серверы (сквады)
  "sell_options_enabled", "sell_options_traffic_enabled", "sell_options_traffic_products",
  "sell_options_devices_enabled", "sell_options_devices_products",
  "sell_options_servers_enabled", "sell_options_servers_products",
  "google_analytics_id", "yandex_metrika_id", // Маркетинг: счётчики для кабинета
  "auto_broadcast_cron", // Расписание авто-рассылки (cron, например "0 9 * * *" = 9:00 каждый день)
];

/** Продукт «Доп. трафик»: объём в ГБ, цена, валюта */
export type SellOptionTrafficProduct = { id: string; name: string; trafficGb: number; price: number; currency: string };
/** Продукт «Доп. устройства»: кол-во устройств, цена */
export type SellOptionDeviceProduct = { id: string; name: string; deviceCount: number; price: number; currency: string };
/** Продукт «Доп. сервер»: сквад Remna, опционально трафик (ГБ), цена */
export type SellOptionServerProduct = { id: string; name: string; squadUuid: string; trafficGb?: number; price: number; currency: string };

export type BotButtonConfig = { id: string; visible: boolean; label: string; order: number; style?: string; emojiKey?: string; onePerRow?: boolean };
export type BotEmojiEntry = { unicode?: string; tgEmojiId?: string };
export type BotEmojisConfig = Record<string, BotEmojiEntry>;
const DEFAULT_BOT_BUTTONS: BotButtonConfig[] = [
  { id: "tariffs", visible: true, label: "📦 Тарифы", order: 0, style: "success", emojiKey: "PACKAGE" },
  { id: "proxy", visible: true, label: "🌐 Прокси", order: 0.5, style: "primary", emojiKey: "SERVERS" },
  { id: "my_proxy", visible: true, label: "📋 Мои прокси", order: 0.6, style: "primary", emojiKey: "SERVERS" },
  { id: "singbox", visible: true, label: "🔑 Доступы", order: 0.55, style: "primary", emojiKey: "SERVERS" },
  { id: "my_singbox", visible: true, label: "📋 Мои доступы", order: 0.65, style: "primary", emojiKey: "SERVERS" },
  { id: "profile", visible: true, label: "👤 Профиль", order: 1, style: "", emojiKey: "PUZZLE" },
  { id: "devices", visible: true, label: "📱 Устройства", order: 1.5, style: "primary", emojiKey: "DEVICES" },
  { id: "topup", visible: true, label: "💳 Пополнить баланс", order: 2, style: "success", emojiKey: "CARD" },
  { id: "referral", visible: true, label: "🔗 Реферальная программа", order: 3, style: "primary", emojiKey: "LINK" },
  { id: "trial", visible: true, label: "🎁 Попробовать бесплатно", order: 4, style: "success", emojiKey: "TRIAL" },
  { id: "vpn", visible: true, label: "🌐 Подключиться к VPN", order: 5, style: "danger", emojiKey: "SERVERS", onePerRow: true },
  { id: "cabinet", visible: true, label: "🌐 Web Кабинет", order: 6, style: "primary", emojiKey: "SERVERS" },
  { id: "tickets", visible: true, label: "🎫 Тикеты", order: 6.5, style: "primary", emojiKey: "NOTE" },
  { id: "support", visible: true, label: "🆘 Поддержка", order: 7, style: "primary", emojiKey: "NOTE" },
  { id: "promocode", visible: true, label: "🎟️ Промокод", order: 8, style: "primary", emojiKey: "STAR" },
  { id: "extra_options", visible: true, label: "➕ Доп. опции", order: 9, style: "primary", emojiKey: "PACKAGE" },
];

export type BotMenuTexts = {
  welcomeTitlePrefix?: string;
  welcomeGreeting?: string;
  balancePrefix?: string;
  tariffPrefix?: string;
  subscriptionPrefix?: string;
  statusInactive?: string;
  statusActive?: string;
  statusExpired?: string;
  statusLimited?: string;
  statusDisabled?: string;
  expirePrefix?: string;
  daysLeftPrefix?: string;
  devicesLabel?: string;
  devicesAvailable?: string;
  trafficPrefix?: string;
  linkLabel?: string;
  chooseAction?: string;
};

const DEFAULT_BOT_MENU_TEXTS: Required<BotMenuTexts> = {
  welcomeTitlePrefix: "🛡 ",
  welcomeGreeting: "👋 Добро пожаловать в ",
  balancePrefix: "💰 Баланс: ",
  tariffPrefix: "💎 Ваш тариф : ",
  subscriptionPrefix: "{{CHART}} Статус подписки — ",
  statusInactive: "{{STATUS_INACTIVE}} Истекла",
  statusActive: "{{STATUS_ACTIVE}} Активна",
  statusExpired: "{{STATUS_EXPIRED}} Истекла",
  statusLimited: "{{STATUS_LIMITED}} Ограничена",
  statusDisabled: "{{STATUS_DISABLED}} Отключена",
  expirePrefix: "📅 до ",
  daysLeftPrefix: "⏰ осталось ",
  devicesLabel: "📱 Устройств: ",
  devicesAvailable: " доступно",
  trafficPrefix: "📈 Трафик — ",
  linkLabel: "🔗 Ссылка подключения:",
  chooseAction: "Выберите действие:",
};

export type BotTariffLineFields = {
  name?: boolean;
  durationDays?: boolean;
  price?: boolean;
  currency?: boolean;
  trafficLimit?: boolean;
  deviceLimit?: boolean;
};

const DEFAULT_BOT_TARIFFS_TEXT = "Тарифы\n\n{{CATEGORY}}\n{{TARIFFS}}\n\nВыберите тариф для оплаты:";
const DEFAULT_BOT_PAYMENT_TEXT = "Оплата: {{NAME}} — {{PRICE}}\n\n{{ACTION}}";

const DEFAULT_BOT_TARIFF_LINE_FIELDS: Required<BotTariffLineFields> = {
  name: true,
  durationDays: false,
  price: true,
  currency: true,
  trafficLimit: false,
  deviceLimit: false,
};

export type BotMenuLineVisibility = {
  welcomeTitlePrefix?: boolean;
  welcomeGreeting?: boolean;
  balancePrefix?: boolean;
  tariffPrefix?: boolean;
  subscriptionPrefix?: boolean;
  expirePrefix?: boolean;
  daysLeftPrefix?: boolean;
  devicesLabel?: boolean;
  trafficPrefix?: boolean;
  linkLabel?: boolean;
  chooseAction?: boolean;
};

const DEFAULT_BOT_MENU_LINE_VISIBILITY: Required<BotMenuLineVisibility> = {
  welcomeTitlePrefix: true,
  welcomeGreeting: true,
  balancePrefix: true,
  tariffPrefix: true,
  subscriptionPrefix: true,
  expirePrefix: true,
  daysLeftPrefix: true,
  devicesLabel: true,
  trafficPrefix: true,
  linkLabel: true,
  chooseAction: true,
};

export type BotInnerButtonStyles = {
  tariffPay?: string;
  topup?: string;
  back?: string;
  profile?: string;
  trialConfirm?: string;
  lang?: string;
  currency?: string;
};

const DEFAULT_BOT_INNER_BUTTON_STYLES: Required<BotInnerButtonStyles> = {
  tariffPay: "success",
  topup: "primary",
  back: "danger",
  profile: "primary",
  trialConfirm: "success",
  lang: "primary",
  currency: "primary",
};

function parseBotInnerButtonStyles(raw: string | undefined): Required<BotInnerButtonStyles> {
  if (!raw || !raw.trim()) return { ...DEFAULT_BOT_INNER_BUTTON_STYLES };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BOT_INNER_BUTTON_STYLES };
    const out = { ...DEFAULT_BOT_INNER_BUTTON_STYLES };
    for (const k of Object.keys(DEFAULT_BOT_INNER_BUTTON_STYLES) as (keyof BotInnerButtonStyles)[]) {
      if (typeof parsed[k] === "string" && ["primary", "success", "danger", ""].includes(parsed[k] as string)) {
        out[k] = parsed[k] as string; // сохраняем "" как «без стиля», не подменяем дефолтом
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_BOT_INNER_BUTTON_STYLES };
  }
}

function parseBotMenuTexts(raw: string | undefined): Required<BotMenuTexts> {
  if (!raw || !raw.trim()) return { ...DEFAULT_BOT_MENU_TEXTS };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BOT_MENU_TEXTS };
    const out = { ...DEFAULT_BOT_MENU_TEXTS };
    for (const k of Object.keys(DEFAULT_BOT_MENU_TEXTS) as (keyof BotMenuTexts)[]) {
      if (typeof parsed[k] === "string") out[k] = parsed[k] as string;
    }
    return out;
  } catch {
    return { ...DEFAULT_BOT_MENU_TEXTS };
  }
}

function parseBotTariffsText(raw: string | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT_BOT_TARIFFS_TEXT;
  return raw;
}

function parseBotPaymentText(raw: string | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT_BOT_PAYMENT_TEXT;
  return raw;
}

function parseBotTariffLineFields(raw: string | undefined): Required<BotTariffLineFields> {
  if (!raw || !raw.trim()) return { ...DEFAULT_BOT_TARIFF_LINE_FIELDS };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BOT_TARIFF_LINE_FIELDS };
    const out = { ...DEFAULT_BOT_TARIFF_LINE_FIELDS };
    for (const k of Object.keys(DEFAULT_BOT_TARIFF_LINE_FIELDS) as (keyof BotTariffLineFields)[]) {
      if (typeof parsed[k] === "boolean") out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULT_BOT_TARIFF_LINE_FIELDS };
  }
}

function parseBotMenuLineVisibility(raw: string | undefined): Required<BotMenuLineVisibility> {
  if (!raw || !raw.trim()) return { ...DEFAULT_BOT_MENU_LINE_VISIBILITY };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BOT_MENU_LINE_VISIBILITY };
    const out = { ...DEFAULT_BOT_MENU_LINE_VISIBILITY };
    for (const k of Object.keys(DEFAULT_BOT_MENU_LINE_VISIBILITY) as (keyof BotMenuLineVisibility)[]) {
      if (typeof parsed[k] === "boolean") out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULT_BOT_MENU_LINE_VISIBILITY };
  }
}

function parseBotButtons(raw: string | undefined): BotButtonConfig[] {
  if (!raw || !raw.trim()) return DEFAULT_BOT_BUTTONS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_BOT_BUTTONS;
    const result = parsed.map((x: unknown, i: number) => {
      const o = x as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : String(o.id ?? "button");
      const def = DEFAULT_BOT_BUTTONS.find((d) => d.id === id) ?? { label: id, order: i, style: "" as string };
      return {
        id,
        visible: typeof o.visible === "boolean" ? o.visible : true,
        label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : def.label,
        order: typeof o.order === "number" ? o.order : (typeof o.order === "string" ? parseFloat(o.order) : i),
        style: typeof o.style === "string" ? o.style : (def as BotButtonConfig).style ?? "",
        emojiKey: typeof o.emojiKey === "string" ? o.emojiKey.trim() : undefined,
        onePerRow: typeof o.onePerRow === "boolean" ? o.onePerRow : (def as BotButtonConfig).onePerRow,
      };
    });
    // Дополняем кнопками из дефолтов, которых нет в сохранённом списке
    const savedIds = new Set(result.map((b) => b.id));
    for (const def of DEFAULT_BOT_BUTTONS) {
      if (!savedIds.has(def.id)) {
        result.push({ id: def.id, visible: def.visible, label: def.label, order: def.order, style: def.style ?? "", emojiKey: undefined, onePerRow: def.onePerRow });
      }
    }
    return result;
  } catch {
    return DEFAULT_BOT_BUTTONS;
  }
}

function parseBotEmojis(raw: string | undefined): BotEmojisConfig {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: BotEmojisConfig = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val == null) continue;
      if (typeof val === "string" && val.trim()) {
        out[key] = { unicode: val.trim() };
        continue;
      }
      if (typeof val !== "object") continue;
      const v = val as Record<string, unknown>;
      const unicode = typeof v.unicode === "string" ? v.unicode.trim() : undefined;
      const tgEmojiId = typeof v.tgEmojiId === "string" ? v.tgEmojiId.trim() : (typeof v.tgEmojiId === "number" ? String(v.tgEmojiId) : undefined);
      if (unicode || tgEmojiId) out[key] = { unicode, tgEmojiId };
    }
    return out;
  } catch {
    return {};
  }
}

export async function getSystemConfig() {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: SYSTEM_CONFIG_KEYS } },
  });
  const map = Object.fromEntries(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
  const activeLangs = (map.active_languages || "ru,en").split(",").map((s: string) => s.trim());
  const activeCurrs = (map.active_currencies || "usd,rub").split(",").map((s: string) => s.trim());
  return {
    activeLanguages: activeLangs,
    activeCurrencies: activeCurrs,
    defaultLanguage: map.default_language && activeLangs.includes(map.default_language) ? map.default_language : activeLangs[0] ?? "ru",
    defaultCurrency: map.default_currency && activeCurrs.includes(map.default_currency) ? map.default_currency : activeCurrs[0] ?? "usd",
    defaultReferralPercent: parseFloat(map.default_referral_percent || "30"),
    referralPercentLevel2: parseFloat(map.referral_percent_level_2 || "10"),
    referralPercentLevel3: parseFloat(map.referral_percent_level_3 || "10"),
    trialDays: parseInt(map.trial_days || "3", 10),
    trialSquadUuid: map.trial_squad_uuid || null,
    trialDeviceLimit: map.trial_device_limit != null && map.trial_device_limit !== "" ? parseInt(map.trial_device_limit, 10) : null,
    trialTrafficLimitBytes: map.trial_traffic_limit != null && map.trial_traffic_limit !== "" ? parseInt(map.trial_traffic_limit, 10) : null,
    serviceName: map.service_name || "STEALTHNET",
    logo: map.logo || null,
    logoBot: map.logo_bot || null,
    favicon: map.favicon || null,
    remnaClientUrl: map.remna_client_url || null,
    smtpHost: map.smtp_host || null,
    smtpPort: map.smtp_port != null && map.smtp_port !== "" ? parseInt(map.smtp_port, 10) : 587,
    smtpSecure: map.smtp_secure === "true" || map.smtp_secure === "1",
    smtpUser: map.smtp_user || null,
    smtpPassword: map.smtp_password || null,
    smtpFromEmail: map.smtp_from_email || null,
    smtpFromName: map.smtp_from_name || null,
    publicAppUrl: map.public_app_url || null,
    telegramBotToken: map.telegram_bot_token || null,
    telegramBotUsername: map.telegram_bot_username || null,
    botAdminTelegramIds: parseBotAdminTelegramIds(map.bot_admin_telegram_ids),
    notificationTelegramGroupId: (map.notification_telegram_group_id ?? "").trim() || null,
    plategaMerchantId: map.platega_merchant_id || null,
    plategaSecret: map.platega_secret || null,
    plategaMethods: parsePlategaMethods(map.platega_methods),
    yoomoneyClientId: map.yoomoney_client_id || null,
    yoomoneyClientSecret: map.yoomoney_client_secret || null,
    yoomoneyReceiverWallet: map.yoomoney_receiver_wallet || null,
    yoomoneyNotificationSecret: map.yoomoney_notification_secret || null,
    yookassaShopId: map.yookassa_shop_id || null,
    yookassaSecretKey: map.yookassa_secret_key || null,
    cryptopayApiToken: (map.cryptopay_api_token ?? "").trim() || null,
    cryptopayTestnet: map.cryptopay_testnet === "true" || map.cryptopay_testnet === "1",
    heleketMerchantId: (map.heleket_merchant_id ?? "").trim() || null,
    heleketApiKey: (map.heleket_api_key ?? "").trim() || null,
    botButtons: parseBotButtons(map.bot_buttons),
    botButtonsPerRow: map.bot_buttons_per_row === "2" ? 2 : 1,
    botEmojis: parseBotEmojis(map.bot_emojis),
    botBackLabel: (map.bot_back_label || "◀️ В меню").trim() || "◀️ В меню",
    botMenuTexts: parseBotMenuTexts(map.bot_menu_texts),
    botMenuLineVisibility: parseBotMenuLineVisibility(map.bot_menu_line_visibility),
    botInnerButtonStyles: parseBotInnerButtonStyles(map.bot_inner_button_styles),
    botTariffsText: parseBotTariffsText(map.bot_tariffs_text),
    botTariffsFields: parseBotTariffLineFields(map.bot_tariffs_fields),
    botPaymentText: parseBotPaymentText(map.bot_payment_text),
    categoryEmojis: parseCategoryEmojis(map.category_emojis),
    subscriptionPageConfig: map.subscription_page_config ?? null,
    supportLink: (map.support_link ?? "").trim() || null,
    agreementLink: (map.agreement_link ?? "").trim() || null,
    offerLink: (map.offer_link ?? "").trim() || null,
    instructionsLink: (map.instructions_link ?? "").trim() || null,
    ticketsEnabled: map.tickets_enabled === "true" || map.tickets_enabled === "1",
    themeAccent: (map.theme_accent ?? "").trim() || "default",
    allowUserThemeChange: map.allow_user_theme_change === "true" || map.allow_user_theme_change === "1" || map.allow_user_theme_change == null,
    forceSubscribeEnabled: map.force_subscribe_enabled === "true" || map.force_subscribe_enabled === "1",
    forceSubscribeChannelId: (map.force_subscribe_channel_id ?? "").trim() || null,
    forceSubscribeMessage: (map.force_subscribe_message ?? "").trim() || null,
    sellOptionsEnabled: map.sell_options_enabled === "true" || map.sell_options_enabled === "1",
    sellOptionsTrafficEnabled: map.sell_options_traffic_enabled === "true" || map.sell_options_traffic_enabled === "1",
    sellOptionsTrafficProducts: parseSellOptionTrafficProducts(map.sell_options_traffic_products),
    sellOptionsDevicesEnabled: map.sell_options_devices_enabled === "true" || map.sell_options_devices_enabled === "1",
    sellOptionsDevicesProducts: parseSellOptionDeviceProducts(map.sell_options_devices_products),
    sellOptionsServersEnabled: map.sell_options_servers_enabled === "true" || map.sell_options_servers_enabled === "1",
    sellOptionsServersProducts: parseSellOptionServerProducts(map.sell_options_servers_products),
    googleAnalyticsId: (map.google_analytics_id ?? "").trim() || null,
    yandexMetrikaId: (map.yandex_metrika_id ?? "").trim() || null,
    autoBroadcastCron: (map.auto_broadcast_cron ?? "").trim() || null,
    adminFrontNotificationsEnabled: map.admin_front_notifications_enabled === "true" || map.admin_front_notifications_enabled === "1",
  };
}

export type CategoryEmojis = Record<string, string>;

function parseBotAdminTelegramIds(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x.trim())).map((x) => x.trim());
  } catch {
    return [];
  }
}

function parseCategoryEmojis(raw: string | undefined): CategoryEmojis {
  if (!raw || !raw.trim()) return { ordinary: "📦", premium: "⭐" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ordinary: "📦", premium: "⭐" };
    const out: CategoryEmojis = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    if (Object.keys(out).length === 0) return { ordinary: "📦", premium: "⭐" };
    return out;
  } catch {
    return { ordinary: "📦", premium: "⭐" };
  }
}

export type PlategaMethodConfig = { id: number; enabled: boolean; label: string };
const DEFAULT_PLATEGA_METHODS: PlategaMethodConfig[] = [
  { id: 2, enabled: true, label: "СПБ" },
  { id: 11, enabled: false, label: "Карты" },
  { id: 12, enabled: false, label: "Международный" },
  { id: 13, enabled: false, label: "Криптовалюта" },
];

function parsePlategaMethods(raw: string | undefined): PlategaMethodConfig[] {
  if (!raw || !raw.trim()) return DEFAULT_PLATEGA_METHODS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PLATEGA_METHODS;
    return parsed.map((m: unknown) => {
      const x = m as Record<string, unknown>;
      return {
        id: typeof x.id === "number" ? x.id : Number(x.id) || 2,
        enabled: Boolean(x.enabled),
        label: typeof x.label === "string" ? x.label : String(x.id),
      };
    });
  } catch {
    return DEFAULT_PLATEGA_METHODS;
  }
}

function parseSellOptionTrafficProducts(raw: string | undefined): SellOptionTrafficProduct[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x: unknown): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x, i) => ({
        id: typeof x.id === "string" ? x.id : `traffic_${i}`,
        name: typeof x.name === "string" ? x.name : `+${x.trafficGb ?? 0} ГБ`,
        trafficGb: typeof x.trafficGb === "number" ? x.trafficGb : Number(x.trafficGb) || 0,
        price: typeof x.price === "number" ? x.price : Number(x.price) || 0,
        currency: typeof x.currency === "string" ? x.currency : "rub",
      }))
      .filter((p) => p.trafficGb > 0 && p.price >= 0);
  } catch {
    return [];
  }
}

function parseSellOptionDeviceProducts(raw: string | undefined): SellOptionDeviceProduct[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x: unknown): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x, i) => ({
        id: typeof x.id === "string" ? x.id : `devices_${i}`,
        name: typeof x.name === "string" ? x.name : `+${x.deviceCount ?? 0} устр.`,
        deviceCount: typeof x.deviceCount === "number" ? x.deviceCount : Number(x.deviceCount) || 0,
        price: typeof x.price === "number" ? x.price : Number(x.price) || 0,
        currency: typeof x.currency === "string" ? x.currency : "rub",
      }))
      .filter((p) => p.deviceCount > 0 && p.price >= 0);
  } catch {
    return [];
  }
}

function parseSellOptionServerProducts(raw: string | undefined): SellOptionServerProduct[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x: unknown): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x, i) => ({
        id: typeof x.id === "string" ? x.id : `server_${i}`,
        name: typeof x.name === "string" ? x.name : "Доп. сервер",
        squadUuid: typeof x.squadUuid === "string" ? x.squadUuid : "",
        trafficGb: typeof x.trafficGb === "number" && x.trafficGb >= 0 ? x.trafficGb : (typeof x.trafficGb !== "undefined" ? Number(x.trafficGb) || 0 : 0),
        price: typeof x.price === "number" ? x.price : Number(x.price) || 0,
        currency: typeof x.currency === "string" ? x.currency : "rub",
      }))
      .filter((p) => p.squadUuid.length > 0 && p.price >= 0);
  } catch {
    return [];
  }
}

/** Кнопка для бота: label уже с эмодзи (Unicode) и опционально TG custom emoji ID для премиум-эмодзи. onePerRow = всегда в одну кнопку в ряд. */
export type PublicBotButton = { id: string; visible: boolean; label: string; order: number; style?: string; iconCustomEmojiId?: string; onePerRow?: boolean; emojiKey?: string };

function stripLeadingEmoji(label: string): string {
  return label.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");
}

/** Публичный конфиг для сайта/бота (без паролей и секретов). botButtons с подставленными эмодзи. */
export async function getPublicConfig() {
  const full = await getSystemConfig();
  const trialDays = full.trialDays ?? 0;
  const trialEnabled = trialDays > 0 && Boolean(full.trialSquadUuid?.trim());
  const botEmojis = full.botEmojis ?? {};
  const defaultEmojiKeyByButtonId: Record<string, string> = {
    trial: "TRIAL", tariffs: "PACKAGE", profile: "PUZZLE", topup: "CARD", referral: "LINK", vpn: "SERVERS", cabinet: "SERVERS",
    devices: "DEVICES", proxy: "SERVERS", my_proxy: "SERVERS", singbox: "SERVERS", my_singbox: "SERVERS",
    support: "NOTE", tickets: "NOTE", promocode: "STAR", extra_options: "PACKAGE",
  };
  const resolvedButtons: PublicBotButton[] = (full.botButtons ?? []).map((b) => {
    const emojiKey = b.emojiKey === "" ? null : (b.emojiKey ?? defaultEmojiKeyByButtonId[b.id]);
    const entry = emojiKey ? botEmojis[emojiKey] : undefined;
    let label = b.label;
    let iconCustomEmojiId: string | undefined;
    if (entry) {
      if (entry.tgEmojiId) {
        iconCustomEmojiId = entry.tgEmojiId;
        label = stripLeadingEmoji(label).trim();
      } else if (entry.unicode) {
        const base = stripLeadingEmoji(label).trim();
        label = (entry.unicode + " " + base).trim();
      }
    }
    return { id: b.id, visible: b.visible, label, order: b.order, style: b.style, iconCustomEmojiId, onePerRow: b.onePerRow, emojiKey: emojiKey ?? undefined };
  });

  const menuTexts = full.botMenuTexts ?? DEFAULT_BOT_MENU_TEXTS;
  const menuLineVisibility = full.botMenuLineVisibility ?? DEFAULT_BOT_MENU_LINE_VISIBILITY;
  const resolvedBotMenuTexts: Record<string, string> = {};
  const menuTextCustomEmojiIds: Record<string, string> = {};
  /** Дефолтный unicode по ключу эмодзи (для плейсхолдеров и для «премиум по ключу») */
  const emojiKeyFallbacks: Record<string, string> = {
    CHART: "📊",
    STATUS_ACTIVE: "🟡",
    STATUS_EXPIRED: "🔴",
    STATUS_INACTIVE: "🔴",
    STATUS_LIMITED: "🟡",
    STATUS_DISABLED: "🔴",
    HEADER: "🛡",
    MAIN_MENU: "👋",
    BALANCE: "💰",
    TARIFFS: "💎",
    PACKAGE: "📦",
    DATE: "📅",
    TIME: "⏰",
    DEVICES: "📱",
    TRAFFIC: "📈",
    LINK: "🔗",
  };
  /** Ключи строк меню → ключ эмодзи в botEmojis (как в админке: HEADER, BALANCE и т.д.) */
  const menuKeyToEmojiKey: Record<string, string> = {
    welcomeTitlePrefix: "HEADER",
    welcomeGreeting: "MAIN_MENU",
    balancePrefix: "BALANCE",
    tariffPrefix: "TARIFFS",
    subscriptionPrefix: "CHART",
    statusActive: "STATUS_ACTIVE",
    statusExpired: "STATUS_EXPIRED",
    statusInactive: "STATUS_INACTIVE",
    statusLimited: "STATUS_LIMITED",
    statusDisabled: "STATUS_DISABLED",
    expirePrefix: "DATE",
    daysLeftPrefix: "TIME",
    devicesLabel: "DEVICES",
    trafficPrefix: "TRAFFIC",
    linkLabel: "LINK",
  };
  for (const [k, v] of Object.entries(menuTexts)) {
    let s = String(v ?? "");
    for (const [ek, ev] of Object.entries(botEmojis)) {
      const placeholder = "{{" + ek + "}}";
      if (s.includes(placeholder)) {
        const repl = (ev.unicode ?? "").trim() || (emojiKeyFallbacks[ek] ?? "");
        s = s.split(placeholder).join(repl).trim();
      }
    }
    for (const [pk, pv] of Object.entries(emojiKeyFallbacks)) {
      const placeholder = "{{" + pk + "}}";
      if (s.includes(placeholder)) s = s.split(placeholder).join(pv).trim();
    }
    resolvedBotMenuTexts[k] = s;
    // Если строка начинается с unicode эмодзи, у которого есть tgEmojiId — передаём ID для entities
    for (const [ek, ev] of Object.entries(botEmojis)) {
      if (ev.tgEmojiId && ev.unicode && s.startsWith(ev.unicode)) {
        menuTextCustomEmojiIds[k] = ev.tgEmojiId;
        break;
      }
    }
    // Премиум по ключу: для этой строки задан emojiKey (HEADER, BALANCE и т.д.) — подставляем tgEmojiId из botEmojis
    const emojiKey = menuKeyToEmojiKey[k];
    if (!menuTextCustomEmojiIds[k] && emojiKey && botEmojis[emojiKey]?.tgEmojiId) {
      const fallback = emojiKeyFallbacks[emojiKey];
      const unicode = botEmojis[emojiKey].unicode?.trim();
      if (fallback && s.startsWith(fallback)) menuTextCustomEmojiIds[k] = botEmojis[emojiKey].tgEmojiId!;
      else if (unicode && s.startsWith(unicode)) menuTextCustomEmojiIds[k] = botEmojis[emojiKey].tgEmojiId!;
    }
  }

  return {
    activeLanguages: full.activeLanguages,
    activeCurrencies: full.activeCurrencies,
    defaultLanguage: full.defaultLanguage,
    defaultCurrency: full.defaultCurrency,
    serviceName: full.serviceName,
    logo: full.logo,
    logoBot: full.logoBot ?? null,
    favicon: full.favicon,
    remnaClientUrl: full.remnaClientUrl,
    publicAppUrl: full.publicAppUrl,
    telegramBotUsername: full.telegramBotUsername,
    botAdminTelegramIds: full.botAdminTelegramIds ?? [],
    plategaMethods: full.plategaMethods.filter((m) => m.enabled).map((m) => ({ id: m.id, label: m.label })),
    yoomoneyEnabled: Boolean(full.yoomoneyReceiverWallet?.trim()),
    yookassaEnabled: Boolean(full.yookassaShopId?.trim() && full.yookassaSecretKey?.trim()),
    cryptopayEnabled: Boolean((full as { cryptopayApiToken?: string | null }).cryptopayApiToken?.trim()),
    heleketEnabled: Boolean((full as { heleketMerchantId?: string | null }).heleketMerchantId?.trim() && (full as { heleketApiKey?: string | null }).heleketApiKey?.trim()),
    trialEnabled,
    trialDays,
    botButtons: resolvedButtons,
    botButtonsPerRow: full.botButtonsPerRow ?? 1,
    botBackLabel: full.botBackLabel,
    botMenuTexts: menuTexts,
    botMenuLineVisibility: menuLineVisibility,
    resolvedBotMenuTexts,
    menuTextCustomEmojiIds,
    botEmojis,
    botInnerButtonStyles: full.botInnerButtonStyles ?? DEFAULT_BOT_INNER_BUTTON_STYLES,
    botTariffsText: full.botTariffsText ?? DEFAULT_BOT_TARIFFS_TEXT,
    botTariffsFields: full.botTariffsFields ?? DEFAULT_BOT_TARIFF_LINE_FIELDS,
    botPaymentText: full.botPaymentText ?? DEFAULT_BOT_PAYMENT_TEXT,
    categoryEmojis: full.categoryEmojis,
    defaultReferralPercent: full.defaultReferralPercent ?? 0,
    referralPercentLevel2: full.referralPercentLevel2 ?? 0,
    referralPercentLevel3: full.referralPercentLevel3 ?? 0,
    supportLink: full.supportLink ?? null,
    agreementLink: full.agreementLink ?? null,
    offerLink: full.offerLink ?? null,
    instructionsLink: full.instructionsLink ?? null,
    ticketsEnabled: (full as { ticketsEnabled?: boolean }).ticketsEnabled ?? false,
    themeAccent: full.themeAccent ?? "default",
    allowUserThemeChange: (full as any).allowUserThemeChange ?? true,
    googleAnalyticsId: full.googleAnalyticsId ?? null,
    yandexMetrikaId: full.yandexMetrikaId ?? null,
    forceSubscribeEnabled: full.forceSubscribeEnabled ?? false,
    forceSubscribeChannelId: full.forceSubscribeChannelId ?? null,
    forceSubscribeMessage: full.forceSubscribeMessage ?? null,
    showProxyEnabled: await prisma.proxyTariff.count({ where: { enabled: true } }).then((n) => n > 0),
    showSingboxEnabled: await prisma.singboxTariff.count({ where: { enabled: true } }).then((n) => n > 0),
    sellOptionsEnabled: (() => {
      const so = full as { sellOptionsEnabled?: boolean; sellOptionsTrafficEnabled?: boolean; sellOptionsTrafficProducts?: unknown[]; sellOptionsDevicesEnabled?: boolean; sellOptionsDevicesProducts?: unknown[]; sellOptionsServersEnabled?: boolean; sellOptionsServersProducts?: unknown[] };
      if (so.sellOptionsEnabled !== true) return false;
      const hasTraffic = so.sellOptionsTrafficEnabled && (so.sellOptionsTrafficProducts?.length ?? 0) > 0;
      const hasDevices = so.sellOptionsDevicesEnabled && (so.sellOptionsDevicesProducts?.length ?? 0) > 0;
      const hasServers = so.sellOptionsServersEnabled && (so.sellOptionsServersProducts?.length ?? 0) > 0;
      return hasTraffic || hasDevices || hasServers;
    })(),
    sellOptions: (() => {
      const so = full as {
        sellOptionsEnabled?: boolean;
        sellOptionsTrafficEnabled?: boolean;
        sellOptionsTrafficProducts?: SellOptionTrafficProduct[];
        sellOptionsDevicesEnabled?: boolean;
        sellOptionsDevicesProducts?: SellOptionDeviceProduct[];
        sellOptionsServersEnabled?: boolean;
        sellOptionsServersProducts?: SellOptionServerProduct[];
      };
      if (!so.sellOptionsEnabled) return [];
      const out: Array<
        { kind: "traffic"; id: string; name: string; trafficGb: number; price: number; currency: string } |
        { kind: "devices"; id: string; name: string; deviceCount: number; price: number; currency: string } |
        { kind: "servers"; id: string; name: string; squadUuid: string; trafficGb: number; price: number; currency: string }
      > = [];
      if (so.sellOptionsTrafficEnabled && so.sellOptionsTrafficProducts?.length) {
        for (const p of so.sellOptionsTrafficProducts) {
          out.push({ kind: "traffic", id: p.id, name: p.name, trafficGb: p.trafficGb, price: p.price, currency: p.currency });
        }
      }
      if (so.sellOptionsDevicesEnabled && so.sellOptionsDevicesProducts?.length) {
        for (const p of so.sellOptionsDevicesProducts) {
          out.push({ kind: "devices", id: p.id, name: p.name, deviceCount: p.deviceCount, price: p.price, currency: p.currency });
        }
      }
      if (so.sellOptionsServersEnabled && so.sellOptionsServersProducts?.length) {
        for (const p of so.sellOptionsServersProducts) {
          out.push({ kind: "servers", id: p.id, name: p.name, squadUuid: p.squadUuid, trafficGb: p.trafficGb ?? 0, price: p.price, currency: p.currency });
        }
      }
      return out;
    })(),
  };
}
