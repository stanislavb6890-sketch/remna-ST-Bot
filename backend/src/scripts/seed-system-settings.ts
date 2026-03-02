import { prisma } from "../db.js";

const DEFAULTS: Array<[string, string]> = [
  ["active_languages", "ru,en"],
  ["active_currencies", "usd,rub"],
  ["default_referral_percent", "10"],
  ["trial_days", "3"],
  ["service_name", "STEALTHNET"],
  [
    "bot_inner_button_styles",
    '{"tariffPay":"success","topup":"primary","back":"danger","profile":"primary","trialConfirm":"success","lang":"primary","currency":"primary"}',
  ],
  ["category_emojis", '{"ordinary":"📦","premium":"⭐"}'],
  [
    "bot_emojis",
    '{"TRIAL":{"unicode":"🎁"},"PACKAGE":{"unicode":"📦"},"CARD":{"unicode":"💳"},"LINK":{"unicode":"🔗"},"SERVERS":{"unicode":"🌐"},"PUZZLE":{"unicode":"🧩"},"BACK":{"unicode":"◀️"},"MAIN_MENU":{"unicode":"👋"},"BALANCE":{"unicode":"💰"},"TARIFFS":{"unicode":"📦"},"HEADER":{"unicode":"🛡"}}',
  ],
  [
    "bot_menu_line_visibility",
    '{"welcomeTitlePrefix":true,"welcomeGreeting":true,"balancePrefix":true,"tariffPrefix":true,"subscriptionPrefix":true,"expirePrefix":true,"daysLeftPrefix":true,"devicesLabel":true,"trafficPrefix":true,"linkLabel":true,"chooseAction":true}',
  ],
];

export async function ensureSystemSettings() {
  for (const [key, value] of DEFAULTS) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
}
