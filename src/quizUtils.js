/** Fisher–Yates shuffle (mutates copy) */
export function shuffleArray(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function loadWordsFromCsv(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Không đọc được file từ vựng')
  const text = await res.text()
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return [...new Set(lines)]
}

/**
 * Pick 3 distinct distractors from pool (excluding correct).
 */
export function pickDistractors(pool, correct, count = 3) {
  const others = pool.filter((w) => w !== correct)
  const shuffled = shuffleArray(others)
  const out = []
  const seen = new Set()
  for (const w of shuffled) {
    if (out.length >= count) break
    if (!seen.has(w)) {
      seen.add(w)
      out.push(w)
    }
  }
  while (out.length < count && others.length > 0) {
    out.push(others[out.length % others.length])
  }
  return out.slice(0, count)
}

/**
 * Free Dictionary API — một mục gồm nghĩa (có từ loại), phiên âm và link âm thanh.
 */
export async function fetchEnglishDictionaryEntry(word, signal) {
  const q = encodeURIComponent(word.trim())
  if (!q) return null
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${q}`,
      { signal },
    )
    if (!res.ok) return null
    const data = await res.json()
    const entry = Array.isArray(data) ? data[0] : null
    if (!entry?.meanings?.length) return null

    let phoneticText = null
    let audioUrl = null
    for (const p of entry.phonetics || []) {
      if (!phoneticText && p.text?.trim()) phoneticText = p.text.trim()
      if (!audioUrl && p.audio?.trim()) audioUrl = p.audio.trim()
    }

    /** Nghĩa đầu tiên trong API (thường là nghĩa thông dụng nhất) + từ loại để tránh hiểu nhầm. */
    let chosen = null
    for (const m of entry.meanings) {
      for (const d of m.definitions || []) {
        const def = d.definition?.trim()
        if (def) {
          chosen = {
            partOfSpeech: m.partOfSpeech || 'sense',
            def,
            example: d.example?.trim() || null,
          }
          break
        }
      }
      if (chosen) break
    }
    if (!chosen) return null

    const posLabel =
      chosen.partOfSpeech.charAt(0).toUpperCase() +
      chosen.partOfSpeech.slice(1)
    const senseLine = `${posLabel} — ${chosen.def}`

    return {
      senseLine,
      example: chosen.example,
      phonetic: phoneticText,
      audioUrl,
    }
  } catch {
    return null
  }
}

export function buildOptions(pool, correct) {
  const distractors = pickDistractors(pool, correct, 3)
  return shuffleArray([correct, ...distractors])
}

/** MyMemory — dịch đoạn tiếng Anh sang tiếng Việt (giới hạn độ dài phía client). */
const MYMEMORY_MAX = 450

export async function translateEnToVi(text, signal) {
  const t = text?.trim()
  if (!t) return null
  const q = encodeURIComponent(t.slice(0, MYMEMORY_MAX))
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${q}&langpair=en|vi`,
      { signal },
    )
    if (!res.ok) return null
    const data = await res.json()
    const out = data?.responseData?.translatedText?.trim()
    return out || null
  } catch {
    return null
  }
}
