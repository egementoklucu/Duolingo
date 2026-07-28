(function () {
  "use strict";

  const STORAGE_KEY = "yarin-life-simulation-v1";
  const api = window.LifeSimulationAPI;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  let isFreshGame = false;
  let state = loadState();
  let latestRequest = { action: "get_state", current_game_state: state };
  let latestResponse = api.handleRequest(latestRequest);
  let activeApiTab = "request";
  let pendingPurchaseType = null;

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (error) {
      console.warn("Kayıtlı oyun okunamadı:", error);
    }
    isFreshGame = true;
    return api.createInitialState({ name: "Deniz", currency: "TRY", budget: 25000, salary: 12500 });
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Oyun kaydedilemedi:", error);
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function icon(name, className) {
    return `<i data-lucide="${escapeHTML(name)}"${className ? ` class="${escapeHTML(className)}"` : ""}></i>`;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function money(amount, withSymbol = true) {
    const config = api.currencies[state.money.currency];
    const formatted = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 0 }).format(Number(amount) || 0);
    return withSymbol ? `${formatted} ${config.symbol}` : formatted;
  }

  function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function dateParts(value) {
    const date = parseDate(value);
    const month = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(date);
    const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(date);
    return {
      day: date.getDate(),
      month: month.charAt(0).toUpperCase() + month.slice(1),
      year: date.getFullYear(),
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1)
    };
  }

  function relativeEventDate(dateString) {
    const difference = Math.round((parseDate(state.date) - parseDate(dateString)) / 86400000);
    if (difference === 0) return "Bugün";
    if (difference === 1) return "Dün";
    if (difference > 1 && difference < 30) return `${difference}g önce`;
    const parts = dateParts(dateString);
    return `${parts.day} ${parts.month.slice(0, 3)}`;
  }

  function transact(request, options) {
    const config = options || {};
    const payload = Object.assign({}, request, { current_game_state: state });
    latestRequest = JSON.parse(JSON.stringify(payload));
    latestResponse = api.handleRequest(payload);
    const nextState = latestResponse.new_game_state || latestResponse.current_game_state;
    if (nextState) {
      state = nextState;
      saveState();
      render();
    }
    if (latestResponse.status === "success" && config.toast !== false) showToast(latestResponse.message, "success");
    if (latestResponse.status === "error" && config.toast !== false) showToast(latestResponse.message, "error");
    renderApiCode();
    return latestResponse;
  }

  function showToast(message, type) {
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.innerHTML = `${icon(type === "error" ? "circle-alert" : "circle-check-big")}<span>${escapeHTML(message)}</span>`;
    $("#toastRegion").appendChild(toast);
    refreshIcons();
    window.setTimeout(() => {
      toast.classList.add("out");
      window.setTimeout(() => toast.remove(), 260);
    }, 3400);
  }

  function renderHeader() {
    const parts = dateParts(state.date);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";
    $(".topbar h1").childNodes[0].nodeValue = `${greeting}, `;
    $("#headerName").textContent = state.player.name;
    $("#greetingEyebrow").textContent = `${parts.day} ${parts.month}, ${parts.weekday}`;
    $("#profileName").textContent = state.player.name;
    $("#profileInitial").textContent = state.player.name.slice(0, 1).toLocaleUpperCase("tr-TR");
    $("#profileAge").textContent = state.player.age;
    $("#profileJob").textContent = state.player.employment;
  }

  function nextSalaryInfo() {
    const current = parseDate(state.date);
    let salaryDate = new Date(current.getFullYear(), current.getMonth(), 15, 12);
    if (current.getDate() >= 15) salaryDate = new Date(current.getFullYear(), current.getMonth() + 1, 15, 12);
    const days = Math.max(0, Math.round((salaryDate - current) / 86400000));
    return { days, progress: Math.max(5, Math.round(((31 - Math.min(days, 31)) / 31) * 100)) };
  }

  function currentMonthTransactions() {
    const prefix = state.date.slice(0, 7);
    return state.transactions.filter(transaction => transaction.date.startsWith(prefix) && !transaction.reversed);
  }

  function renderSummary() {
    const config = api.currencies[state.money.currency];
    const transactions = currentMonthTransactions();
    const income = transactions.filter(item => item.type === "income").reduce((total, item) => total + item.amount, 0);
    const spend = transactions.filter(item => item.type === "expense").reduce((total, item) => total + item.amount, 0);
    const salaryInfo = nextSalaryInfo();
    $("#balanceAmount").textContent = money(state.money.amount, false);
    $("#balanceCurrency").textContent = config.symbol;
    $("#monthIncome").textContent = `+${money(income)}`;
    $("#monthSpend").textContent = money(spend);
    $("#salaryAmount").textContent = money(state.monthly_income);
    $("#salaryDays").textContent = salaryInfo.days === 1 ? "1 gün" : `${salaryInfo.days} gün`;
    $("#salaryProgress").style.width = `${salaryInfo.progress}%`;
    $("#housingStatus").textContent = state.player.housing;
    $("#vehicleStatus").textContent = `${state.player.vehicle || "Araç yok"} · ${state.player.employment}`;

    const monthlyLimit = Math.max(1, state.monthly_income || state.starting_budget || state.money.amount);
    const percent = Math.min(100, Math.round((spend / monthlyLimit) * 100));
    $("#budgetPercent").textContent = `%${percent}`;
    $("#budgetBar").style.width = `${percent}%`;
    $("#budgetBar").style.background = percent > 85 ? "#df6262" : percent > 65 ? "#efb83f" : "#2aa66d";
    $("#budgetSpent").textContent = `${money(spend)} harcandı`;
    $("#budgetRemaining").textContent = `${money(Math.max(0, monthlyLimit - spend))} kaldı`;
  }

  const statDefinitions = [
    { key: "hunger", label: "Açlık", icon: "utensils", tone: "yellow" },
    { key: "thirst", label: "Susuzluk", icon: "droplets", tone: "blue" },
    { key: "entertainment", label: "Eğlence", icon: "party-popper", tone: "purple" },
    { key: "energy", label: "Enerji", icon: "zap", tone: "green" },
    { key: "health", label: "Sağlık", icon: "heart-pulse", tone: "green" }
  ];

  function renderStats() {
    $("#statsGrid").innerHTML = statDefinitions.map(item => {
      const value = Math.round(state.stats[item.key]);
      const tone = value < 10 ? "red" : item.tone;
      return `<article class="stat-card" data-tone="${tone}">
        <div class="stat-top">${icon(item.icon)}<span>${item.label}</span></div>
        <div class="stat-value">${value}<small>%</small></div>
        <div class="progress-track"><span style="width:${value}%"></span></div>
      </article>`;
    }).join("");
    const values = statDefinitions.map(item => state.stats[item.key]);
    const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    $("#wellbeingScore").textContent = average;
    const lowest = Math.min(...values, state.stats.health);
    const note = $("#wellbeingNote");
    if (lowest < 10) {
      note.className = "wellbeing-note critical";
      note.innerHTML = `${icon("triangle-alert")}<span><strong>Kritik bir ihtiyacın var!</strong> Hemen harekete geç; sağlığın etkilenebilir.</span>`;
    } else if (lowest < 35) {
      note.className = "wellbeing-note warning";
      note.innerHTML = `${icon("circle-alert")}<span><strong>Dengeyi kaybediyorsun.</strong> En düşük ihtiyacına biraz zaman ayırmalısın.</span>`;
    } else {
      note.className = "wellbeing-note";
      note.innerHTML = `${icon("circle-check-big")}<span><strong>Gayet iyi gidiyorsun!</strong> Tüm ihtiyaçların dengeli görünüyor.</span>`;
    }
  }

  function inventorySubtitle(item) {
    if (item.item === "house") return `${item.details.location} · ${item.details.rooms} oda`;
    if (item.item === "car") return `${item.details.year} model · ${item.details.brand}`;
    return `${money(item.purchase_price)} · ${item.acquired_at}`;
  }

  function renderInventory() {
    const inventory = state.inventory;
    $("#inventoryCount").textContent = inventory.length;
    $("#assetBadge").textContent = `${inventory.length} varlık`;
    if (!inventory.length) {
      $("#inventoryGrid").innerHTML = `<div class="empty-inventory">${icon("package-open")}<span>Henüz bir varlığın yok. Ev veya araba alarak başlayabilirsin.</span></div>`;
      return;
    }
    $("#inventoryGrid").innerHTML = inventory.slice().reverse().map(item => `<article class="inventory-item">
      <span class="inventory-item-icon">${icon(item.item === "house" ? "house" : item.item === "car" ? "car-front" : "package")}</span>
      <span class="inventory-item-copy"><strong>${escapeHTML(item.item === "house" ? "Ev" : item.item === "car" ? `${item.details.brand} ${item.details.model}` : item.item)}</strong><span>${escapeHTML(inventorySubtitle(item))}</span></span>
    </article>`).join("");
  }

  function renderDate() {
    const parts = dateParts(state.date);
    $("#dateDay").textContent = parts.day;
    $("#dateMonth").textContent = parts.month;
    $("#dateYearWeekday").textContent = `${parts.year} · ${parts.weekday}`;
    $("#undoButton").disabled = !state.time_history.length;
  }

  function renderEvents() {
    const events = state.events.slice(0, 5);
    if (!events.length) {
      $("#eventList").innerHTML = `<div class="empty-events">${icon("wind")}<span>Henüz yeni bir gelişme yok.</span></div>`;
    } else {
      $("#eventList").innerHTML = events.map(event => `<article class="event-item">
        <span class="event-dot ${escapeHTML(event.type || "info")}">${icon(event.icon || "info")}</span>
        <strong>${escapeHTML(event.title)}</strong>
        <span class="event-date">${escapeHTML(relativeEventDate(event.date))}</span>
        <p>${escapeHTML(event.message)}</p>
      </article>`).join("");
    }
    const unread = state.events.some(event => !event.read);
    $("#notificationDot").style.display = unread ? "block" : "none";
  }

  function render() {
    renderHeader();
    renderSummary();
    renderStats();
    renderInventory();
    renderDate();
    renderEvents();
    refreshIcons();
  }

  function openSetup() {
    $("#setupName").value = state.player.name;
    $("#setupCurrency").value = state.money.currency;
    $("#setupBudget").value = Math.round(state.starting_budget || state.money.amount);
    $("#setupSalary").value = Math.round(state.monthly_income);
    updateSetupSymbols();
    $("#setupModal").showModal();
  }

  function updateSetupSymbols() {
    const symbol = api.currencies[$("#setupCurrency").value].symbol;
    $$(".currency-symbol").forEach(element => element.textContent = symbol);
  }

  function validateRequired(form) {
    let valid = true;
    Array.from(form.querySelectorAll("[required]")).forEach(input => {
      const missing = input.type === "number" ? !input.value || Number(input.value) < Number(input.min || 0) : !input.value.trim();
      input.classList.toggle("invalid", missing);
      if (missing) valid = false;
    });
    return valid;
  }

  function handleSetupSubmit(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!validateRequired(event.currentTarget)) {
      showToast("Lütfen başlangıç bilgilerini eksiksiz doldur.", "error");
      return;
    }
    const request = {
      action: "setup_game",
      config: {
        name: $("#setupName").value.trim(),
        currency: $("#setupCurrency").value,
        budget: Number($("#setupBudget").value),
        salary: Number($("#setupSalary").value)
      }
    };
    latestRequest = JSON.parse(JSON.stringify(request));
    latestResponse = api.handleRequest(request);
    state = latestResponse.new_game_state;
    saveState();
    render();
    renderApiCode();
    $("#setupModal").close();
    showToast("Yeni hayatın başladı. Bol şans!", "success");
  }

  function openPurchase(type) {
    pendingPurchaseType = type;
    const isHouse = type === "house";
    $("#purchaseTitle").textContent = isHouse ? "Nasıl bir ev arıyorsun?" : "Nasıl bir araba arıyorsun?";
    $("#purchaseIcon").innerHTML = icon(isHouse ? "house-plus" : "car-front");
    $("#purchaseFields").innerHTML = isHouse ? `<div class="purchase-fields-grid">
      <label class="full"><span>Konum</span><input name="location" type="text" placeholder="Örn. Kadıköy, İstanbul" required></label>
      <label><span>Oda sayısı</span><input name="rooms" type="number" min="1" max="20" placeholder="3" required></label>
      <label><span>Metrekare</span><input name="size_sqm" type="number" min="10" max="5000" placeholder="100" required></label>
      <label><span>Ev tipi</span><select name="type"><option value="daire">Daire</option><option value="müstakil ev">Müstakil ev</option><option value="villa">Villa</option><option value="rezidans">Rezidans</option></select></label>
      <label><span>Mobilya durumu</span><select name="furnished"><option value="true">Mobilyalı</option><option value="false">Mobilyasız</option></select></label>
    </div>` : `<div class="purchase-fields-grid">
      <label><span>Marka</span><input name="brand" type="text" placeholder="Örn. Toyota" required></label>
      <label><span>Model</span><input name="model" type="text" placeholder="Örn. Corolla" required></label>
      <label><span>Model yılı</span><input name="year" type="number" min="1950" max="2035" placeholder="2024" required></label>
      <label><span>Yakıt</span><select name="fuel"><option value="Benzin">Benzin</option><option value="Dizel">Dizel</option><option value="Hibrit">Hibrit</option><option value="Elektrik">Elektrik</option></select></label>
      <label><span>Vites</span><select name="transmission"><option value="Otomatik">Otomatik</option><option value="Manuel">Manuel</option></select></label>
      <label><span>Durum</span><select name="condition"><option value="Sıfır">Sıfır</option><option value="İkinci el">İkinci el</option></select></label>
    </div>`;
    refreshIcons();
    $("#purchaseModal").showModal();
  }

  function purchaseDetailsFromForm() {
    const formData = new FormData($("#purchaseForm"));
    const details = Object.fromEntries(formData.entries());
    if (pendingPurchaseType === "house") {
      details.rooms = Number(details.rooms);
      details.size_sqm = Number(details.size_sqm);
      details.furnished = details.furnished === "true";
    } else {
      details.year = Number(details.year);
    }
    return details;
  }

  function handlePurchaseResearch(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!validateRequired(event.currentTarget)) {
      showToast("Fiyat araştırması için gerekli detayları doldur.", "error");
      return;
    }
    const response = transact({ action: "buy_item", item_name: pendingPurchaseType, details: purchaseDetailsFromForm(), price_known: false }, { toast: false });
    if (response.status === "price_inquiry_needed") {
      $("#purchaseModal").close();
      openPriceModal(response);
    } else if (response.status === "clarification_needed") {
      showToast(response.message, "error");
    }
  }

  function openPriceModal(response) {
    const config = api.currencies[state.money.currency];
    $("#pricePrompt").value = response.price_prompt;
    $("#marketPriceInput").value = "";
    $("#marketCurrencySymbol").textContent = config.symbol;
    $("#priceInputLabel").textContent = `Bulduğun fiyat (${config.symbol})`;
    $("#priceBalance").textContent = money(state.money.amount);
    $("#priceModal").showModal();
  }

  function handlePriceSubmit(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!validateRequired(event.currentTarget)) {
      showToast("Satın almak için geçerli bir piyasa fiyatı gir.", "error");
      return;
    }
    const response = transact({
      action: "price_input",
      item_name: pendingPurchaseType,
      price: Number($("#marketPriceInput").value),
      currency: state.money.currency
    });
    if (response.status === "success") {
      $("#priceModal").close();
      $("#assets").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage, "success");
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast(successMessage, "success");
    }
  }

  function renderApiCode() {
    const content = activeApiTab === "request" ? latestRequest : latestResponse;
    $("#apiCode").textContent = JSON.stringify(content, null, 2);
  }

  function openApiLog() {
    renderApiCode();
    $("#apiModal").showModal();
  }

  function markEventsRead() {
    state.events.forEach(event => event.read = true);
    saveState();
    renderEvents();
    refreshIcons();
    showToast("Tüm gelişmeler okundu olarak işaretlendi.", "success");
  }

  function bindEvents() {
    [$("#newGameButton"), $("#newGameSide"), $("#mobileNewGame")].forEach(button => button.addEventListener("click", openSetup));
    $("#setupCurrency").addEventListener("change", updateSetupSymbols);
    $("#setupForm").addEventListener("submit", handleSetupSubmit);
    $("#purchaseForm").addEventListener("submit", handlePurchaseResearch);
    $("#priceForm").addEventListener("submit", handlePriceSubmit);

    $$('[data-action]').forEach(button => button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "buy_house") return openPurchase("house");
      if (action === "buy_car") return openPurchase("car");
      transact({ action: "perform_action", name: action });
    }));

    $$('[data-time-unit]').forEach(button => button.addEventListener("click", () => {
      transact({ action: "advance_time", unit: button.dataset.timeUnit, amount: 1 });
    }));
    $("#undoButton").addEventListener("click", () => transact({ action: "undo_time" }));
    $("#clearEvents").addEventListener("click", markEventsRead);
    $("#eventJump").addEventListener("click", () => {
      $("#eventPanel").scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(markEventsRead, 500);
    });
    $("#financeNav").addEventListener("click", () => {
      $(".budget-panel").scrollIntoView({ behavior: "smooth", block: "center" });
      closeMobileMenu();
    });

    $("#copyPromptButton").addEventListener("click", () => copyText($("#pricePrompt").value, "Fiyat promptu kopyalandı."));
    $("#apiLogButton").addEventListener("click", () => { closeMobileMenu(); openApiLog(); });
    $("#closeApiModal").addEventListener("click", () => $("#apiModal").close());
    $$("[data-api-tab]").forEach(button => button.addEventListener("click", () => {
      activeApiTab = button.dataset.apiTab;
      $$("[data-api-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
      renderApiCode();
    }));
    $("#copyApiButton").addEventListener("click", () => copyText($("#apiCode").textContent, "JSON panoya kopyalandı."));

    $("#menuButton").addEventListener("click", openMobileMenu);
    $("#sidebarScrim").addEventListener("click", closeMobileMenu);
    $$(".main-nav a").forEach(link => link.addEventListener("click", closeMobileMenu));

    $$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
      const rect = dialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) dialog.close();
    }));

    const observedSections = ["overview", "wellbeing", "actions", "assets"].map(id => document.getElementById(id));
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      $$(".main-nav a").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
    }, { rootMargin: "-20% 0px -60%", threshold: [0, .25, .6] });
    observedSections.forEach(section => observer.observe(section));
  }

  function openMobileMenu() {
    $("#sidebar").classList.add("open");
    $("#sidebarScrim").classList.add("show");
  }

  function closeMobileMenu() {
    $("#sidebar").classList.remove("open");
    $("#sidebarScrim").classList.remove("show");
  }

  render();
  bindEvents();
  renderApiCode();
  refreshIcons();
  if (isFreshGame) window.setTimeout(openSetup, 420);
})();
