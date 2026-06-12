# Чеклист: проверка волонтёрских программ

Скопируй как промпт для Cursor:

```
Проверь актуальность волонтёрских программ по research/volunteering/volunteering-registry.json и обнови сайт (programs.html, domain: volunteering)
```

## Что проверять

1. **URL** открывается, проект/хост активен
2. **Возраст** — `age` / `minAge` / `audience` (teen | adult | both)
3. **Дедлайн** — для ESC смотреть European Youth Portal
4. **Покрытие** — жильё, питание, проезд, карманные (в `pay` и `support[]`)
5. **Виза** — указать в `desc`: Шенген, UK, IL и т.д.
6. **Язык** — минимальный уровень в `desc`

## Правила карточки

| Поле | Правило |
|------|---------|
| `domain` | всегда `volunteering` |
| `category` | ESC · Волонтёрский обмен · Социальные проекты · 35+ |
| `audience` | `teen` (16–18 трек), `adult` (35+), `both` (ESC humanitarian 18–35) |
| `desc` | `Доступно: виза … · Язык: … · Возраст: … · Подача: …` |

## Фильтр 35+

Только в разделе «Волонтёрство». Программы с `audience: adult` или `category: 35+`.

## После обновления

1. `node scripts/audit-filters.mjs`
2. `cp programs.html index.html`
