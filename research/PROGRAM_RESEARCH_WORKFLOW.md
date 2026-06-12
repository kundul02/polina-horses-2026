# Workflow: верификация программ перед публикацией

Каждая программа в базе должна иметь **проверенные по официальному источнику** поля перед отображением на сайте.

## Главное правило (все будущие запуски)

1. **WebFetch** конкретной страницы программы (не immigration.gov, не homepage без application).
2. **Записать реальные поля** в `programs-verified.json` (по `id`) или `feed-verified-overrides.json` (по URL).
3. **Только потом** — `status: "new"` в feed / деплой на сайт.

Без шага 1–2 программа **не попадает** в `LATEST_FEED` и не получает `new`. Inferred шаблон `inferDocumentChecklist()` — fallback для identity docs, не замена официального списка документов.

## Источник правды

| Файл | Роль |
|------|------|
| [`programs-verified.json`](programs-verified.json) | Верифицированные поля по `id` программы |
| [`programs.html`](../programs.html) | Публичная витрина |
| [`all-programs-full.json`](all-programs-full.json) | Экспорт всех программ с runtime-id (4 раздела) |
| [`feed-verified-overrides.json`](feed-verified-overrides.json) | Официальные поля для LATEST_FEED (ключ = URL) |
| [`scripts/inject-verified-registry.mjs`](../scripts/inject-verified-registry.mjs) | Вставляет `VERIFIED_REGISTRY` + `.map(applyVerifiedProgram)` |
| [`scripts/export-merged-programs.mjs`](../scripts/export-merged-programs.mjs) | Генерирует `all-programs-full.json` |
| [`scripts/generate-feed-verified.mjs`](../scripts/generate-feed-verified.mjs) | Verified для LATEST_FEED (ids 55+) |
| [`scripts/sync-verified-from-html.mjs`](../scripts/sync-verified-from-html.mjs) | Синхронизирует богатые поля из HTML → JSON |
| [`scripts/fetch_program_urls.mjs`](../scripts/fetch_program_urls.mjs) | Fetch официальных URL (диапазон id) |
| [`scripts/audit-documents.mjs`](../scripts/audit-documents.mjs) | Аудит после `applyVerifiedProgram` |

## Обязательные поля для каждой программы

```json
{
  "1": {
    "summary": "1–2 предложения: что это и для кого",
    "desc": "Доступность: виза, язык, возраст. Контакт/форма подачи.",
    "dates": "Фактические даты сессии/сезона",
    "deadline": "Дедлайн подачи (или Rolling / Закрыт)",
    "pay": "Что платят / стоит участнику",
    "support": ["Жильё", "Обучение"],
    "documents": ["Конкретный doc 1", "Конкретный doc 2"],
    "sources": ["https://official-url"],
    "verifiedAt": "2026-06-10",
    "closed": false
  }
}
```

### Правила полей

**summary** — суть программы, возраст, что даёт (жильё/оплата/обучение).

**desc** — формат для карточки «Доступность»:
- `Доступно: виза … · Язык … · Подача: URL/email/form`

**documents** — только **конкретные** пункты с официального сайта:
- Название формы, URL portal, fee, audition format
- Не generic «паспорт + CV» без уточнения программы
- Identity docs (паспорт, consent) — только если требует организатор

**dates / deadline** — с официального сайта на дату проверки; если закрыто → `closed: true`, deadline `Закрыт (дата)`.

**sources** — минимум 1 URL, с которого взяты данные.

## Чеклист агента при добавлении/обновлении

1. Открыть `url` программы (и linked application page).
2. Записать в `programs-verified.json` по `id`.
3. Заполнить все 8 полей выше + `documents[]` (минимум 3 пункта).
4. `node scripts/inject-verified-registry.mjs` (обновляет HTML + index.html).
5. `node scripts/audit-documents.mjs` — все программы с documents, нет массовых дублей без причины.
7. Строка в `research/equestrian/Обновление_*.md` или `research/acting/Обновление_*.md`.

## Новые программы из LATEST_FEED

При добавлении в feed:
1. Сначала research → запись в `programs-verified.json` с id (после merge) или временным ключом по URL.
2. Только потом `status: "new"` в feed.
3. Без verified-блока — ставить `status: "needs_manual_check"`, не показывать как полностью проверенную.

## Периодичность

| Тип | Частота |
|-----|---------|
| Срочные (deadline < 14 дней) | Ежедневно |
| Открытые стипендии/сезон | Раз в 3–7 дней |
| Закрытые / архив | При мониторинге похожих |
| Полный re-review базы | Раз в месяц или после крупного обновления |

## Команда для Cursor

```
Проверь новые программы по research/PROGRAM_RESEARCH_WORKFLOW.md:
WebFetch URL → programs-verified.json → inject-verified-registry → audit-documents
```

### LATEST_FEED (ids 55+)

```bash
node scripts/export-merged-programs.mjs
node scripts/fetch_program_urls.mjs 55 107
node scripts/generate-feed-verified.mjs
node scripts/inject-verified-registry.mjs
node scripts/audit-documents.mjs
```

Программы со `status: needs_manual_check` или fetch failed получают поле `check` в verified JSON.

**Placeholder-записи** (URL на immigration.gov / homepage без конкретной программы) — **удалять из `LATEST_FEED`**, не показывать на сайте. Пример: feed ids 79–104 (удалены 2026-06-11).

Официальные данные для feed → [`feed-verified-overrides.json`](feed-verified-overrides.json) (ключ = URL, для Jockey Club: `::internship` / `::scholarship`).

## Разделы сайта (`domain`)

| domain | Содержание |
|--------|------------|
| `castings` | Оплачиваемые кастинги (кино, реклама, театр) |
| `volunteering` | ESC, обмен трудом, социальные проекты; фильтр **35+** только здесь |
| `equestrian` | Лагеря, стипендии, стажировки, обмен (без кастингов и ESC) |
| `acting` | Курсы, интенсивы, стипендии, аудиции (без кастингов и ESC) |

Поле `audience` для волонтёрства: `teen` | `adult` | `both`.
