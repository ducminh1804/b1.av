const K = {
  session: 'vocab-quiz-session-v1',
  history: 'vocab-quiz-history-v1',
  weak: 'vocab-quiz-weak-v1',
}

const HISTORY_CAP = 40

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json)
    return v ?? fallback
  } catch {
    return fallback
  }
}

/** @returns {{ word: string, timesWrong: number, lastWrongAt: string }[]} */
export function loadWeakEntries() {
  const raw = localStorage.getItem(K.weak)
  const arr = safeParse(raw, [])
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x) => x && typeof x.word === 'string' && x.word.trim())
    .map((x) => ({
      word: x.word.trim(),
      timesWrong: Math.max(1, Number(x.timesWrong) || 1),
      lastWrongAt: typeof x.lastWrongAt === 'string' ? x.lastWrongAt : '',
    }))
}

export function saveWeakEntries(entries) {
  localStorage.setItem(K.weak, JSON.stringify(entries.slice(0, 2000)))
}

/** Ghi nhận từ trả lời sai (cập nhật hoặc thêm). */
export function recordWrongWord(word) {
  const w = word?.trim()
  if (!w) return
  const now = new Date().toISOString()
  const list = loadWeakEntries()
  const i = list.findIndex((e) => e.word === w)
  if (i >= 0) {
    list[i] = {
      word: w,
      timesWrong: list[i].timesWrong + 1,
      lastWrongAt: now,
    }
  } else {
    list.push({ word: w, timesWrong: 1, lastWrongAt: now })
  }
  list.sort((a, b) => (b.lastWrongAt || '').localeCompare(a.lastWrongAt || ''))
  saveWeakEntries(list)
}

/** Các từ yếu còn nằm trong pool hiện tại (để ôn tập). */
export function getWeakWordsInPool(pool) {
  const set = new Set(pool)
  const seen = new Set()
  const out = []
  for (const e of loadWeakEntries()) {
    if (set.has(e.word) && !seen.has(e.word)) {
      seen.add(e.word)
      out.push(e.word)
    }
  }
  return out
}

/** @returns {object[]} newest first */
export function loadHistory() {
  const raw = localStorage.getItem(K.history)
  const arr = safeParse(raw, [])
  return Array.isArray(arr) ? arr : []
}

export function appendHistory(entry) {
  const next = [entry, ...loadHistory()].slice(0, HISTORY_CAP)
  localStorage.setItem(K.history, JSON.stringify(next))
}

/**
 * @param {{
 *   words: string[]
 *   index: number
 *   correctCount: number
 *   wrongCount: number
 *   wrongWords: string[]
 *   preferRandom: boolean
 *   mode: 'full' | 'review'
 * }} data
 */
export function saveSessionState(data) {
  localStorage.setItem(
    K.session,
    JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      ...data,
    }),
  )
}

export function loadSessionState() {
  const raw = localStorage.getItem(K.session)
  const o = safeParse(raw, null)
  if (!o || o.version !== 1 || !Array.isArray(o.words)) return null
  return o
}

export function clearSessionState() {
  localStorage.removeItem(K.session)
}

/** Kiểm tra phiên lưu còn hợp lệ với pool CSV. */
export function isSessionValidForPool(saved, pool) {
  if (!saved || !Array.isArray(saved.words) || saved.words.length < 4) return false
  const pset = new Set(pool)
  if (!saved.words.every((w) => pset.has(w))) return false
  const idx = Number(saved.index) || 0
  if (idx < 0 || idx >= saved.words.length) return false
  return true
}

