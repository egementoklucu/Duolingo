"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./simulation.js");

function setup(overrides = {}) {
  const response = api.handleRequest({
    action: "setup_game",
    config: { name: "Ada", currency: "TL", budget: 6_000_000, salary: 20_000, date: "2026-07-01", ...overrides }
  });
  assert.equal(response.status, "success");
  return response.new_game_state;
}

test("oyun 18 yaşında, evsiz ve işsiz başlar", () => {
  const state = setup();
  assert.equal(state.age, 18);
  assert.equal(state.player.housing, "Evsiz");
  assert.equal(state.player.employment, "İşsiz");
  assert.equal(state.money.currency, "TRY");
  assert.equal(state.money.amount, 6_000_000);
});

test("ayın 15'i geçildiğinde maaş yalnızca bir kez yatırılır", () => {
  let state = setup();
  let response = api.handleRequest({ action: "advance_time", unit: "month", amount: 1, current_game_state: state });
  assert.equal(response.status, "success");
  assert.equal(response.salaries_paid.length, 1);
  state = response.new_game_state;
  assert.ok(state.paid_salary_periods.includes("2026-07"));
  assert.equal(state.transactions.filter(item => item.category === "salary").length, 1);
});

test("sonraki yıl komutu yaşı bir artırır ve geri alma yaşlanmayı korur", () => {
  let state = setup();
  state = api.handleRequest({ action: "advance_time", unit: "year", amount: 1, current_game_state: state }).new_game_state;
  assert.equal(state.age, 19);
  const response = api.handleRequest({ action: "undo_time", current_game_state: state });
  assert.equal(response.new_game_state.date, "2026-07-01");
  assert.equal(response.new_game_state.age, 19);
});

test("eksik ev detayları clarification_needed döndürür", () => {
  const state = setup();
  const response = api.handleRequest({
    action: "buy_item",
    item_name: "ev",
    details: { location: "Kadıköy" },
    price_known: false,
    current_game_state: state
  });
  assert.equal(response.status, "clarification_needed");
  assert.deepEqual(response.missing_details, ["rooms", "size_sqm"]);
});

test("bilinmeyen fiyat için para birimli araştırma promptu üretir", () => {
  const state = setup();
  const response = api.handleRequest({
    action: "buy_item",
    item_name: "ev",
    details: { location: "Kadıköy, İstanbul", rooms: 3, size_sqm: 100, furnished: true },
    price_known: false,
    current_game_state: state
  });
  assert.equal(response.status, "price_inquiry_needed");
  assert.match(response.price_prompt, /TL \(₺\)/);
  assert.match(response.price_prompt, /Kadıköy, İstanbul/);
  assert.equal(response.current_game_state.pending_price_request.item_name, "house");
});

test("price_input ürünü envantere ekler ve bakiyeyi düşürür", () => {
  let state = setup();
  const inquiry = api.handleRequest({
    action: "buy_item",
    item_name: "ev",
    details: { location: "Kadıköy", rooms: 3, size_sqm: 100 },
    price_known: false,
    current_game_state: state
  });
  state = inquiry.current_game_state;
  const response = api.handleRequest({ action: "price_input", price: 5_000_000, currency: "TL", current_game_state: state });
  assert.equal(response.status, "success");
  assert.equal(response.new_game_state.money.amount, 1_000_000);
  assert.equal(response.new_game_state.inventory.length, 1);
  assert.equal(response.new_game_state.player.housing, "Ev sahibi");
});

test("yetersiz bakiye yapılandırılmış hata döndürür", () => {
  const state = setup({ budget: 1000 });
  const response = api.handleRequest({
    action: "buy_item",
    item_name: "araba",
    details: { brand: "Toyota", model: "Corolla", year: 2024 },
    price_known: true,
    price: 1_000_000,
    current_game_state: state
  });
  assert.equal(response.status, "error");
  assert.equal(response.error_code, "INSUFFICIENT_FUNDS");
  assert.equal(response.current_game_state.money.amount, 1000);
});

test("zamanı geri alma harcamayı ve eşyayı geri alır; istatistikleri geri almaz", () => {
  let state = setup();
  const initialHunger = state.stats.hunger;
  state = api.handleRequest({ action: "advance_time", unit: "week", amount: 1, current_game_state: state }).new_game_state;
  state = api.handleRequest({
    action: "buy_item",
    item_name: "araba",
    details: { brand: "Toyota", model: "Corolla", year: 2024 },
    price_known: true,
    price: 1_000_000,
    current_game_state: state
  }).new_game_state;
  const response = api.handleRequest({ action: "undo_time", current_game_state: state });
  assert.equal(response.status, "success");
  assert.equal(response.new_game_state.date, "2026-07-01");
  assert.equal(response.new_game_state.inventory.length, 0);
  assert.equal(response.refunded_expenses, 1_000_000);
  assert.ok(response.new_game_state.stats.hunger < initialHunger);
});
