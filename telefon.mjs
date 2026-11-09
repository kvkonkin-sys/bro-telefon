// Телефон бро — веб-приложение поверх git (слово хозяина 09.11 «2 А»: «на телефоне нужно иметь возможность сделать
// всё, что можно делать на телефоне, а на компе всё остальное»). Телефон сам читает копию Вольта в закрытом
// репозитории, пишет md-записку во `vhod/` репозитория дома и видит ответы компьютера в `vyhod/`. Вход — личный
// токен GitHub хозяина, он хранится только в этом браузере.
//
// Граница куска. Здесь — правила без экрана: кодировка, имя и текст записки, зов API GitHub (fetch — опция для
// проб), пары «записка → ответ». Экран — app/telefon/index.html.

export const НАСТРОЙКИ = Object.freeze({ вольт: 'kvkonkin-sys/kvkonkin', дом: 'kvkonkin-sys/MyDLC', ветка: 'main', вход: 'vhod', выход: 'vyhod' })

/** Текст → base64 через UTF-8 (кириллица цела). */
export function в_base64 (текст) {
  let строка = ''
  for (const байт of new TextEncoder().encode(String(текст ?? ''))) строка += String.fromCharCode(байт)
  return btoa(строка)
}

/** base64 (с переводами строк, как отдаёт GitHub) → текст UTF-8. */
export function из_base64 (код) {
  const строка = atob(String(код ?? '').replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(строка, (знак) => знак.charCodeAt(0)))
}

/** Путь репозитория → адрес API: каждый кусок закодирован, пустые выброшены. */
export const путь_в_адрес = (путь) => String(путь ?? '').split('/').filter(Boolean).map(encodeURIComponent).join('/')

/** Имя записки по местному времени: `ГГГГММДД-ччммсс.md`. */
export function имя_записки (сейчас = new Date()) {
  const д = (н) => String(н).padStart(2, '0')
  return `${сейчас.getFullYear()}${д(сейчас.getMonth() + 1)}${д(сейчас.getDate())}-${д(сейчас.getHours())}${д(сейчас.getMinutes())}${д(сейчас.getSeconds())}.md`
}

/** Текст записки: «работа: N» первой строкой (если есть), слова, затем «файл: путь» на каждый приложенный файл. */
export function текст_записки ({ работа = '', слова = '', файлы = [] } = {}) {
  const строки = []
  if (String(работа).trim()) строки.push(`работа: ${String(работа).trim()}`)
  строки.push(String(слова).trim())
  for (const файл of файлы) строки.push(`файл: ${файл}`)
  return строки.join('\n') + '\n'
}

/** Клиент GitHub под токеном: список папки, текст файла, запись файла. Отказ — исключение со словами. */
export function клиент ({ токен, fetch: зов_сети = globalThis.fetch } = {}) {
  const зов = async (метод, адрес, тело) => {
    const ответ = await зов_сети(`https://api.github.com/${адрес}`, {
      method: метод,
      headers: { Authorization: `Bearer ${токен}`, Accept: 'application/vnd.github+json', ...(тело ? { 'Content-Type': 'application/json' } : {}) },
      body: тело ? JSON.stringify(тело) : undefined
    })
    if (ответ.status === 401) throw new Error('GitHub не принял токен — проверь его в настройках')
    if (ответ.status === 404) throw new Error('не найдено — нет такого пути или у токена нет доступа к репозиторию')
    if (!ответ.ok) throw new Error(`GitHub ответил ${ответ.status}`)
    return await ответ.json()
  }
  return {
    async список (репо, путь, ветка) {
      const данные = await зов('GET', `repos/${репо}/contents/${путь_в_адрес(путь)}?ref=${encodeURIComponent(ветка)}`)
      return (Array.isArray(данные) ? данные : [])
        .map((э) => ({ имя: э.name, путь: э.path, папка: э.type === 'dir' }))
        .sort((а, б) => Number(б.папка) - Number(а.папка) || а.имя.localeCompare(б.имя))
    },
    async файл (репо, путь, ветка) {
      const данные = await зов('GET', `repos/${репо}/contents/${путь_в_адрес(путь)}?ref=${encodeURIComponent(ветка)}`)
      if (!данные?.content && данные?.size > 0) throw new Error('файл больше 1 МБ — откроется только на компьютере')
      return из_base64(данные?.content ?? '')
    },
    async записать (репо, путь, текст, ветка, сообщение) {
      return await зов('PUT', `repos/${репо}/contents/${путь_в_адрес(путь)}`, { message: сообщение, content: в_base64(текст), branch: ветка })
    }
  }
}

/** Записки и ответы парами по имени, новые сверху: `[{ имя, ответ: true|false }]`. */
export function пары (записки, ответы) {
  const есть = new Set(ответы.filter((о) => !о.папка && о.имя.endsWith('.md')).map((о) => о.имя))
  return записки.filter((з) => !з.папка && з.имя.endsWith('.md') && !з.имя.startsWith('.'))
    .map((з) => ({ имя: з.имя, ответ: есть.has(з.имя) }))
    .concat([...есть].filter((и) => !записки.some((з) => з.имя === и)).map((и) => ({ имя: и, ответ: true })))
    .sort((а, б) => б.имя.localeCompare(а.имя))
}
