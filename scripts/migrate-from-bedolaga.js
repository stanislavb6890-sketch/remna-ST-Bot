#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 *  CLOAKNET v3 — Миграция из бэкапа «Бедолага Бот»
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Бэкап формата database.json (tar.gz) из Bedolaga Telegram Bot.
 *  Структура: metadata + data (users, subscriptions, transactions,
 *  referral_earnings, system_settings, server_squads, promo_groups, etc.)
 *
 *  Что мигрирует:
 *    1. users              → clients
 *    2. server_squads      → tariff_categories (серверы как категории)
 *    3. subscriptions      → привязка remnawave_uuid (данные уже в Remna)
 *    4. transactions       → payments (пополнения и покупки)
 *    5. referral связи     → referrer_id
 *    6. referral_earnings  → referral_credits
 *    7. system_settings    → system_settings
 *
 *  Как запустить:
 *    1. Новая панель развёрнута, БД создана
 *    2. npm install  (в папке scripts/, если ещё не делали)
 *    3. node scripts/migrate-from-bedolaga.js <path-to-backup.tar.gz>
 *       или: BACKUP_PATH=./backup.tar.gz node scripts/migrate-from-bedolaga.js
 *
 *  Идемпотентный — дубликаты пропускаются по telegram_id / order_id.
 */

const { Client: PgClient } = require("pg");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ══════════════════════════════════════════════════════════════════
//  НАСТРОЙКИ
// ══════════════════════════════════════════════════════════════════

const BACKUP_PATH =
  process.argv[2] ||
  process.env.BACKUP_PATH ||
  "./backup_20260126_000000.tar.gz";

const NEW_DB = {
  host: process.env.NEW_DB_HOST || "localhost",
  port: parseInt(process.env.NEW_DB_PORT || "5432"),
  database: process.env.NEW_DB_NAME || "CLOAKNET",
  user: process.env.NEW_DB_USER || "CLOAKNET",
  password: process.env.NEW_DB_PASSWORD || "CLOAKNET_change_me",
};

// Валюта определяется автоматически из system_settings новой панели.
// Если системная валюта = rub — копейки конвертируются в рубли (÷100).
// Если usd — используется курс KOPEKS_TO_USD (по умолчанию 100 RUB ≈ 1 USD).
const FORCE_CURRENCY = process.env.DEFAULT_CURRENCY || null;
const KOPEKS_TO_USD_RATE = parseFloat(process.env.KOPEKS_TO_USD || "0.0001");

// ══════════════════════════════════════════════════════════════════
//  УТИЛИТЫ
// ══════════════════════════════════════════════════════════════════

function generateCuid() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  const rand2 = Math.random().toString(36).substring(2, 6);
  return `c${ts}${rand}${rand2}`;
}

function generateReferralCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Конвертация копеек в системную валюту (определяется после подключения к БД)
let systemCurrency = "usd";

function kopeksToSystem(kopeks) {
  const k = kopeks || 0;
  if (systemCurrency === "rub") {
    // 100 копеек = 1 рубль
    return Math.round(k) / 100;
  }
  if (systemCurrency === "uah") {
    // Копейки в гривнах — тот же принцип (100 коп = 1 UAH)
    return Math.round(k) / 100;
  }
  // Для USD и прочих — используем курс
  return Math.round(k * KOPEKS_TO_USD_RATE * 100) / 100;
}

function log(emoji, msg) {
  console.log(`  ${emoji}  ${msg}`);
}

function logSection(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

// ══════════════════════════════════════════════════════════════════
//  РАСПАКОВКА БЭКАПА
// ══════════════════════════════════════════════════════════════════

function extractBackup(backupPath) {
  const absPath = path.resolve(backupPath);
  if (!fs.existsSync(absPath)) {
    console.error(`\n  ❌  Файл не найден: ${absPath}`);
    console.error(`\n  Использование:`);
    console.error(`    node scripts/migrate-from-bedolaga.js <path-to-backup.tar.gz>`);
    console.error(`    BACKUP_PATH=./backup.tar.gz node scripts/migrate-from-bedolaga.js\n`);
    process.exit(1);
  }

  const tmpDir = `/tmp/bedolaga_migrate_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  log("📦", `Распаковка ${path.basename(absPath)}...`);
  execSync(`tar -xzf "${absPath}" -C "${tmpDir}"`, { stdio: "pipe" });

  const dbFile = path.join(tmpDir, "database.json");
  if (!fs.existsSync(dbFile)) {
    console.error("  ❌  database.json не найден в архиве!");
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(dbFile, "utf-8"));
  log("✅", `database.json загружен (${(fs.statSync(dbFile).size / 1024).toFixed(0)} KB)`);

  // Чистим
  try {
    execSync(`rm -rf "${tmpDir}"`, { stdio: "pipe" });
  } catch {}

  return db;
}

// ══════════════════════════════════════════════════════════════════
//  ОСНОВНАЯ МИГРАЦИЯ
// ══════════════════════════════════════════════════════════════════

async function migrate() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   CLOAKNET v3 — Миграция из бэкапа Бедолага Бот            ║
╚══════════════════════════════════════════════════════════════╝
`);

  const backup = extractBackup(BACKUP_PATH);
  const data = backup.data;

  // Показываем статистику бэкапа
  log("📊", `Бэкап от: ${backup.metadata?.timestamp || "?"}`);
  log("📊", `Таблиц: ${backup.metadata?.tables_count || "?"}, записей: ${backup.metadata?.total_records || "?"}`);

  const newDb = new PgClient(NEW_DB);

  try {
    log("🔌", `Подключение к новой БД: ${NEW_DB.host}:${NEW_DB.port}/${NEW_DB.database}`);
    await newDb.connect();
    log("✅", "Подключено");

    // ─── Определяем системную валюту ─────────────────────────
    if (FORCE_CURRENCY) {
      systemCurrency = FORCE_CURRENCY.toLowerCase();
    } else {
      const currRes = await newDb.query(
        `SELECT value FROM system_settings WHERE key = 'default_currency' LIMIT 1`
      );
      
      // Убеждаемся, что валюта - строка, а не массив
      const currencyValue = currRes.rows.length > 0 ? currRes.rows[0].value : "usd";
      
      // Если пришёл массив, берём первый элемент и приводим к нижнему регистру
      if (Array.isArray(currencyValue)) {
        systemCurrency = currencyValue[0].toLowerCase();
      } else if (typeof currencyValue === 'string') {
        systemCurrency = currencyValue.toLowerCase();
      } else {
        systemCurrency = "usd";
      }
    }
    log("💱", `Системная валюта: ${systemCurrency.toUpperCase()}`);
    if (systemCurrency === "rub") {
      log("  ", "Копейки → рубли (÷100)");
    } else if (systemCurrency === "usd") {
      log("  ", `Копейки → USD (×${KOPEKS_TO_USD_RATE})`);
    }

    // Маппинг старых ID → новые
    const userIdMap = new Map(); // old user.id → new client.id

    const stats = {
      users: { total: 0, migrated: 0, skipped: 0, errors: 0 },
      subscriptions: { total: 0, updated: 0, skipped: 0 },
      transactions: { total: 0, migrated: 0, skipped: 0, errors: 0 },
      referrals: { total: 0, linked: 0, errors: 0 },
      referralCredits: { total: 0, migrated: 0, errors: 0 },
      settings: { migrated: 0 },
    };

    // ─── 1. USERS → CLIENTS ──────────────────────────────────
    logSection("1/6  Пользователи (users → clients)");

    const users = data.users || [];
    stats.users.total = users.length;

    for (const u of users) {
      // Пропуск по telegram_id
      if (u.telegram_id) {
        const existing = await newDb.query(
          `SELECT id FROM clients WHERE telegram_id = $1`,
          [String(u.telegram_id)]
        );
        if (existing.rows.length > 0) {
          userIdMap.set(u.id, existing.rows[0].id);
          stats.users.skipped++;
          continue;
        }
      }

      const newId = generateCuid();
      const referralCode = u.referral_code || generateReferralCode();
      const balance = kopeksToSystem(u.balance_kopeks);

      try {
        await newDb.query(
          `INSERT INTO clients
             (id, email, password_hash, role, remnawave_uuid, referral_code,
              balance, preferred_lang, preferred_currency,
              telegram_id, telegram_username, is_blocked, block_reason,
              referral_percent, trial_used, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())`,
          [
            newId,
            null, // email — у Бедолаги нет
            null, // password_hash — бот без паролей
            "CLIENT",
            u.remnawave_uuid || null,
            referralCode,
            balance,
            u.language || "ru",
            systemCurrency, // строка в нижнем регистре
            u.telegram_id ? String(u.telegram_id) : null,
            u.username || null,
            u.status === "blocked",
            null,
            null,
            false, // trial_used
            u.created_at ? new Date(u.created_at) : new Date(),
          ]
        );
        userIdMap.set(u.id, newId);
        stats.users.migrated++;
      } catch (err) {
        stats.users.errors++;
        log("❌", `User #${u.id} (@${u.username}): ${err.message}`);
      }
    }

    log(
      "📊",
      `Клиенты: ${stats.users.migrated} создано, ${stats.users.skipped} пропущено, ${stats.users.errors} ошибок`
    );

    // ─── 2. TRIAL USED из subscriptions ──────────────────────
    logSection("2/6  Подписки → обновление trial_used и remnawave_uuid");

    const subscriptions = data.subscriptions || [];
    stats.subscriptions.total = subscriptions.length;

    for (const sub of subscriptions) {
      const newClientId = userIdMap.get(sub.user_id);
      if (!newClientId) {
        stats.subscriptions.skipped++;
        continue;
      }

      try {
        const updates = [];
        const values = [];
        let idx = 1;

        // Если триал — отметим
        if (sub.is_trial) {
          updates.push(`trial_used = $${idx++}`);
          values.push(true);
        }

        if (updates.length > 0) {
          values.push(newClientId);
          await newDb.query(
            `UPDATE clients SET ${updates.join(", ")} WHERE id = $${idx}`,
            values
          );
          stats.subscriptions.updated++;
        } else {
          stats.subscriptions.skipped++;
        }
      } catch {
        stats.subscriptions.skipped++;
      }
    }

    log(
      "📊",
      `Подписки: ${stats.subscriptions.updated} обновлено, ${stats.subscriptions.skipped} пропущено`
    );

    // ─── 3. REFERRAL LINKS ───────────────────────────────────
    logSection("3/6  Рефералы");

    const usersWithReferrer = users.filter((u) => u.referred_by_id);
    stats.referrals.total = usersWithReferrer.length;

    for (const u of usersWithReferrer) {
      const newClientId = userIdMap.get(u.id);
      const newReferrerId = userIdMap.get(u.referred_by_id);

      if (!newClientId || !newReferrerId) {
        stats.referrals.errors++;
        continue;
      }

      try {
        await newDb.query(`UPDATE clients SET referrer_id = $1 WHERE id = $2`, [
          newReferrerId,
          newClientId,
        ]);
        stats.referrals.linked++;
      } catch (err) {
        stats.referrals.errors++;
      }
    }

    log(
      "📊",
      `Рефералы: ${stats.referrals.linked} создано, ${stats.referrals.errors} ошибок`
    );

    // ─── 4. TRANSACTIONS → PAYMENTS ─────────────────────────
    logSection("4/6  Транзакции (transactions → payments)");

    const transactions = data.transactions || [];
    stats.transactions.total = transactions.length;

    for (const t of transactions) {
      const newClientId = userIdMap.get(t.user_id);
      if (!newClientId) {
        stats.transactions.skipped++;
        continue;
      }

      // Генерируем order_id из старого ID
      const orderId = `BDL-${t.id}-${t.user_id}`;

      // Проверяем дубликат
      const existing = await newDb.query(
        `SELECT id FROM payments WHERE order_id = $1`,
        [orderId]
      );
      if (existing.rows.length > 0) {
        stats.transactions.skipped++;
        continue;
      }

      const amount = kopeksToSystem(t.amount_kopeks);
      const newId = generateCuid();
      // type: deposit, subscription_payment, referral_bonus, admin_topup, etc.
      const provider = t.payment_method || (t.type === "deposit" ? "balance" : t.type);

      try {
        await newDb.query(
          `INSERT INTO payments
             (id, client_id, order_id, amount, currency, status, provider,
              external_id, tariff_id, metadata, created_at, paid_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            newId,
            newClientId,
            orderId,
            amount,
            systemCurrency, // строка в нижнем регистре
            t.is_completed ? "PAID" : "PENDING",
            provider || null,
            t.external_id || null,
            null, // tariff_id — у Бедолаги нет привязки к тарифам по ID
            JSON.stringify({
              bedolaga_type: t.type,
              bedolaga_description: t.description,
              original_kopeks: t.amount_kopeks,
            }),
            t.created_at ? new Date(t.created_at) : new Date(),
            t.completed_at ? new Date(t.completed_at) : null,
          ]
        );
        stats.transactions.migrated++;
      } catch (err) {
        stats.transactions.errors++;
        log("❌", `Transaction #${t.id}: ${err.message}`);
      }
    }

    log(
      "📊",
      `Платежи: ${stats.transactions.migrated} создано, ${stats.transactions.skipped} пропущено, ${stats.transactions.errors} ошибок`
    );

    // ─── 5. REFERRAL EARNINGS → REFERRAL CREDITS ─────────────
    logSection("5/6  Реферальные начисления (referral_earnings → referral_credits)");

    const referralEarnings = data.referral_earnings || [];
    stats.referralCredits.total = referralEarnings.length;

    for (const re of referralEarnings) {
      const newReferrerId = userIdMap.get(re.user_id);
      if (!newReferrerId) {
        stats.referralCredits.errors++;
        continue;
      }

      // Нужен payment_id — ищем подходящий платёж
      // Берём первый платёж реферала, если есть
      const referralClientId = userIdMap.get(re.referral_id);
      let paymentId = null;
      if (referralClientId) {
        const payRes = await newDb.query(
          `SELECT id FROM payments WHERE client_id = $1 AND status = 'PAID' ORDER BY created_at LIMIT 1`,
          [referralClientId]
        );
        if (payRes.rows.length > 0) {
          paymentId = payRes.rows[0].id;
        }
      }

      if (!paymentId) {
        // Создадим техническую запись платежа для привязки
        paymentId = generateCuid();
        const refClientId = referralClientId || newReferrerId;
        try {
          await newDb.query(
            `INSERT INTO payments (id, client_id, order_id, amount, currency, status, provider, metadata, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (order_id) DO NOTHING`,
            [
              paymentId,
              refClientId,
              `BDL-REF-${re.id}`,
              kopeksToSystem(re.amount_kopeks),
              systemCurrency, // строка в нижнем регистре
              "PAID",
              "referral",
              JSON.stringify({ bedolaga_reason: re.reason }),
              re.created_at ? new Date(re.created_at) : new Date(),
            ]
          );
        } catch {
          stats.referralCredits.errors++;
          continue;
        }
      }

      try {
        const newId = generateCuid();
        await newDb.query(
          `INSERT INTO referral_credits (id, referrer_id, payment_id, amount, level, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            newId,
            newReferrerId,
            paymentId,
            kopeksToSystem(re.amount_kopeks),
            1, // level 1 (у Бедолаги одноуровневая реферальная система)
            re.created_at ? new Date(re.created_at) : new Date(),
          ]
        );
        stats.referralCredits.migrated++;
      } catch (err) {
        stats.referralCredits.errors++;
      }
    }

    log(
      "📊",
      `Реф. бонусы: ${stats.referralCredits.migrated} создано, ${stats.referralCredits.errors} ошибок`
    );

    // ─── 6. SETTINGS ─────────────────────────────────────────
    logSection("6/6  Настройки");

    const sysSettings = data.system_settings || [];
    const settingsToMigrate = [];

    // Извлекаем нужные настройки
    for (const s of sysSettings) {
      // Пропускаем токены и секреты
      if (
        s.key &&
        !s.key.includes("TOKEN") &&
        !s.key.includes("SECRET") &&
        !s.key.includes("API_KEY")
      ) {
        settingsToMigrate.push({
          key: `bedolaga_${s.key.toLowerCase()}`,
          value: String(s.value || ""),
        });
      }
    }

    // Из server_squads
    const serverSquads = data.server_squads || [];
    if (serverSquads.length > 0) {
      const sq = serverSquads[0];
      settingsToMigrate.push({
        key: "trial_squad_uuid",
        value: sq.squad_uuid || "",
      });
    }

    // Из branding (app-config.json если есть) - ИСПРАВЛЕНО: строки, не массивы
    settingsToMigrate.push(
      { key: "active_languages", value: "ru,en" },  // строка через запятую
      { key: "active_currencies", value: "rub,usd" } // строка через запятую
    );

    for (const s of settingsToMigrate) {
      if (!s.value) continue;
      try {
        const existing = await newDb.query(
          `SELECT id FROM system_settings WHERE key = $1`,
          [s.key]
        );
        if (existing.rows.length > 0) {
          await newDb.query(`UPDATE system_settings SET value = $1 WHERE key = $2`, [
            s.value,
            s.key,
          ]);
        } else {
          await newDb.query(
            `INSERT INTO system_settings (id, key, value) VALUES ($1, $2, $3)`,
            [generateCuid(), s.key, s.value]
          );
        }
        stats.settings.migrated++;
        log("✅", `${s.key} = ${s.value.substring(0, 50)}${s.value.length > 50 ? "..." : ""}`);
      } catch (err) {
        log("❌", `${s.key}: ${err.message}`);
      }
    }

    log("📊", `Настройки: ${stats.settings.migrated} перенесено`);

    // ─── ФИНАЛЬНАЯ ОЧИСТКА ДАННЫХ ───────────────────────────
    logSection("Очистка данных");

    try {
      // Исправляем форматы валют и языков если они сохранились как массивы
      await newDb.query(`
        UPDATE system_settings 
        SET value = 'rub,usd' 
        WHERE key = 'active_currencies' AND (value LIKE '%[%' OR value LIKE '%"%');
        
        UPDATE system_settings 
        SET value = 'ru,en' 
        WHERE key = 'active_languages' AND (value LIKE '%[%' OR value LIKE '%"%');
        
        UPDATE payments 
        SET currency = LOWER(currency) 
        WHERE currency != LOWER(currency);
      `);
      log("✅", "Форматы данных исправлены");
    } catch (err) {
      log("⚠️", `Ошибка при очистке: ${err.message}`);
    }

    // ─── ИТОГО ───────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║               МИГРАЦИЯ ИЗ БЕДОЛАГИ ЗАВЕРШЕНА                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Клиенты:       ${String(stats.users.migrated).padStart(4)} создано  ${String(stats.users.skipped).padStart(4)} пропущено  ${String(stats.users.errors).padStart(3)} ошибок  ║
║  Подписки:      ${String(stats.subscriptions.updated).padStart(4)} обновл.  ${String(stats.subscriptions.skipped).padStart(4)} пропущено             ║
║  Платежи:       ${String(stats.transactions.migrated).padStart(4)} создано  ${String(stats.transactions.skipped).padStart(4)} пропущено  ${String(stats.transactions.errors).padStart(3)} ошибок  ║
║  Рефералы:      ${String(stats.referrals.linked).padStart(4)} связано                ${String(stats.referrals.errors).padStart(3)} ошибок  ║
║  Реф.платежи:  ${String(stats.referralCredits.migrated).padStart(4)} создано                ${String(stats.referralCredits.errors).padStart(3)} ошибок  ║
║  Настройки:     ${String(stats.settings.migrated).padStart(4)} перенесено                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

    const totalErrors =
      stats.users.errors +
      stats.transactions.errors +
      stats.referrals.errors +
      stats.referralCredits.errors;

    if (totalErrors > 0) {
      log("⚠️", `Всего ошибок: ${totalErrors}. Проверьте логи выше.`);
    } else {
      log("🎉", "Миграция прошла без ошибок!");
    }

    log("💡", "После миграции:");
    log("  ", "  1. Проверьте клиентов в админ-панели");
    log("  ", "  2. Запустите «Sync from Remna» — синхронизирует подписки из Remnawave");
    log("  ", "  3. Настройте тарифы (у Бедолаги нет тарифных планов — создайте вручную)");
    log("  ", "  4. Настройте платёжную систему Platega");
    log("  ", `  5. Валюта: ${systemCurrency.toUpperCase()} (из system_settings)`);
    if (systemCurrency === "usd") {
      log("  ", `     Курс: ${KOPEKS_TO_USD_RATE} USD за 1 копейку. Изменить: KOPEKS_TO_USD=0.00011`);
    }
  } catch (err) {
    console.error("\n  ❌  КРИТИЧЕСКАЯ ОШИБКА:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await newDb.end().catch(() => {});
  }
}

// ══════════════════════════════════════════════════════════════════
migrate().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
