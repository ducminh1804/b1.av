import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildOptions,
  fetchEnglishDictionaryEntry,
  loadWordsFromCsv,
  shuffleArray,
  translateEnToVi,
} from './quizUtils'
import {
  appendHistory,
  clearSessionState,
  getWeakWordsInPool,
  isSessionValidForPool,
  loadHistory,
  loadSessionState,
  recordWrongWord,
  saveSessionState,
} from './quizStorage'
import './App.css'

const CSV_URL = '/vocabulary.csv'
const ADVANCE_MS = 850

function EyeClosedIcon() {
  return (
    <svg
      className="quiz-eye-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c4 0 7.3 2.6 9 6a9.8 9.8 0 0 1-1.4 2.4M6.3 6.3A9.4 9.4 0 0 0 3 11c1.7 3.4 5 6 9 6 1.1 0 2.1-.2 3.1-.5" />
    </svg>
  )
}

function EyeOpenIcon() {
  return (
    <svg
      className="quiz-eye-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg
      className="quiz-speak-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function formatHistoryDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('vi-VN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function App() {
  const [phase, setPhase] = useState('loading')
  const [pool, setPool] = useState([])
  const [words, setWords] = useState([])
  const [index, setIndex] = useState(0)
  const [preferRandom, setPreferRandom] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [sessionMode, setSessionMode] = useState('full')
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionWrong, setSessionWrong] = useState(0)
  const [sessionWrongWords, setSessionWrongWords] = useState([])

  const [dictEntry, setDictEntry] = useState(null)
  const [defLoading, setDefLoading] = useState(false)
  const [options, setOptions] = useState([])
  const [picked, setPicked] = useState(null)
  const [locked, setLocked] = useState(false)

  const [viOpen, setViOpen] = useState(false)
  const [viText, setViText] = useState(null)
  const [viLoading, setViLoading] = useState(false)

  const [history, setHistory] = useState([])
  const [savedSession, setSavedSession] = useState(null)
  const [weakInPool, setWeakInPool] = useState([])
  const [saveToast, setSaveToast] = useState('')

  const abortRef = useRef(null)
  const viAbortRef = useRef(null)
  const advanceTimerRef = useRef(null)
  const saveToastTimerRef = useRef(null)
  const pronAudioRef = useRef(null)

  const currentWord = words[index] ?? null

  const refreshSetupData = useCallback(() => {
    setHistory(loadHistory())
    setSavedSession(loadSessionState())
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadWordsFromCsv(CSV_URL)
        if (cancelled) return
        if (list.length < 4) {
          setLoadError('Cần ít nhất 4 từ trong file CSV.')
          setPhase('setup')
          return
        }
        setPool(list)
        setLoadError(null)
        setPhase('setup')
      } catch (e) {
        if (!cancelled) {
          setLoadError(e.message || 'Lỗi tải dữ liệu')
          setPhase('setup')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (phase === 'setup' && pool.length) {
      refreshSetupData()
      setWeakInPool(getWeakWordsInPool(pool))
    }
  }, [phase, pool, refreshSetupData])

  const resetQuizSession = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    abortRef.current?.abort()
    viAbortRef.current?.abort()
    setPicked(null)
    setLocked(false)
    setDictEntry(null)
    setDefLoading(false)
    setOptions([])
    setViOpen(false)
    setViText(null)
    setViLoading(false)
  }, [])

  const resetSessionScores = useCallback(() => {
    setSessionCorrect(0)
    setSessionWrong(0)
    setSessionWrongWords([])
  }, [])

  const handleStart = () => {
    if (pool.length < 4) return
    clearSessionState()
    resetQuizSession()
    resetSessionScores()
    setSessionMode('full')
    setWords(preferRandom ? shuffleArray(pool) : [...pool])
    setIndex(0)
    setPhase('quiz')
  }

  const handleStartReview = () => {
    const weak = getWeakWordsInPool(pool)
    if (weak.length < 4) return
    clearSessionState()
    resetQuizSession()
    resetSessionScores()
    setSessionMode('review')
    setWords(shuffleArray([...weak]))
    setIndex(0)
    setPhase('quiz')
  }

  const handleResume = () => {
    const s = loadSessionState()
    if (!s || !isSessionValidForPool(s, pool)) {
      refreshSetupData()
      return
    }
    resetQuizSession()
    setWords([...s.words])
    setIndex(Number(s.index) || 0)
    setSessionCorrect(Number(s.correctCount) || 0)
    setSessionWrong(Number(s.wrongCount) || 0)
    setSessionWrongWords(
      Array.isArray(s.wrongWords) ? [...s.wrongWords] : [],
    )
    setPreferRandom(!!s.preferRandom)
    setSessionMode(s.mode === 'review' ? 'review' : 'full')
    setPhase('quiz')
  }

  const handleClearSavedSession = () => {
    clearSessionState()
    refreshSetupData()
  }

  const handleExitQuiz = () => {
    resetQuizSession()
    setWords([])
    setIndex(0)
    setPhase('setup')
  }

  const goNext = useCallback(() => {
    setPicked(null)
    setLocked(false)
    setDictEntry(null)
    setViOpen(false)
    setIndex((i) => {
      if (words.length === 0) return 0
      return (i + 1) % words.length
    })
  }, [words.length])

  const handlePrevious = () => {
    if (index <= 0) return
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    resetQuizSession()
    setIndex((i) => Math.max(0, i - 1))
  }

  const handleSaveProgress = () => {
    if (phase !== 'quiz' || !words.length) return
    saveSessionState({
      words,
      index,
      correctCount: sessionCorrect,
      wrongCount: sessionWrong,
      wrongWords: sessionWrongWords,
      preferRandom,
      mode: sessionMode,
    })
    if (saveToastTimerRef.current) clearTimeout(saveToastTimerRef.current)
    setSaveToast('Đã lưu tiến độ.')
    saveToastTimerRef.current = setTimeout(() => setSaveToast(''), 2500)
    refreshSetupData()
  }

  const handleFinishSession = () => {
    const answered = sessionCorrect + sessionWrong
    const msg =
      answered === 0
        ? 'Chưa có câu nào được trả lời. Vẫn kết thúc và lưu phiên (0 điểm)?'
        : `Kết thúc phiên và lưu kết quả?\nĐúng ${sessionCorrect} · Sai ${sessionWrong} · Đã trả lời ${answered} câu.`
    if (!window.confirm(msg)) return

    const accuracyPct =
      answered > 0 ? Math.round((sessionCorrect / answered) * 100) : 0

    appendHistory({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()),
      endedAt: new Date().toISOString(),
      mode: sessionMode,
      preferRandom,
      answered,
      correct: sessionCorrect,
      wrong: sessionWrong,
      accuracyPct,
      wrongWords: [...sessionWrongWords],
      deckSize: words.length,
      stoppedAtIndex: index,
    })

    clearSessionState()
    resetQuizSession()
    setWords([])
    setIndex(0)
    resetSessionScores()
    setPhase('setup')
    refreshSetupData()
  }

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) clearTimeout(saveToastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'quiz' || !currentWord || pool.length < 4) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setDefLoading(true)
    setDictEntry(null)
    setViOpen(false)
    setViText(null)
    setViLoading(false)
    setOptions(buildOptions(pool, currentWord))
    setPicked(null)
    setLocked(false)

    ;(async () => {
      const entry = await fetchEnglishDictionaryEntry(currentWord, ac.signal)
      if (ac.signal.aborted) return
      setDictEntry(entry)
      setDefLoading(false)

      if (!entry) return

      viAbortRef.current?.abort()
      const viAc = new AbortController()
      viAbortRef.current = viAc
      setViText(null)
      setViLoading(true)

      try {
        const translated = await translateEnToVi(entry.senseLine, viAc.signal)
        if (!viAc.signal.aborted) {
          setViText(translated || 'Không dịch được. Thử lại sau.')
        }
      } catch {
        if (!viAc.signal.aborted) {
          setViText('Không dịch được. Thử lại sau.')
        }
      } finally {
        if (!viAc.signal.aborted) setViLoading(false)
      }
    })()

    return () => {
      ac.abort()
      viAbortRef.current?.abort()
    }
  }, [currentWord, pool, phase])

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [])

  const handleViToggle = () => {
    if (!dictEntry) return
    setViOpen((o) => !o)
  }

  const stopPronunciation = useCallback(() => {
    try {
      pronAudioRef.current?.pause()
    } catch {
      /* ignore */
    }
    pronAudioRef.current = null
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const handleSpeak = useCallback(() => {
    if (!currentWord?.trim()) return
    stopPronunciation()
    const url = dictEntry?.audioUrl
    if (url) {
      const a = new Audio(url)
      pronAudioRef.current = a
      a.addEventListener('ended', () => {
        pronAudioRef.current = null
      })
      a.play().catch(() => {
        const u = new SpeechSynthesisUtterance(currentWord.trim())
        u.lang = 'en-US'
        u.rate = 0.95
        window.speechSynthesis?.speak(u)
      })
    } else {
      const u = new SpeechSynthesisUtterance(currentWord.trim())
      u.lang = 'en-US'
      u.rate = 0.95
      window.speechSynthesis?.speak(u)
    }
  }, [currentWord, dictEntry?.audioUrl, stopPronunciation])

  useEffect(() => {
    return () => stopPronunciation()
  }, [currentWord, stopPronunciation])

  const handlePick = (choice) => {
    if (locked || !currentWord) return
    const ok = choice === currentWord
    if (ok) {
      setSessionCorrect((c) => c + 1)
    } else {
      setSessionWrong((c) => c + 1)
      recordWrongWord(currentWord)
      setSessionWrongWords((prev) =>
        prev.includes(currentWord) ? prev : [...prev, currentWord],
      )
      setWeakInPool(getWeakWordsInPool(pool))
    }
    setPicked(choice)
    setLocked(true)
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      goNext()
    }, ADVANCE_MS)
  }

  const progressPct =
    words.length > 0 ? Math.round(((index + 1) / words.length) * 100) : 0

  const answered = sessionCorrect + sessionWrong
  const canResume =
    savedSession && pool.length >= 4 && isSessionValidForPool(savedSession, pool)
  const reviewReady = weakInPool.length >= 4

  if (loadError && phase === 'setup' && !pool.length) {
    return (
      <div className="quiz-page">
        <div className="quiz-surface quiz-surface--narrow">
          <div className="quiz-card quiz-card--elevated">
            <h1 className="quiz-title quiz-title--sm">Không tải được dữ liệu</h1>
            <p className="quiz-error-text">{loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="quiz-page">
        <div className="quiz-surface quiz-surface--narrow">
          <div className="quiz-card quiz-card--elevated quiz-card--loading">
            <div className="quiz-spinner" aria-hidden />
            <p className="quiz-loading-label">Đang tải danh sách từ…</p>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'setup') {
    return (
      <div className="quiz-page">
        <div className="quiz-surface quiz-surface--narrow">
          <div className="quiz-card quiz-card--elevated quiz-setup">
            <span className="quiz-pill">Tiếng Anh · Trắc nghiệm</span>
            <h1 className="quiz-title">Luyện từ vựng</h1>
            <p className="quiz-lead">
              Đọc định nghĩa tiếng Anh, chọn đúng từ trong bốn đáp án. Có thể xem
              gợi ý tiếng Việt bằng nút mắt.
            </p>
            {pool.length >= 4 && (
              <p className="quiz-meta">
                <strong>{pool.length}</strong> từ trong{' '}
                <code className="quiz-code">vocabulary.csv</code>
              </p>
            )}

            {canResume && (
              <div className="quiz-resume-banner">
                <p className="quiz-resume-title">Phiên làm dở</p>
                <p className="quiz-resume-desc">
                  Câu {(savedSession.index ?? 0) + 1} / {savedSession.words.length}
                  {savedSession.mode === 'review'
                    ? ' · Chế độ ôn tập'
                    : ' · Luyện toàn bộ'}
                </p>
                <div className="quiz-resume-actions">
                  <button
                    type="button"
                    className="quiz-btn quiz-btn--secondary quiz-btn--block"
                    onClick={handleResume}
                  >
                    Tiếp tục phiên đã lưu
                  </button>
                  <button
                    type="button"
                    className="quiz-btn quiz-btn--ghost quiz-btn--small"
                    onClick={handleClearSavedSession}
                  >
                    Xóa phiên đã lưu
                  </button>
                </div>
              </div>
            )}

            <div className="quiz-weak-block">
              <h2 className="quiz-subheading">Ôn tập từ hay nhầm</h2>
              <p className="quiz-weak-desc">
                Các từ bạn đã trả lời sai được ghi lại để luyện lại. Cần ít nhất 4
                từ trong danh sách và có trong file CSV.
              </p>
              <p className="quiz-weak-count">
                Hiện có <strong>{weakInPool.length}</strong> từ cần ôn
              </p>
              <button
                type="button"
                className="quiz-btn quiz-btn--secondary quiz-btn--block"
                disabled={!reviewReady}
                onClick={handleStartReview}
              >
                Bắt đầu ôn tập thẻ yếu
              </button>
              {!reviewReady && pool.length >= 4 && (
                <p className="quiz-hint-warn quiz-hint-warn--inline">
                  Làm bài và trả lời sai để bổ sung danh sách (tối thiểu 4 từ).
                </p>
              )}
            </div>

            <fieldset className="quiz-fieldset">
              <legend className="quiz-legend">Thứ tự câu hỏi (luyện toàn bộ)</legend>
              <div className="quiz-mode-grid">
                <label
                  className={`quiz-mode-tile${!preferRandom ? ' quiz-mode-tile--on' : ''}`}
                >
                  <input
                    className="quiz-mode-input"
                    type="radio"
                    name="order"
                    checked={!preferRandom}
                    onChange={() => setPreferRandom(false)}
                  />
                  <span className="quiz-mode-icon" aria-hidden>
                    ≡
                  </span>
                  <span className="quiz-mode-name">Theo thứ tự file</span>
                  <span className="quiz-mode-desc">
                    Giữ đúng thứ tự trong CSV
                  </span>
                </label>
                <label
                  className={`quiz-mode-tile${preferRandom ? ' quiz-mode-tile--on' : ''}`}
                >
                  <input
                    className="quiz-mode-input"
                    type="radio"
                    name="order"
                    checked={preferRandom}
                    onChange={() => setPreferRandom(true)}
                  />
                  <span className="quiz-mode-icon" aria-hidden>
                    ✦
                  </span>
                  <span className="quiz-mode-name">Ngẫu nhiên</span>
                  <span className="quiz-mode-desc">Xáo trộn toàn bộ danh sách</span>
                </label>
              </div>
            </fieldset>

            <button
              type="button"
              className="quiz-btn quiz-btn--primary"
              disabled={pool.length < 4}
              onClick={handleStart}
            >
              Bắt đầu luyện toàn bộ
            </button>
            {pool.length > 0 && pool.length < 4 && (
              <p className="quiz-hint-warn">
                Cần ít nhất 4 từ trong CSV để làm bài.
              </p>
            )}

            {history.length > 0 && (
              <div className="quiz-history">
                <h2 className="quiz-subheading">Lịch sử làm bài</h2>
                <ul className="quiz-history-list">
                  {history.slice(0, 12).map((h) => (
                    <li key={h.id} className="quiz-history-item">
                      <span className="quiz-history-date">
                        {formatHistoryDate(h.endedAt)}
                      </span>
                      <span className="quiz-history-meta">
                        {h.mode === 'review' ? 'Ôn tập' : 'Toàn bộ'} · Đúng{' '}
                        <strong>{h.correct}</strong> / {h.answered} ·{' '}
                        {h.answered ? `${h.accuracyPct}%` : '—'}
                        {h.wrongWords?.length > 0 && (
                          <span className="quiz-history-wrong">
                            {' '}
                            · Sai: {h.wrongWords.length} từ
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quiz-page">
      <div className="quiz-surface">
        <div className="quiz-card quiz-card--elevated quiz-play">
          <div className="quiz-topbar">
            <button
              type="button"
              className="quiz-btn quiz-btn--ghost"
              onClick={handleExitQuiz}
            >
              ← Menu
            </button>
            <div className="quiz-progress-block">
              <div
                className="quiz-progress-track"
                role="progressbar"
                aria-valuenow={index + 1}
                aria-valuemin={1}
                aria-valuemax={words.length || 1}
                aria-label="Tiến độ"
              >
                <div
                  className="quiz-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="quiz-progress-label">
                {words.length ? index + 1 : 0} / {words.length}
              </span>
            </div>
          </div>

          <div className="quiz-session-bar">
            <span className="quiz-session-pill">
              {sessionMode === 'review' ? 'Ôn tập thẻ yếu' : 'Luyện toàn bộ'}
            </span>
            <span className="quiz-session-stats">
              Phiên này: <strong>{sessionCorrect}</strong> đúng ·{' '}
              <strong>{sessionWrong}</strong> sai
              {answered > 0 && (
                <>
                  {' '}
                  · {Math.round((sessionCorrect / answered) * 100)}% chính xác
                </>
              )}
            </span>
          </div>

          <section className="quiz-panel" aria-live="polite">
            {defLoading && (
              <div className="quiz-def-loading">
                <div className="quiz-spinner quiz-spinner--sm" aria-hidden />
                <p>Đang tải nghĩa từ điển…</p>
              </div>
            )}
            {!defLoading && dictEntry && (
              <div className="quiz-def-block">
                <div className="quiz-def-meta">
                  {dictEntry.phonetic && (
                    <span className="quiz-phonetic" lang="en">
                      {dictEntry.phonetic}
                    </span>
                  )}
                  <button
                    type="button"
                    className="quiz-speak-btn"
                    onClick={handleSpeak}
                    aria-label="Phát âm từ vựng"
                    title={
                      dictEntry.audioUrl
                        ? 'Nghe phát âm (từ từ điển)'
                        : 'Nghe phát âm (giọng trình duyệt)'
                    }
                  >
                    <SpeakerIcon />
                  </button>
                </div>
                <p className="quiz-prompt" lang="en">
                  {dictEntry.senseLine}
                </p>
                {dictEntry.example && (
                  <p className="quiz-def-example" lang="en">
                    <span className="quiz-def-example-label">Ví dụ:</span>{' '}
                    {dictEntry.example}
                  </p>
                )}
                <div className="quiz-vi-toolbar">
                  <button
                    type="button"
                    className="quiz-eye-btn"
                    onClick={handleViToggle}
                    aria-pressed={viOpen}
                    aria-label={
                      viOpen
                        ? 'Ẩn bản dịch tiếng Việt'
                        : 'Hiện bản dịch tiếng Việt'
                    }
                    title={
                      viOpen ? 'Ẩn tiếng Việt' : 'Xem bản dịch (đã tải sẵn)'
                    }
                  >
                    {viOpen ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                  {!viOpen && viLoading && (
                    <span className="quiz-vi-preload-hint">Đang tải bản dịch…</span>
                  )}
                  {!viOpen && !viLoading && viText && (
                    <span className="quiz-vi-preload-hint quiz-vi-preload-hint--ready">
                      Sẵn sàng — bấm mắt để xem
                    </span>
                  )}
                </div>
                {viOpen && (
                  <div className="quiz-vi-panel" lang="vi">
                    {viLoading && (
                      <p className="quiz-vi-status">Đang dịch…</p>
                    )}
                    {!viLoading && viText && (
                      <p className="quiz-vi-text">{viText}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {!defLoading && !dictEntry && currentWord && (
              <div className="quiz-fallback">
                <p className="quiz-fallback-hint">
                  Không tải được nghĩa từ điển — chọn đúng từ trong bốn ô dưới.
                </p>
                <div className="quiz-fallback-term-row">
                  <p className="quiz-term" lang="en">
                    {currentWord}
                  </p>
                  <button
                    type="button"
                    className="quiz-speak-btn"
                    onClick={handleSpeak}
                    aria-label="Phát âm từ vựng"
                    title="Nghe phát âm (giọng trình duyệt)"
                  >
                    <SpeakerIcon />
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="quiz-grid" role="group" aria-label="Bốn đáp án">
            {options.map((opt) => {
              const isCorrect = opt === currentWord
              const isPicked = picked === opt
              const showGreen = locked && isCorrect
              const showRed = locked && isPicked && !isCorrect
              const shake =
                locked &&
                !isPicked &&
                isCorrect &&
                picked &&
                picked !== currentWord

              let cardClass = 'quiz-card quiz-answer'
              if (showGreen) cardClass += ' quiz-answer--correct'
              if (showRed) cardClass += ' quiz-answer--wrong'
              if (shake) cardClass += ' quiz-answer--shake'

              return (
                <button
                  key={`${index}-${opt}`}
                  type="button"
                  className={cardClass}
                  disabled={locked}
                  onClick={() => handlePick(opt)}
                >
                  <span className="quiz-answer-text">{opt}</span>
                </button>
              )
            })}
          </div>

          <div className="quiz-footer-actions">
            <button
              type="button"
              className="quiz-btn quiz-btn--secondary quiz-btn--grow"
              disabled={index <= 0 || locked}
              onClick={handlePrevious}
              title={
                locked
                  ? 'Đợi chuyển câu hoặc hết thời gian hiển thị đáp án'
                  : undefined
              }
            >
              ← Câu trước
            </button>
            <div className="quiz-footer-save-row">
              <button
                type="button"
                className="quiz-btn quiz-btn--secondary"
                onClick={handleSaveProgress}
              >
                Lưu tiến độ
              </button>
              <button
                type="button"
                className="quiz-btn quiz-btn--finish"
                onClick={handleFinishSession}
              >
                Kết thúc &amp; lưu kết quả
              </button>
            </div>
            {saveToast && (
              <p className="quiz-save-toast" role="status">
                {saveToast}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
