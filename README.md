# Yarın — Yaşam Simülasyonu

Bütçe, ihtiyaçlar, zaman, maaş, yaşlanma, varlıklar ve rastgele olayları yöneten API güdümlü yaşam simülasyonu.

## Çalıştırma

```bash
npm start
```

Arayüz `http://localhost:3000`, sağlık kontrolü `GET /api/health` adresindedir. Proje harici npm bağımlılığı kullanmaz.

## API

Tüm simülasyon işlemleri stateless `POST /api/simulate` uç noktasından yürütülebilir. Kurulum dışındaki isteklerde son yanıttaki oyun durumu `current_game_state` olarak geri gönderilmelidir.

```json
{
  "action": "setup_game",
  "config": {
    "name": "Deniz",
    "currency": "TL",
    "budget": 25000,
    "salary": 12500
  }
}
```

Desteklenen başlıca eylemler:

- `setup_game`
- `get_state`
- `perform_action` (`eat`, `drink`, `fun`, `rest`, `find_job`, `healthcare`)
- `advance_time` (`day`, `week`, `month`, `year`)
- `undo_time`
- `buy_item`
- `price_input`

Tarayıcı arayüzü aynı motoru `window.LifeSimulationAPI.handleRequest(...)` üzerinden kullanır. Son JSON istek ve yanıtı arayüzdeki **API Günlüğü** bölümünde görüntülenebilir.

## Test

```bash
npm test
```
