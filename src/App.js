// src/App.js
import { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

/* ====================== 환경 ====================== */
const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://opic-backend.onrender.com";
const IMAGE_URL =
  process.env.REACT_APP_AVATAR_IMAGE_URL ||
  `${window.location.origin}/avatar.png`;

/* =================== 디바이스 판별 (모바일) =================== */
// navigator 미정의(no-undef) 워닝 방지
const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/* =================== 로컬스토리지 키 =================== */
const LS = {
  level: "opic:level",
  role: "opic:role",
  residence: "opic:residence",
  recentCourse: "opic:recentCourse",
  topics: "opic:selectedTopics",
  history: "opicHistory",
};

/* ====================== 설문 옵션 ====================== */
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

/* =============== 브라우저 TTS 폴백(onEnd 지원, 모바일에선 미사용) =============== */
function playTTS(text, onEnd) {
  try {
    if (IS_MOBILE) return; // 모바일은 음성 완전 비활성화
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) =>
          /en-?US/i.test(v.lang) &&
          /female|Jenny|Google US English/i.test(v.name)
      ) || voices.find((v) => /en-?US/i.test(v.lang)) || voices[0];
    if (preferred) u.voice = preferred;
    if (onEnd) u.onend = onEnd;
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS unavailable:", e?.message);
  }
}

/* =============== 서버 TTS(여성 verse 우선, 모바일에선 미사용) =============== */
async function fetchQuestionAudio(question) {
  if (IS_MOBILE) return null; // 모바일은 음성 완전 비활성화
  try {
    const cacheKey = "opic:ttsCache:v2";
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "{}");
    if (cache[question]) return cache[question];

    const r = await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: question, voice: "verse" }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const url = j?.audioUrl || null;
    if (url) {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ ...cache, [question]: url })
      );
    }
    return url;
  } catch (e) {
    console.error("[/tts exception]", e);
    return null;
  }
}

function App() {
  /* =============== UI/공통 =============== */
  const [ui, setUi] = useState("start"); // start | survey | practice | review
  const [serverReady, setServerReady] = useState(false);
  const [loading, setLoading] = useState(false);

  /* =============== 설문 상태 =============== */
  const [level, setLevel] = useState(localStorage.getItem(LS.level) || "IH–AL");
  const [residence, setResidence] = useState(localStorage.getItem(LS.residence) || "");
  const [role, setRole] = useState(localStorage.getItem(LS.role) || "");
  const [recentCourse, setRecentCourse] = useState(localStorage.getItem(LS.recentCourse) || "");
  const [selectedTopics, setSelectedTopics] = useState(
    JSON.parse(localStorage.getItem(LS.topics) || "[]")
  );

  /* =============== 연습 상태 =============== */
  const [question, setQuestion] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recMime, setRecMime] = useState("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);

  /* =============== 질문 오디오(웹 전용) =============== */
  const [qAudioUrl, setQAudioUrl] = useState("");
  const [useTTS, setUseTTS] = useState(false);
  const audioRef = useRef(null);
  const shouldAutoplayRef = useRef(false); // 사용자 제스처 직후 자동재생(웹만 의미 있음)

  /* =============== 리뷰: 스크롤-투-탑 =============== */
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* =============== 질문 다양성: 직전 질문 보관 =============== */
  const prevQuestionRef = useRef("");

  /* =============== 서버 깨우기 =============== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function wakeBackend() {
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
    return () => {
      mounted = false;
    };
  }, []);

  /* =============== 타이머 =============== */
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

  /* =============== 질문 생성 프롬프트 (다양성 강화) =============== */
  const buildPrompt = () => {
    const chosenLabels = SURVEY.topics
      .filter((t) => selectedTopics.includes(t.key))
      .map((t) => t.label);

    const topicInstruction =
      chosenLabels.length > 0
        ? `Pick exactly ONE topic randomly from this list and stick to it → ${chosenLabels.join(" | ")}`
        : `Pick exactly ONE topic randomly from everyday life (home, routine, hobbies, work/school, travel, etc.).`;

    const profileBits = [
      `Target level: ${level}`,
      residence && `Residence: ${residence}`,
      role && `Role: ${role}`,
      recentCourse && `Recent course: ${recentCourse}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const antiRepeat = prevQuestionRef.current
      ? `Make it CLEARLY different from the previous question below by changing angle, verbs, tense, and required details.\nPrevious: "${prevQuestionRef.current}"`
      : `Vary the angle so it doesn't sound generic.`;

    return `
You are an OPIC examiner. Generate EXACTLY ONE OPIC-style interview question in English.

- ${topicInstruction}
- ${profileBits}
- ${antiRepeat}
- One concise question only (18–30 words).
- Force the learner to give specific details (time/place/people/reasons) without saying "give details" explicitly.
- No numbering, no instructions, no extra lines—return only the single question sentence.
`.trim();
  };

  /* =============== 질문 생성 + (웹: 오디오) 준비 =============== */
  const fetchQuestionFromGPT = async () => {
    try {
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch { }

    setLoading(true);
    setUseTTS(false);
    setQAudioUrl("");
    setTimeLeft(60);
    setTimerRunning(false);
    setIsFinished(false);
    setMemo("");
    setAudioURL("");

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: buildPrompt() }),
      });
      const data = await res.json();
      const msg = (data?.answer || "").trim();

      // 텍스트 상태는 갱신하되, 웹에선 오디오 준비가 끝날 때까지 화면에 숨김
      setQuestion(msg || "질문을 불러오지 못했습니다.");
      if (msg) prevQuestionRef.current = msg;

      // ▶ 모바일: 음성 완전 비활성화 → 질문 뜨면 바로 타이머 시작
      if (IS_MOBILE) {
        setTimeLeft(60);
        setTimerRunning(true);
        return;
      }

      // ▶ 웹: 서버 TTS(verse) → 실패 시 브라우저 TTS
      if (!msg) {
        setUseTTS(true);
        playTTS("Sorry, I couldn't load the question.", () => {
          setTimeLeft(60);
          setTimerRunning(true);
        });
        return;
      }

      const url = await fetchQuestionAudio(msg);
      if (url) {
        setQAudioUrl(url);
      } else {
        setUseTTS(true);
        playTTS(msg, () => {
          setTimeLeft(60);
          setTimerRunning(true);
        });
      }
    } catch (e) {
      console.error("질문 생성 오류:", e);
      setQuestion("질문을 불러오는 중 오류가 발생했습니다.");
      if (IS_MOBILE) {
        setTimeLeft(60);
        setTimerRunning(true);
      } else {
        setUseTTS(true);
        playTTS("Sorry, something went wrong.", () => {
          setTimeLeft(60);
          setTimerRunning(true);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // (웹 전용) 오디오 URL 준비 + 사용자 제스처 직후 자동재생
  useEffect(() => {
    if (IS_MOBILE) return;
    if (ui !== "practice" || !qAudioUrl) return;
    if (!shouldAutoplayRef.current) return;
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => { });
    shouldAutoplayRef.current = false;
  }, [qAudioUrl, ui]);

  /* =============== 녹음 (iOS 호환 MIME 선택) =============== */
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
      console.error("녹음 시작 오류:", err);
      alert("마이크 권한을 확인해 주세요 (설정 > 브라우저 > 마이크 허용).");
    }
  };

  const transcribeAudio = async (audioBlob) => {
    const formData = new FormData();
    formData.append(
      "file",
      audioBlob,
      recMime === "audio/mp4" ? "recording.m4a" : "recording.webm"
    );
    const res = await fetch(`${API_BASE}/stt`, { method: "POST", body: formData });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`/stt ${res.status} ${msg}`);
    }
    const data = await res.json();
    return data.text || "";
  };

  const stopRecording = () => {
    if (!mediaRecorder) return;
    try {
      mediaRecorder.onstop = async () => {
        const type = recMime || "audio/webm";
        const blob = new Blob(mediaRecorder.chunks, { type });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
        try {
          const transcript = await transcribeAudio(blob);
          setMemo((prev) => prev + "\n" + (transcript || ""));
        } catch (e) {
          console.error("STT 오류:", e);
        }
      };
      mediaRecorder.stop();
      setIsRecording(false);
      setIsFinished(true);
    } catch (e) {
      console.error("녹음 종료 오류:", e);
    }
  };

  /* =============== 모범답안 =============== */
  const modelAnswerPrompt = (q) => `
You are an OPIC rater and coach.
Write a model answer in English for the prompt below at IM2–IH level.

Requirements:
- Length: 120–180 words.
- First-person, natural spoken style (use contractions).
- Include 1–2 concrete examples or mini-stories (time/place/who/why).
- Avoid overly advanced vocabulary.

Prompt:
${q}
`.trim();

  const fetchBestAnswerFromGPT = async () => {
    if (!question.trim()) return alert("질문이 먼저 필요해요!");
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: modelAnswerPrompt(question) }),
    });
    const data = await res.json();
    const answer = (data?.answer || "").trim();
    if (answer) {
      setMemo(
        (prev) =>
          prev + `\n\n\n➡️ GPT 모범답안:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${answer}`
      );
    } else {
      alert("모범답안 생성 실패");
    }
  };

  /* =============== 저장/리뷰 =============== */
  const handleSave = () => {
    if (!memo.trim()) return alert("📝 답변을 먼저 입력해주세요!");
    const saved = JSON.parse(localStorage.getItem(LS.history) || "[]");
    const newEntry = {
      question,
      memo: memo.split("➡️ GPT 모범답안:")[0].trim(),
      gptAnswer: memo.includes("➡️ GPT 모범답안:")
        ? memo.split("➡️ GPT 모범답안:")[1].trim()
        : "",
    };
    localStorage.setItem(LS.history, JSON.stringify([...saved, newEntry]));
    alert("저장되었습니다!");
  };

  /* =============== 로딩 오버레이 =============== */
  const LoadingOverlay = () =>
    loading ? (
      <div className="loading-overlay">
        <div className="spinner" aria-label="loading" />
        <div className="loading-text">로딩 중…</div>
      </div>
    ) : null;

  /* ====================== 렌더 ====================== */
  if (!serverReady) {
    return (
      <>
        <div className="start-screen">
          <h1 className="start-title">OPIC</h1>
          <p className="start-subtitle">서버 깨우는 중… (최대 50초)</p>
        </div>
        <LoadingOverlay />
      </>
    );
  }

  if (ui === "start") {
    return (
      <>
        <div className="start-screen">
          <h1 className="start-title">OPIC</h1>
          <p
            className="start-subtitle"
            onClick={() => setUi("survey")}
            style={{ cursor: "pointer" }}
          >
            Let’s start practice
          </p>
        </div>
        <LoadingOverlay />
      </>
    );
  }

  if (ui === "survey") {
    return (
      <>
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
                  onChange={(e) => {
                    setLevel(e.target.value);
                    localStorage.setItem(LS.level, e.target.value);
                  }}
                >
                  {["IM2–IH", "IL–IM1", "IH–AL"].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>거주 형태</label>
                <select
                  value={residence}
                  onChange={(e) => {
                    setResidence(e.target.value);
                    localStorage.setItem(LS.residence, e.target.value);
                  }}
                >
                  <option value="">(선택)</option>
                  {SURVEY.residenceOptions.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>역할</label>
                <select
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    localStorage.setItem(LS.role, e.target.value);
                  }}
                >
                  <option value="">(선택)</option>
                  {SURVEY.roles.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>최근 수강 이력</label>
                <select
                  value={recentCourse}
                  onChange={(e) => {
                    setRecentCourse(e.target.value);
                    localStorage.setItem(LS.recentCourse, e.target.value);
                  }}
                >
                  <option value="">(선택)</option>
                  {SURVEY.recentCourseOptions.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
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
              <button className="btn ghost" onClick={() => setUi("start")}>
                뒤로
              </button>
              <button
                className="btn primary"
                disabled={loading}
                onClick={async () => {
                  shouldAutoplayRef.current = true; // (웹) 자동재생 시도용
                  setUi("practice");
                  await fetchQuestionFromGPT();
                }}
              >
                {loading ? "로딩 중..." : "이 설정으로 시작"}
              </button>
            </div>
          </div>
        </div>
        <LoadingOverlay />
      </>
    );
  }

  if (ui === "practice") {
    return (
      <>
        <div className="App started">
          <h2>오늘의 질문</h2>
          <h3>남은 시간: {timeLeft}초</h3>

          {/* 모바일: 텍스트만 표시 (음성 완전 차단) */}
          {IS_MOBILE ? (
            <p className="question-text" style={{ marginTop: 16 }}>
              {question || "질문 준비 중…"}
            </p>
          ) : qAudioUrl ? (
            // 웹: 서버 MP3
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <audio
                ref={audioRef}
                src={qAudioUrl}
                preload="auto"
                playsInline
                onEnded={() => {
                  setTimeLeft(60);
                  setTimerRunning(true); // 질문 끝나고 시작
                }}
              />
              <img
                src={IMAGE_URL}
                alt="avatar"
                style={{ maxWidth: 320, borderRadius: 12 }}
              />
              <button
                className="btn primary"
                onClick={() => {
                  try {
                    window.speechSynthesis.cancel();
                    if (audioRef.current) {
                      audioRef.current.currentTime = 0;
                      audioRef.current.play().catch(() => { });
                    }
                  } catch { }
                }}
              >
                ▶ 다시 듣기
              </button>
            </div>
          ) : useTTS ? (
            // 웹: 브라우저 TTS 폴백
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <img
                src={IMAGE_URL}
                alt="avatar"
                style={{ maxWidth: 320, borderRadius: 12 }}
              />
              <button
                className="btn primary"
                onClick={() => {
                  window.speechSynthesis.cancel();
                  playTTS(question, () => {
                    setTimeLeft(60);
                    setTimerRunning(true);
                  });
                }}
              >
                ▶ 다시 듣기
              </button>
            </div>
          ) : (
            // 웹: 오디오/폴백 준비 전에는 텍스트를 숨기고 플레이스홀더만
            <p className="question-text">질문 준비 중…</p>
          )}

          {!isRecording ? (
            <button onClick={startRecording}>
              <i className="fas fa-microphone"></i> 녹음 시작
            </button>
          ) : (
            <button onClick={stopRecording}>
              <i className="fas fa-stop-circle"></i> 녹음 정지
            </button>
          )}

          {audioURL && (
            <div style={{ marginTop: 12 }}>
              <audio controls src={audioURL} />
            </div>
          )}

          <button
            onClick={async () => {
              try {
                window.speechSynthesis.cancel();
                if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.currentTime = 0;
                }
              } catch { }
              shouldAutoplayRef.current = true; // (웹) 새 질문 자동재생 시도
              await fetchQuestionFromGPT();
            }}
            disabled={loading}
          >
            <i className="fas fa-shuffle"></i>{" "}
            {loading ? "새 질문 로딩…" : "다른 질문 받기"}
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
              <button onClick={fetchBestAnswerFromGPT}>
                <i className="fas fa-magic"></i> 모범답안 요청하기
              </button>
              <button onClick={handleSave}>
                <i className="fas fa-floppy-disk"></i> 질문 + 메모 저장
              </button>
              <button
                onClick={() => {
                  const history = JSON.parse(
                    localStorage.getItem(LS.history) || "[]"
                  );
                  setSavedHistory(history);
                  setUi("review");
                }}
              >
                <i className="fas fa-folder-open"></i> 저장된 질문/답변 보기
              </button>
            </>
          )}

          <div className="practice-actions">
            <button
              type="button"
              className="btn-reset"
              onClick={() => setUi("survey")}
              title="설문 다시하기"
            >
              <i className="fas fa-arrow-left icon-nudge" aria-hidden="true"></i>
              설문 다시하기
            </button>
          </div>
        </div>
        <LoadingOverlay />
      </>
    );
  }

  if (ui === "review") {
    return (
      <>
        <div className="App started review-mode">
          <h2>
            <i
              className="fas fa-book-journal-whills"
              style={{ color: "#4e47d1", marginRight: 10 }}
            ></i>
            저장된 질문과 답변
          </h2>

          <button
            onClick={async () => {
              shouldAutoplayRef.current = true; // (웹) 자동재생 시도
              setUi("practice");
              await fetchQuestionFromGPT();
              setIsFinished(false);
            }}
          >
            <i className="fas fa-arrow-left"></i> 다른 문제 풀기
          </button>

          {savedHistory.map((item, index) => (
            <div
              key={index}
              className="question-block"
              style={{
                width: "80%",
                minHeight: 120,
                margin: "20px auto",
                padding: 20,
                border: "1px solid #ccc",
                borderRadius: 10,
                backgroundColor: "#f9f9f9",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <p>
                <strong>
                  <i
                    className="fas fa-question-circle"
                    style={{ marginRight: 8, color: "#6c63ff" }}
                  ></i>
                  Q{index + 1}. {item.question}
                </strong>
              </p>

              <button
                onClick={() =>
                  setOpenAnswerIndex(openAnswerIndex === index ? null : index)
                }
              >
                <i
                  className={`fas ${openAnswerIndex === index
                    ? "fa-chevron-up"
                    : "fa-comment-dots"
                    }`}
                ></i>
                &nbsp;
                {openAnswerIndex === index ? "답변 숨기기" : "답변 보기"}
              </button>

              {openAnswerIndex === index && (
                <>
                  <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                    💬 <em>{item.memo}</em>
                  </p>
                  {item.gptAnswer && (
                    <div className="gpt-answer-box">
                      <strong>➡️ GPT 모범답안</strong>
                      <hr />
                      <em>{item.gptAnswer}</em>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {showScrollTop && (
            <button
              onClick={scrollToTop}
              title="맨 위로"
              style={{
                position: "fixed",
                bottom: "30px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "#4e47d1",
                color: "white",
                border: "none",
                borderRadius: "50%",
                width: 50,
                height: 50,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontSize: 22,
                cursor: "pointer",
                boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                zIndex: 1000,
              }}
            >
              <i className="fas fa-arrow-up"></i>
            </button>
          )}
        </div>
        <LoadingOverlay />
      </>
    );
  }

  return null;
}

export default App;
