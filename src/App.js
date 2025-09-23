import { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

const LS = {
  level: "opic:level",
  role: "opic:role",
  residence: "opic:residence",
  recentCourse: "opic:recentCourse",
  topics: "opic:selectedTopics",
  history: "opicHistory",
};

const SURVEY = {
  residenceOptions: [
    "개인 주택/아파트 단독 거주",
    "주택/아파트에서 친구·룸메이트와 거주",
    "주택/아파트에서 가족과 함께 거주",
    "학교 기숙사",
    "그 외",
  ],
  recentCourseOptions: [
    "학위 과정 수업",
    "전문 기술 향상을 위한 평생 학습",
    "어학 수업",
    "수강 후 5년 이상 지남",
  ],
  roles: ["학생", "사무직", "프리랜서", "파트타이머", "무직", "기타"],
  topics: [
    { key: "intro", label: "Self-introduction (name, city, family, job/school)" },
    { key: "residence", label: "Residence type (apartment/house/dorm)" },
    { key: "jobMajor", label: "Job or major" },
    { key: "env", label: "Study/work environment (office/classroom/remote)" },
    { key: "travelKR", label: "Travel (domestic)" },
    { key: "travelAbroad", label: "Travel (abroad)" },
    { key: "camping", label: "Camping 🏕" },
    { key: "hiking", label: "Hiking" },
    { key: "workout", label: "Exercise (jogging/gym/yoga/bike/swim)" },
    { key: "music", label: "Music / instrument" },
    { key: "movies", label: "Movies / TV" },
    { key: "reading", label: "Reading" },
    { key: "gaming", label: "Gaming 🎮" },
    { key: "photo", label: "Photography" },
    { key: "cooking", label: "Cooking / baking" },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FALLBACK_QUESTIONS = [
  "Tell me about a recent weekend activity you really enjoyed and why it was meaningful.",
  "Describe your favorite place at home and how you usually spend time there.",
  "Talk about a hobby you picked up recently and how you got into it.",
  "Share a memorable trip you took with friends or family and what made it special.",
  "Explain your daily routine on a busy weekday from morning to night.",
  "Describe a simple recipe you like to make at home and why you enjoy it.",
  "Talk about a movie or TV show you watched recently and your honest opinion.",
  "Tell me about a time you helped someone and how it made you feel.",
];

function App() {
  // Common UI state
  const [ui, setUi] = useState("start");
  const [serverReady, setServerReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("AI가 맞춤형 질문을 생성중입니다...");

  // Survey state
  const [level, setLevel] = useState(localStorage.getItem(LS.level) || "IH–AL");
  const [residence, setResidence] = useState(localStorage.getItem(LS.residence) || "");
  const [role, setRole] = useState(localStorage.getItem(LS.role) || "");
  const [recentCourse, setRecentCourse] = useState(localStorage.getItem(LS.recentCourse) || "");
  const [selectedTopics, setSelectedTopics] = useState(
    JSON.parse(localStorage.getItem(LS.topics) || "[]")
  );

  // Practice state
  const [question, setQuestion] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recMime, setRecMime] = useState("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);

  // Review state
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);
  const [reviewMode, setReviewMode] = useState('latest'); // 'latest' or 'list'

  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Question bank cache
  const [questionBank, setQuestionBank] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  // Scroll buttons state and functions
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

  /* ── Wake up backend server ─────────────────────── */
  const wakeBackend = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Health ${res.status}`);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      for (let i = 0; i < 3; i++) {
        const ok = await wakeBackend();
        if (ok) break;
        await sleep(3000);
      }
      if (mounted) setServerReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  /* ── Timer ──────────────────────────── */
  useEffect(() => {
    if (ui !== "practice" || !timerRunning) return;
    if (timeLeft <= 0) {
      setIsFinished(true);
      setTimerRunning(false);
      return;
    }
    const id = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [ui, timerRunning, timeLeft]);

  /* ── Scroll Buttons Visibility Logic ───────────────── */
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 200;
      setShowScrollTop(isScrolled);

      if (ui === 'review' && reviewMode === 'list') {
        const isAtBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
        setShowScrollBottom(!isAtBottom && document.body.scrollHeight > window.innerHeight + 50);
      } else {
        setShowScrollBottom(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Run on mount and view change

    return () => window.removeEventListener('scroll', handleScroll);
  }, [ui, reviewMode, savedHistory]);


  /* ── Question Bank Cache ──────────────────── */
  const fetchQuestionBatch = async () => {
    const selectedTopicLabels = SURVEY.topics
      .filter(t => selectedTopics.includes(t.key))
      .map(t => t.label);

    const prompt = `
You are an expert OPIC coach. Generate 20 personalized, OPIC-style interview questions in English based on the user's profile below.
- Return ONLY a JSON array of strings. No extra text or commentary.
- Each question should be a single sentence, 14-22 words long.
- Questions should be diverse and not repetitive.

---
[User Profile]
Target Level: ${level}
Role: ${role || 'Not specified'}
Residence: ${residence || 'Not specified'}
Recent Course: ${recentCourse || 'Not specified'}
Selected Topics of Interest: ${selectedTopicLabels.length > 0 ? selectedTopicLabels.join(', ') : 'General everyday topics (home, routine, hobbies, work, school, travel, etc.)'}
---

Now, generate the questions.
`.trim();

    try {
      setBankLoading(true);
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const data = await res.json();

      // [수정됨] AI 답변에서 순수 JSON 배열만 추출하는 로직
      let arr = [];
      const rawAnswer = data?.answer || "";
      const jsonMatch = rawAnswer.match(/\[.*\]/s); // 정규표현식으로 배열 부분만 찾기

      if (jsonMatch && jsonMatch[0]) {
        try {
          arr = JSON.parse(jsonMatch[0]); // 찾은 부분만 파싱
        } catch (e) {
          console.error("Failed to parse extracted JSON:", e);
          arr = []; // 파싱 실패 시 빈 배열로 초기화
        }
      }

      if (!Array.isArray(arr) || arr.length === 0) {
        arr = FALLBACK_QUESTIONS;
      }
      setQuestionBank(prev => [...prev, ...arr.filter(Boolean)]);
    } finally {
      setBankLoading(false);
    }
  };

  const ensureQuestionBank = async () => {
    if (questionBank.length >= 1 || bankLoading) return;
    await fetchQuestionBatch();
  };

  const getNextQuestionFromBank = () => new Promise(async (resolve) => {
    await ensureQuestionBank();
    setQuestionBank(currentBank => {
      if (currentBank.length === 0) {
        resolve("");
        return [];
      }
      const [q, ...rest] = currentBank;
      if (rest.length < 5 && !bankLoading) {
        fetchQuestionBatch();
      }
      resolve(q);
      return rest;
    });
  });

  /* ── Main Practice Logic ─────────────── */
  const runOne = async () => {
    setLoadingText("AI가 맞춤형 질문을 생성중입니다...");
    setLoading(true);
    setTimeLeft(60);
    setTimerRunning(false);
    setIsFinished(false);
    setMemo("");
    setAudioURL("");

    try {
      const q = await getNextQuestionFromBank();
      if (!q) {
        await ensureQuestionBank();
        const finalQ = await getNextQuestionFromBank();
        if (!finalQ) {
          alert("질문 생성에 실패했습니다. 새로고침 해주세요.");
          setLoading(false);
          return;
        }
        setQuestion(finalQ);
      } else {
        setQuestion(q);
      }

      const questionToSpeak = q || question;

      if (questionToSpeak) {
        const res = await fetch(`${API_BASE}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: questionToSpeak }),
        });

        if (!res.ok) throw new Error('TTS request failed');

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        if (audioRef.current && videoRef.current) {
          audioRef.current.onended = () => {
            videoRef.current?.pause();
            setTimeLeft(60);
            setTimerRunning(true);
          };

          videoRef.current.onended = () => {
            if (audioRef.current && !audioRef.current.paused) {
              videoRef.current.play();
            }
          };

          audioRef.current.src = audioUrl;
          videoRef.current.currentTime = 0;
          await videoRef.current.play();
          await audioRef.current.play();
        }
      }

    } catch (e) {
      console.error('runOne failed', e);
      alert("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Entry point for practice screen ── */
  useEffect(() => {
    if (ui !== "practice") return;
    runOne();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui]);

  /* ── Recording Logic ────────────────── */
  const startRecording = async () => {
    try {
      const preferredMime = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      setRecMime(preferredMime);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      const chunks = [];
      recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
      recorder.start();
      recorder.chunks = chunks;
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Recording start error:", err);
      alert("마이크 권한을 확인해 주세요 (설정 > 브라우저 > 마이크 허용).");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorder) return;
    try {
      mediaRecorder.onstop = async () => {
        setLoadingText("음성을 텍스트로 변환 중입니다...");
        setLoading(true);
        const type = recMime || "audio/webm";
        const audioBlob = new Blob(mediaRecorder.chunks, { type });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.${type.split('/')[1]}`);

          const res = await fetch(`${API_BASE}/api/transcribe`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error('Transcription failed');

          const data = await res.json();
          if (data.text) {
            setMemo(data.text);
          }
        } catch (e) {
          console.error("Transcription error:", e);
          alert("음성을 텍스트로 변환하는 데 실패했습니다.");
        } finally {
          setLoading(false);
        }
      };
      mediaRecorder.stop();
      setIsRecording(false);
      setIsFinished(true);
    } catch (e) {
      console.error("Recording stop error:", e);
    }
  };

  /* ── GPT Model Answer Logic ──────────── */
  const modelAnswerPrompt = (q) => `
You are an OPIC rater and coach.
Write a model answer in English for the prompt below at IM2–IH level.
- 120–180 words, first-person, natural spoken style, 1–2 concrete examples.
Prompt:
${q}
`.trim();

  const fetchBestAnswerFromGPT = async () => {
    if (!question.trim()) return alert("질문이 먼저 필요해요!");
    setLoadingText("모범답안을 생성 중입니다...");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: modelAnswerPrompt(question) }),
      });
      const data = await res.json();
      const answer = (data?.answer || "").trim();
      if (answer) {
        setMemo(
          (prev) => prev + `\n\n\n➡️ AI 모범답안:\n\n${answer}`
        );
      } else {
        alert("모범답안 생성 실패");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Save to History Logic ───────────── */
  const handleSave = () => {
    if (!memo.trim()) return alert("📝 답변을 먼저 입력해주세요!");
    const saved = JSON.parse(localStorage.getItem(LS.history) || "[]");

    const separator = "➡️ AI 모범답안:";
    const newEntry = {
      question,
      memo: memo.split(separator)[0].trim(),
      gptAnswer: memo.includes(separator)
        ? memo.split(separator)[1].trim()
        : "",
    };
    localStorage.setItem(LS.history, JSON.stringify([...saved, newEntry]));
    alert("저장되었습니다!");
  };

  /* ── Render Method ───────────────────── */
  return (
    <>
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="scroll-btn scroll-to-top-btn"
          title="맨 위로"
        >
          <i className="fas fa-arrow-up"></i>
        </button>
      )}

      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="scroll-btn scroll-to-bottom-btn"
          title="맨 아래로"
        >
          <i className="fas fa-arrow-down"></i>
        </button>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-logo-reveal">
            <h1>
              {'OPIC'.split('').map((char, index) => (
                <span
                  key={index}
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  {char}
                </span>
              ))}
            </h1>
            <p>{loadingText}</p>
          </div>
        </div>
      )}

      {!serverReady && (
        <div className="start-screen">
          <h1 className="start-title">OPIC</h1>
          <p className="start-subtitle">서버 깨우는 중…</p>
        </div>
      )}

      {serverReady && ui === 'start' && (
        <div className="start-screen">
          <h1 className="start-title">OPIC</h1>
          <p className="start-subtitle" onClick={() => setUi("survey")} style={{ cursor: "pointer" }}>
            Let’s start practice
          </p>
        </div>
      )}

      {serverReady && ui === 'survey' && (
        <div className="survey-wrap">
          <div className="survey-card">
            <h2 className="survey-title">
              <i className="fa-regular fa-file-lines" style={{ marginRight: 10 }} />
              OPIC Survey
            </h2>

            <div className="survey-grid">
              <div className="field">
                <label>레벨</label>
                <select
                  value={level}
                  onChange={(e) => { setLevel(e.target.value); localStorage.setItem(LS.level, e.target.value); }}
                >
                  {["IM2–IH", "IL–IM1", "IH–AL"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>거주 형태</label>
                <select
                  value={residence}
                  onChange={(e) => { setResidence(e.target.value); localStorage.setItem(LS.residence, e.target.value); }}
                >
                  <option value="">(선택)</option>
                  {SURVEY.residenceOptions.map((x) => (<option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>역할</label>
                <select
                  value={role}
                  onChange={(e) => { setRole(e.target.value); localStorage.setItem(LS.role, e.target.value); }}
                >
                  <option value="">(선택)</option>
                  {SURVEY.roles.map((x) => (<option key={x} value={x}>{x}</option>))}
                </select>
              </div>

              <div className="field">
                <label>최근 수강 이력</label>
                <select
                  value={recentCourse}
                  onChange={(e) => { setRecentCourse(e.target.value); localStorage.setItem(LS.recentCourse, e.target.value); }}
                >
                  <option value="">(선택)</option>
                  {SURVEY.recentCourseOptions.map((x) => (<option key={x} value={x}>{x}</option>))}
                </select>
              </div>
            </div>

            <div className="topics">
              <div className="topics-head">Topics (multi-select)</div>
              <div className="chip-row">
                {SURVEY.topics.map((t) => {
                  const active = selectedTopics.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        setSelectedTopics((prev) => {
                          const next = prev.includes(t.key)
                            ? prev.filter((k) => k !== t.key)
                            : [...prev, t.key];
                          localStorage.setItem(LS.topics, JSON.stringify(next));
                          return next;
                        });
                      }}
                      className={`chip ${active ? "active" : ""}`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="hint">아무 것도 선택하지 않으면 모든 주제에서 무작위로 출제됩니다.</p>
            </div>

            <div className="actions">
              <button className="btn ghost" onClick={() => setUi("start")}>뒤로</button>
              <button
                className="btn primary"
                disabled={loading}
                onClick={() => {
                  setQuestionBank([]);
                  setQuestion("");
                  setUi("practice");
                }}
              >
                {"이 설정으로 시작"}
              </button>
            </div>
          </div>
        </div>
      )}

      {serverReady && ui === 'practice' && (
        <div className="App started">
          <h2>{question}</h2>
          <h3>남은 시간: {timeLeft}초</h3>

          <div style={{ position: "relative", width: 360, height: 360, marginTop: 16 }}>
            <video
              ref={videoRef}
              src="/avatar.mp4"
              muted
              playsInline
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 16, objectFit: "cover" }}
            />
            <audio ref={audioRef} />
          </div>

          <button
            className="btn primary"
            onClick={() => {
              videoRef.current?.play();
              audioRef.current?.play();
            }}
            style={{ marginTop: 12 }}
          >
            ▶ 다시 듣기
          </button>

          {!isRecording ? (
            <button onClick={startRecording} disabled={!timerRunning} style={{ marginTop: 16 }}>
              <i className="fas fa-microphone"></i> {timerRunning ? '답변 녹음 시작' : '질문 듣고 답변하세요'}
            </button>
          ) : (
            <button onClick={stopRecording} style={{ marginTop: 16 }}>
              <i className="fas fa-stop-circle"></i> 녹음 정지
            </button>
          )}

          {audioURL && (
            <div style={{ marginTop: 12 }}>
              <audio controls src={audioURL} />
            </div>
          )}

          <button
            onClick={runOne}
            disabled={loading}
            style={{ marginTop: 16 }}
          >
            <i className="fas fa-shuffle"></i> {loading ? "새 질문 로딩…" : "다른 질문 받기"}
          </button>

          <div style={{ marginTop: 40 }}>
            <h3>📝 내 답변 메모하기</h3>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={5}
              cols={50}
              placeholder="여기에 영어로 말한 내용을 적어보세요!"
            />
          </div>

          {isFinished && (
            <>
              <button onClick={fetchBestAnswerFromGPT} disabled={loading}>
                <i className="fas fa-magic"></i> {loading ? '생성중...' : '모범답안 요청하기'}
              </button>
              <button onClick={handleSave}>
                <i className="fas fa-floppy-disk"></i> 질문 + 메모 저장
              </button>
              <button
                onClick={() => {
                  const history = JSON.parse(localStorage.getItem(LS.history) || "[]");
                  if (history.length === 0) {
                    alert("저장된 질문이 없습니다.");
                    return;
                  }
                  setSavedHistory(history);
                  setReviewMode('latest');
                  setUi("review");
                }}
              >
                <i className="fas fa-folder-open"></i> 저장된 질문/답변 보기
              </button>
            </>
          )}

          <div className="practice-actions">
            <button type="button" className="btn-reset" onClick={() => setUi("survey")} title="설문 다시하기">
              <i className="fas fa-arrow-left icon-nudge" aria-hidden="true"></i> 설문 다시하기
            </button>
          </div>
        </div>
      )}

      {serverReady && ui === 'review' && (
        reviewMode === 'latest' ? (
          <div className="App started review-latest-view">
            {savedHistory.length > 0 && (() => {
              const latestItem = savedHistory[savedHistory.length - 1];
              return (
                <div className="question-block">
                  <div className="review-header">
                    <div className="review-header-left">
                      <i className="fas fa-sparkles"></i>
                      <h3>최근 복습 질문</h3>
                    </div>
                    <span className="latest-badge">LATEST</span>
                  </div>

                  <div className="review-content">
                    <p className="latest-review-question"><strong>{latestItem.question}</strong></p>
                    <div className="answer-content">
                      <p style={{ whiteSpace: "pre-wrap" }}>💬 <em>{latestItem.memo}</em></p>
                      {latestItem.gptAnswer && (
                        <div className="gpt-answer-box">
                          <strong>➡️ AI 모범답안</strong>
                          <em>{latestItem.gptAnswer}</em>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="review-actions">
              <button onClick={() => { setReviewMode('list'); setOpenAnswerIndex(null); }}>
                <i className="fas fa-list-ul"></i> 전체 목록 보기
              </button>
              <button onClick={() => setUi("practice")}>
                <i className="fas fa-arrow-left"></i> 다른 문제 풀기
              </button>
            </div>
          </div>
        ) : (
          <div className="App started review-mode">
            <h2>
              <i className="fas fa-book-journal-whills" style={{ color: "#4e47d1", marginRight: 10 }}></i>
              저장된 질문과 답변
            </h2>

            <button onClick={() => setUi("practice")}>
              <i className="fas fa-arrow-left"></i> 다른 문제 풀기
            </button>

            {savedHistory.slice().reverse().map((item, index) => (
              <div key={index} className="question-block">
                <p>
                  <strong>
                    <i className="fas fa-question-circle" style={{ marginRight: 8, color: "#6c63ff" }}></i>
                    Q{savedHistory.length - index}. {item.question}
                  </strong>
                </p>

                <button
                  onClick={() => setOpenAnswerIndex(openAnswerIndex === index ? null : index)}
                  className={`review-toggle-btn ${openAnswerIndex === index ? 'open' : ''}`}
                >
                  <i className={`fas ${openAnswerIndex === index ? "fa-chevron-up" : "fa-comment-dots"}`}></i>
                  &nbsp;{openAnswerIndex === index ? "답변 숨기기" : "답변 보기"}
                </button>

                {openAnswerIndex === index && (
                  <div className="answer-content">
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      💬 <em>{item.memo}</em>
                    </p>
                    {item.gptAnswer && (
                      <div className="gpt-answer-box">
                        <strong>➡️ AI 모범답안</strong>
                        <em>{item.gptAnswer}</em>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </>
  );
}

export default App;
