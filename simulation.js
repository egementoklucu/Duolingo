(function (global) {
  "use strict";

  const VERSION = 1;
  const CURRENCIES = {
    TRY: { code: "TRY", label: "TL", symbol: "₺", locale: "tr-TR" },
    USD: { code: "USD", label: "Dolar", symbol: "$", locale: "en-US" },
    EUR: { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE" }
  };
  const BASE_COSTS = {
    TRY: { eat: 240, drink: 35, fun: 300, healthcare: 750 },
    USD: { eat: 8, drink: 1, fun: 10, healthcare: 25 },
    EUR: { eat: 7, drink: 1, fun: 9, healthcare: 23 }
  };
  const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const VALID_TIME_UNITS = ["day", "week", "month", "year"];
  const REQUIRED_DETAILS = {
    house: ["location", "rooms", "size_sqm"],
    car: ["brand", "model", "year"]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function isoToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function parseISO(value) {
    const parts = String(value).split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
  }

  function toISO(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function daysBetween(from, to) {
    return Math.max(0, Math.round((parseISO(to) - parseISO(from)) / 86400000));
  }

  function addToDate(dateString, unit, amount) {
    const date = parseISO(dateString);
    const value = Number(amount);
    if (unit === "day") date.setUTCDate(date.getUTCDate() + value);
    if (unit === "week") date.setUTCDate(date.getUTCDate() + value * 7);
    if (unit === "month") {
      const wantedDay = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + value);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(wantedDay, lastDay));
    }
    if (unit === "year") {
      const month = date.getUTCMonth();
      const wantedDay = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCFullYear(date.getUTCFullYear() + value);
      date.setUTCMonth(month);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(wantedDay, lastDay));
    }
    return toISO(date);
  }

  function normalizeCurrency(value) {
    const currency = String(value || "TRY").trim().toLocaleUpperCase("tr-TR");
    if (["TRY", "TL", "₺", "TÜRK LİRASI"].includes(currency)) return "TRY";
    if (["USD", "$", "DOLAR", "DOLLAR"].includes(currency)) return "USD";
    if (["EUR", "€", "EURO", "AVRO"].includes(currency)) return "EUR";
    return "TRY";
  }

  function normalizeItemName(value) {
    const name = String(value || "").trim().toLocaleLowerCase("tr-TR");
    if (["ev", "daire", "house", "home"].includes(name)) return "house";
    if (["araba", "araç", "otomobil", "car", "vehicle"].includes(name)) return "car";
    return name || "item";
  }

  function createEvent(state, title, message, type, icon, date) {
    state.events.unshift({
      id: id("evt"),
      title,
      message,
      type: type || "info",
      icon: icon || "info",
      date: date || state.date,
      read: false
    });
    state.events = state.events.slice(0, 30);
  }

  function createInitialState(config) {
    const settings = config || {};
    const currency = normalizeCurrency(settings.currency);
    const budget = Math.max(0, Number(settings.budget ?? settings.amount ?? 25000));
    const salary = Math.max(0, Number(settings.salary ?? settings.monthly_income ?? 12500));
    const name = String(settings.name || "Deniz").trim().slice(0, 24) || "Deniz";
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(settings.date || "") ? settings.date : isoToday();
    const state = {
      version: VERSION,
      game_id: id("game"),
      age: 18,
      player: {
        name,
        age: 18,
        age_progress_days: 0,
        housing: "Evsiz",
        employment: "İşsiz",
        vehicle: null,
        conditions: []
      },
      date: startDate,
      money: { amount: budget, currency },
      starting_budget: budget,
      monthly_income: salary,
      stats: { hunger: 82, thirst: 76, entertainment: 64, energy: 88, health: 100 },
      inventory: [],
      events: [],
      transactions: [],
      time_history: [],
      paid_salary_periods: [],
      critical_flags: {},
      pending_price_request: null,
      created_at: new Date().toISOString()
    };
    createEvent(state, "Yeni hayatın başladı", `${formatMoney(budget, currency)} bütçeyle yola çıktın. Seçimlerini dikkatli yap!`, "positive", "sprout", startDate);
    return state;
  }

  function migrateState(input) {
    const state = clone(input);
    state.version = VERSION;
    state.player = state.player || {
      name: state.name || "Deniz",
      age: Number(state.age) || 18,
      age_progress_days: Math.max(0, ((Number(state.age) || 18) - 18) * 365),
      housing: state.housing || "Evsiz",
      employment: state.employment || "İşsiz",
      vehicle: state.vehicle || null,
      conditions: Array.isArray(state.conditions) ? state.conditions : []
    };
    state.player.conditions = Array.isArray(state.player.conditions) ? state.player.conditions : [];
    state.player.age_progress_days = Number(state.player.age_progress_days || Math.max(0, (Number(state.player.age || state.age || 18) - 18) * 365));
    state.player.age = Number(state.player.age || state.age) || 18;
    state.age = state.player.age;
    state.stats = Object.assign({ hunger: 70, thirst: 70, entertainment: 70, energy: 70, health: 100 }, state.stats || {});
    Object.keys(state.stats).forEach(key => state.stats[key] = clamp(state.stats[key], 0, 100));
    state.money = state.money || { amount: 0, currency: "TRY" };
    state.money.currency = normalizeCurrency(state.money.currency);
    state.money.amount = Number(state.money.amount) || 0;
    state.monthly_income = Number(state.monthly_income ?? state.salary ?? state.monthly_salary) || 0;
    state.starting_budget = Number(state.starting_budget ?? state.money.amount) || 0;
    state.inventory = Array.isArray(state.inventory) ? state.inventory : [];
    state.events = Array.isArray(state.events) ? state.events : [];
    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
    state.time_history = Array.isArray(state.time_history) ? state.time_history : [];
    state.paid_salary_periods = Array.isArray(state.paid_salary_periods) ? state.paid_salary_periods : [];
    state.critical_flags = state.critical_flags || {};
    state.date = state.date || isoToday();
    return state;
  }

  function formatMoney(amount, currencyCode) {
    const currency = CURRENCIES[currencyCode] || CURRENCIES.TRY;
    return `${new Intl.NumberFormat(currency.locale, { maximumFractionDigits: 0 }).format(Number(amount) || 0)} ${currency.symbol}`;
  }

  function success(message, state, extra) {
    return Object.assign({ status: "success", message, new_game_state: state }, extra || {});
  }

  function error(message, code, state, extra) {
    return Object.assign({ status: "error", message, error_code: code, current_game_state: state }, extra || {});
  }

  function spend(state, amount, category, description, inventoryId) {
    const cost = Math.max(0, Number(amount) || 0);
    if (state.money.amount < cost) return false;
    state.money.amount -= cost;
    state.transactions.push({
      id: id("txn"), type: "expense", amount: cost, category, description,
      date: state.date, inventory_id: inventoryId || null, reversible: true, reversed: false
    });
    return true;
  }

  function addIncome(state, amount, category, description, date) {
    const value = Math.max(0, Number(amount) || 0);
    state.money.amount += value;
    state.transactions.push({
      id: id("txn"), type: "income", amount: value, category, description,
      date: date || state.date, reversible: category === "salary" || category === "random_event", reversed: false
    });
  }

  function updateStat(state, key, amount) {
    state.stats[key] = clamp(state.stats[key] + amount, 0, 100);
    if (state.stats[key] >= 10) delete state.critical_flags[key];
  }

  function getActionCost(state, action) {
    return BASE_COSTS[state.money.currency][action] || 0;
  }

  function performAction(state, request) {
    const action = request.name || request.action_name || request.type;
    const effects = {};
    let message = "Eylem tamamlandı.";
    let eventTitle = "Bir şey yaptın";
    let eventMessage = "Günün için küçük bir adım attın.";
    let eventType = "positive";
    let icon = "sparkles";
    let cost = 0;

    if (action === "eat") {
      cost = getActionCost(state, "eat");
      effects.hunger = 25; effects.energy = 3;
      message = "Lezzetli bir öğün yedin. Açlığın azaldı!";
      eventTitle = "Karnını doyurdun"; eventMessage = `${formatMoney(cost, state.money.currency)} karşılığında güzel bir öğün yedin.`; icon = "utensils";
    } else if (action === "drink") {
      cost = getActionCost(state, "drink");
      effects.thirst = 30;
      message = "Su içtin. Kendini daha zinde hissediyorsun!";
      eventTitle = "Su molası"; eventMessage = "Susuzluğunu giderdin ve güne devam etmeye hazırsın."; icon = "glass-water";
    } else if (action === "fun") {
      cost = getActionCost(state, "fun");
      effects.entertainment = 22; effects.energy = -3;
      message = "Güzel vakit geçirdin. Eğlence seviyen yükseldi!";
      eventTitle = "Keyifli bir mola"; eventMessage = `${formatMoney(cost, state.money.currency)} harcayarak biraz kafa dağıttın.`; icon = "gamepad-2";
    } else if (action === "rest") {
      effects.energy = 25; effects.hunger = -2; effects.thirst = -2;
      message = "Biraz dinlendin. Enerjin yenilendi!";
      eventTitle = "İyi bir dinlenme"; eventMessage = "Kendine zaman ayırdın ve enerjini topladın."; icon = "bed-double";
    } else if (action === "healthcare") {
      cost = getActionCost(state, "healthcare");
      effects.health = 20;
      message = "Doktor kontrolün tamamlandı. Sağlığın iyileşti!";
      eventTitle = "Sağlık kontrolü"; eventMessage = `${formatMoney(cost, state.money.currency)} karşılığında genel kontrol yaptırdın.`; icon = "stethoscope";
    } else if (action === "find_job") {
      if (state.player.employment !== "İşsiz") return error("Zaten bir işin var. Yeni fırsatlar yakında eklenecek.", "ALREADY_EMPLOYED", state);
      state.player.employment = "Junior Tasarımcı";
      effects.entertainment = 5;
      message = "Tebrikler! Junior Tasarımcı olarak işe başladın.";
      eventTitle = "Yeni bir işe başladın"; eventMessage = `Her ayın 15'inde ${formatMoney(state.monthly_income, state.money.currency)} maaş alacaksın.`; icon = "briefcase-business";
    } else {
      return error("Bu eylem simülasyon tarafından tanınmıyor.", "UNKNOWN_ACTION", state);
    }

    if (cost > 0 && !spend(state, cost, action, eventTitle)) {
      return error(`Bu eylem için ${formatMoney(cost, state.money.currency)} gerekiyor. Bakiyen yetersiz.`, "INSUFFICIENT_FUNDS", state, { required_amount: cost });
    }
    Object.keys(effects).forEach(key => updateStat(state, key, effects[key]));
    createEvent(state, eventTitle, eventMessage, eventType, icon);
    return success(message, state, { effects, cost });
  }

  function salaryPeriod(dateString) {
    const date = parseISO(dateString);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function applyCriticalConsequences(state) {
    const consequences = [];
    const definitions = [
      { key: "hunger", title: "Ciddi açlık", message: "Yetersiz beslenme sağlığını ve enerjini düşürdü.", health: -10, energy: -8, icon: "utensils" },
      { key: "thirst", title: "Susuzluk tehlikesi", message: "Vücudun susuz kaldığı için sağlığın ciddi şekilde etkilendi.", health: -15, energy: -10, icon: "glass-water" },
      { key: "entertainment", title: "Moral düşüklüğü", message: "Uzun süredir kendine zaman ayırmaman enerjini düşürdü.", health: -3, energy: -7, icon: "cloud-rain" },
      { key: "energy", title: "Tükenmişlik", message: "Enerjin tükendi; sağlığın ve günlük performansın düştü.", health: -8, energy: 0, icon: "battery-warning" }
    ];
    definitions.forEach(item => {
      if (state.stats[item.key] < 10 && !state.critical_flags[item.key]) {
        state.critical_flags[item.key] = true;
        updateStat(state, "health", item.health);
        if (item.energy) updateStat(state, "energy", item.energy);
        createEvent(state, item.title, item.message, "negative", item.icon);
        consequences.push({ stat: item.key, health_effect: item.health, energy_effect: item.energy });
      }
    });
    if (state.stats.health <= 0 && !state.critical_flags.health) {
      state.critical_flags.health = true;
      createEvent(state, "Acil sağlık durumu", "Sağlığın kritik seviyeye düştü. En kısa sürede doktora gitmelisin.", "negative", "siren");
      consequences.push({ stat: "health", effect: "critical_condition" });
    }
    return consequences;
  }

  function addAgeConditions(state, previousAge) {
    const added = [];
    if (previousAge < 40 && state.player.age >= 40 && !state.player.conditions.some(c => c.code === "hypertension")) {
      state.player.conditions.push({ code: "hypertension", name: "Tansiyon", treatment: "Düzenli kontrol ve ilaç", active: true });
      updateStat(state, "health", -8);
      createEvent(state, "Yaşa bağlı tansiyon", "40 yaş eşiğinde tansiyon belirtileri başladı. Düzenli doktor kontrolü öneriliyor.", "warning", "heart-pulse");
      added.push("hypertension");
    }
    if (previousAge < 60 && state.player.age >= 60 && !state.player.conditions.some(c => c.code === "rheumatism")) {
      state.player.conditions.push({ code: "rheumatism", name: "Romatizma", treatment: "Fizik tedavi ve ilaç", active: true });
      updateStat(state, "health", -12);
      createEvent(state, "Romatizma belirtileri", "60 yaş eşiğinde eklem ağrıları başladı. Tedavi günlük yaşam kaliteni koruyabilir.", "warning", "bone");
      added.push("rheumatism");
    }
    return added;
  }

  function deterministicEvent(state, daysAdvanced) {
    if (daysAdvanced < 7) return null;
    const seed = `${state.game_id || "game"}-${state.date}-${daysAdvanced}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    const roll = Math.abs(hash) % 100;
    if (roll < 18) {
      const amount = Math.max(1, Math.round(state.monthly_income * .04));
      addIncome(state, amount, "random_event", "Yolda bulunan para", state.date);
      createEvent(state, "Beklenmedik bir şans", `Yolda ${formatMoney(amount, state.money.currency)} buldun. Bugün şanslı günün!`, "positive", "clover");
      return { type: "positive", money_effect: amount };
    }
    if (roll > 84) {
      const amount = Math.max(1, Math.round(state.monthly_income * .03));
      const paid = Math.min(state.money.amount, amount);
      if (paid > 0) spend(state, paid, "random_event", "Beklenmedik küçük masraf");
      createEvent(state, "Beklenmedik masraf", `Günlük bir aksilik sana ${formatMoney(paid, state.money.currency)} mal oldu.`, "warning", "triangle-alert");
      return { type: "negative", money_effect: -paid };
    }
    return null;
  }

  function advanceTime(state, request) {
    const unit = request.unit;
    const amount = Number(request.amount || 1);
    if (!VALID_TIME_UNITS.includes(unit)) return error("Zaman birimi day, week, month veya year olmalıdır.", "INVALID_TIME_UNIT", state);
    if (!Number.isInteger(amount) || amount < 1 || amount > 20) return error("İlerletme miktarı 1 ile 20 arasında bir tam sayı olmalıdır.", "INVALID_TIME_AMOUNT", state);

    const from = state.date;
    const target = addToDate(from, unit, amount);
    const elapsedDays = daysBetween(from, target);
    const actionId = id("time");
    const previousAge = Number(state.player.age) || 18;
    const salaries = [];

    let cursor = parseISO(from);
    for (let day = 0; day < elapsedDays; day += 1) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const current = toISO(cursor);
      if (cursor.getUTCDate() === 15) {
        const period = salaryPeriod(current);
        if (!state.paid_salary_periods.includes(period)) {
          state.paid_salary_periods.push(period);
          addIncome(state, state.monthly_income, "salary", `${MONTH_NAMES[cursor.getUTCMonth()]} maaşı`, current);
          salaries.push({ period, amount: state.monthly_income, date: current });
        }
      }
    }

    state.date = target;
    state.player.age_progress_days += elapsedDays;
    state.player.age = 18 + Math.floor(state.player.age_progress_days / 365);
    state.age = state.player.age;
    updateStat(state, "hunger", -3 * elapsedDays);
    updateStat(state, "thirst", -4 * elapsedDays);
    updateStat(state, "entertainment", -2 * elapsedDays);
    updateStat(state, "energy", -2 * elapsedDays);

    const consequences = applyCriticalConsequences(state);
    const conditions = addAgeConditions(state, previousAge);
    const randomEvent = deterministicEvent(state, elapsedDays);
    salaries.forEach(payment => createEvent(state, "Maaşın hesabında", `${formatMoney(payment.amount, state.money.currency)} ${MONTH_NAMES[Number(payment.period.slice(5)) - 1]} maaşı yatırıldı.`, "positive", "badge-dollar-sign", payment.date));
    createEvent(state, "Zaman ilerledi", `${elapsedDays} gün geçti. İhtiyaç seviyelerini kontrol etmeyi unutma.`, "info", "calendar-clock", target);

    state.time_history.push({ id: actionId, from, to: target, days: elapsedDays, unit, amount, created_at: new Date().toISOString() });
    state.time_history = state.time_history.slice(-20);
    return success(`${elapsedDays} gün ilerledin. Tarih artık ${target}.`, state, {
      elapsed_days: elapsedDays,
      salaries_paid: salaries,
      critical_consequences: consequences,
      age_conditions_triggered: conditions,
      random_event: randomEvent
    });
  }

  function undoTime(state) {
    if (!state.time_history.length) return error("Geri alınabilecek bir zaman ilerlemesi yok.", "NOTHING_TO_UNDO", state);
    const last = state.time_history.pop();
    let refunded = 0;
    let salariesReversed = 0;
    let otherIncomeReversed = 0;
    const removedIds = [];

    state.transactions.forEach(transaction => {
      const inWindow = transaction.date > last.from && transaction.date <= last.to;
      if (!inWindow || transaction.reversed) return;
      if (transaction.type === "expense" && transaction.reversible) {
        refunded += transaction.amount;
        state.money.amount += transaction.amount;
        transaction.reversed = true;
        if (transaction.inventory_id) removedIds.push(transaction.inventory_id);
      } else if (transaction.type === "income" && transaction.reversible) {
        state.money.amount -= transaction.amount;
        transaction.reversed = true;
        if (transaction.category === "salary") {
          salariesReversed += transaction.amount;
          const period = salaryPeriod(transaction.date);
          state.paid_salary_periods = state.paid_salary_periods.filter(value => value !== period);
        } else {
          otherIncomeReversed += transaction.amount;
        }
      }
    });
    state.inventory = state.inventory.filter(item => !removedIds.includes(item.id));
    state.date = last.from;
    state.player.housing = state.inventory.some(item => item.item === "house") ? "Ev sahibi" : "Evsiz";
    const latestCar = [...state.inventory].reverse().find(item => item.item === "car");
    state.player.vehicle = latestCar ? `${latestCar.details.brand} ${latestCar.details.model}` : null;
    createEvent(state, "Zaman geri alındı", `Tarih ${last.from} oldu. ${formatMoney(refunded, state.money.currency)} harcama iade edildi; ihtiyaç ve yaş değişimleri korundu.`, "warning", "history", last.from);
    return success("Son zaman ilerlemesi geri alındı. İstatistikler ve yaşlanma değişmedi.", state, {
      restored_date: last.from,
      refunded_expenses: refunded,
      reversed_salary: salariesReversed,
      reversed_other_income: otherIncomeReversed,
      removed_inventory_ids: removedIds
    });
  }

  function buildPricePrompt(state, item, details) {
    const currency = CURRENCIES[state.money.currency];
    if (item === "house") {
      const extras = [details.furnished ? "mobilyalı" : "mobilyasız", details.type || "daire"].filter(Boolean).join(", ");
      return `${currency.label} (${currency.symbol}) cinsinden, ${details.location} konumunda, ${details.size_sqm} metrekare ve ${details.rooms} odalı, ${extras} bir ev için güncel ve gerçekçi piyasa satış fiyatı ne kadar olabilir? Lütfen yalnızca fiyatı sayı olarak belirtin, para birimi veya ek açıklama yazmayın.`;
    }
    if (item === "car") {
      const extras = [details.fuel, details.transmission, details.condition].filter(Boolean).join(", ");
      return `${currency.label} (${currency.symbol}) cinsinden, ${details.year} model ${details.brand} ${details.model}${extras ? `, ${extras}` : ""} bir otomobil için güncel ve gerçekçi piyasa satış fiyatı ne kadar olabilir? Lütfen yalnızca fiyatı sayı olarak belirtin, para birimi veya ek açıklama yazmayın.`;
    }
    return `${currency.label} (${currency.symbol}) cinsinden ${item} için güncel ve gerçekçi piyasa fiyatı nedir? Lütfen yalnızca fiyatı sayı olarak belirtin, ek açıklama yapmayın.`;
  }

  function buyItem(state, request) {
    const item = normalizeItemName(request.item_name);
    const details = clone(request.details || {});
    const required = REQUIRED_DETAILS[item] || [];
    const missing = required.filter(key => details[key] === undefined || details[key] === null || details[key] === "");
    if (missing.length) {
      return {
        status: "clarification_needed",
        message: item === "house" ? "Lütfen ev için konum, oda sayısı ve metrekare detaylarını belirtin." : "Lütfen araç için marka, model ve model yılı detaylarını belirtin.",
        missing_details: missing,
        current_game_state: state
      };
    }
    if (request.price_known !== true || !Number.isFinite(Number(request.price))) {
      const pricePrompt = buildPricePrompt(state, item, details);
      state.pending_price_request = { item_name: item, details, price_prompt: pricePrompt, created_at: new Date().toISOString() };
      return {
        status: "price_inquiry_needed",
        message: "Satın alma için güncel piyasa fiyatı gerekiyor. Aşağıdaki promptla fiyat araştırılabilir.",
        price_prompt: pricePrompt,
        item_to_price: item,
        item_details: details,
        current_game_state: state
      };
    }
    return completePurchase(state, item, details, Number(request.price));
  }

  function completePurchase(state, item, details, price) {
    if (!Number.isFinite(price) || price <= 0) return error("Fiyat sıfırdan büyük, geçerli bir sayı olmalıdır.", "INVALID_PRICE", state);
    if (state.money.amount < price) {
      return error(`Yetersiz bakiye. Bu satın alma için ${formatMoney(price, state.money.currency)}, hesabında ise ${formatMoney(state.money.amount, state.money.currency)} var.`, "INSUFFICIENT_FUNDS", state, { required_amount: price, shortfall: price - state.money.amount });
    }
    const inventoryId = id("asset");
    const inventoryItem = { id: inventoryId, item, details: clone(details), purchase_price: price, currency: state.money.currency, acquired_at: state.date };
    if (!spend(state, price, item, item === "house" ? "Ev satın alımı" : item === "car" ? "Araç satın alımı" : `${item} satın alımı`, inventoryId)) {
      return error("Satın alma sırasında bakiye kontrolü başarısız oldu.", "INSUFFICIENT_FUNDS", state);
    }
    state.inventory.push(inventoryItem);
    state.pending_price_request = null;
    if (item === "house") {
      state.player.housing = "Ev sahibi";
      updateStat(state, "entertainment", 12);
      createEvent(state, "Yeni evin hayırlı olsun!", `${details.location} konumundaki ${details.rooms} odalı ev artık senin.`, "positive", "house");
    } else if (item === "car") {
      state.player.vehicle = `${details.brand} ${details.model}`;
      updateStat(state, "entertainment", 8);
      createEvent(state, "Yeni bir araban var", `${details.year} model ${details.brand} ${details.model} artık garajında.`, "positive", "car-front");
    } else {
      createEvent(state, "Yeni satın alma", `${item} envanterine eklendi.`, "positive", "package-check");
    }
    return success(`${item === "house" ? "Ev" : item === "car" ? "Araba" : "Ürün"} başarıyla satın alındı!`, state, { purchased_item: inventoryItem });
  }

  function priceInput(state, request) {
    const pending = state.pending_price_request;
    const item = normalizeItemName(request.item_name || pending?.item_name);
    const details = clone(request.details || pending?.details || {});
    if (!pending && !request.item_name) return error("Fiyatın bağlanacağı bekleyen bir satın alma bulunamadı.", "NO_PENDING_PRICE_REQUEST", state);
    if (request.currency && normalizeCurrency(request.currency) !== state.money.currency) {
      return error(`Fiyat, oyunun para birimi olan ${CURRENCIES[state.money.currency].label} cinsinden girilmelidir.`, "CURRENCY_MISMATCH", state);
    }
    return completePurchase(state, item, details, Number(request.price));
  }

  function handleRequest(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { status: "error", message: "İstek geçerli bir JSON objesi olmalıdır.", error_code: "INVALID_REQUEST", current_game_state: null };
    }
    const action = input.action;
    if (action === "setup_game") {
      const state = createInitialState(input.config || input);
      return success("Yeni yaşam simülasyonu başlatıldı.", state);
    }

    let state;
    try {
      state = input.current_game_state ? migrateState(input.current_game_state) : null;
    } catch (exception) {
      return { status: "error", message: "Mevcut oyun durumu okunamadı.", error_code: "INVALID_GAME_STATE", current_game_state: null };
    }
    if (!state) return { status: "error", message: "İşlem için current_game_state alanı gereklidir.", error_code: "GAME_STATE_REQUIRED", current_game_state: null };

    if (action === "get_state") return success("Güncel oyun durumu alındı.", state);
    if (action === "advance_time") return advanceTime(state, input);
    if (action === "undo_time" || action === "rewind_time") return undoTime(state);
    if (action === "perform_action") return performAction(state, input);
    if (action === "buy_item") return buyItem(state, input);
    if (action === "price_input") return priceInput(state, input);
    return error(`'${String(action || "")}' eylemi tanınmıyor.`, "UNKNOWN_ACTION", state);
  }

  global.LifeSimulationAPI = {
    version: VERSION,
    currencies: CURRENCIES,
    createInitialState,
    handleRequest,
    formatMoney,
    date: { add: addToDate, daysBetween }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.LifeSimulationAPI;
  }
})(typeof window !== "undefined" ? window : globalThis);
