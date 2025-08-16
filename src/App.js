// src/App.js
import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

/* ====================== 환경 ====================== */
const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://opic-backend.onrender.com";

const IMAGE_URL =
  process.env.REACT_APP_AVATAR_IMAGE_URL || `${window.location.origin}/avatar.png`;


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
    { key: "intro", label: "Self‑introduction (name, city, family, job/school)" },
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

/* =============== 브라우저 TTS(최후 폴백) =============== */
function playTTS(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) => /en-?US/i.test(v.lang) && /female|Jenny|Google US English/i.test(v.name)
      ) || voices.find((v) => /en-?US/i.test(v.lang)) || voices[0];
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS unavailable:", e?.message);
  }
}

/* =============== 서버 TTS 호출(고음질 MP3) =============== */
async function fetchQuestionAudio(question) {
  try {
    const cacheKey = "opic:ttsCache";
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "{}");
    if (cache[question]) return cache[question];

    const res = await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: question, voice: "en-US-JennyNeural" }),
    });
    if (!res.ok) {
      console.error("[/tts error]", res.status, await res.text());
      return null;
    }
    const { audioUrl } = await res.json();
    if (audioUrl) {
      localStorage.setItem(cacheKey, JSON.stringify({ ...cache, [question]: audioUrl }));
    }
    return audioUrl || null;
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
  const [hasStartedAudio, setHasStartedAudio] = useState(false);

  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recMime, setRecMime] = useState("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  /* =============== 질문 오디오/아바타(이미지) =============== */
  const [qAudioUrl, setQAudioUrl] = useState("");
  const [useTTS, setUseTTS] = useState(false);
  const qAudioRef = useRef(null);

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

  /* =============== 설문 핸들러 =============== */
  const changeLevel = (v) => { setLevel(v); localStorage.setItem(LS.level, v); };
  const changeResidence = (v) => { setResidence(v); localStorage.setItem(LS.residence, v); };
  const changeRole = (v) => { setRole(v); localStorage.setItem(LS.role, v); };
  const changeRecentCourse = (v) => { setRecentCourse(v); localStorage.setItem(LS.recentCourse, v); };
  function toggleTopic(key) {
    setSelectedTopics((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem(LS.topics, JSON.stringify(next));
      return next;
    });
  }

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

  /* =============== 질문 생성 + 오디오 준비 =============== */
  const fetchQuestionFromGPT = async () => {
    try {
      // 재생/합성 중단
      window.speechSynthesis.cancel();
      if (qAudioRef.current) {
        qAudioRef.current.pause();
        qAudioRef.current.currentTime = 0;
      }
    } catch { }

    setLoading(true);
    try {
      // 초기화 (타이머는 실제 오디오 재생 onPlay에서 시작)
      setTimeLeft(60);
      setTimerRunning(false);
      setHasStartedAudio(false);
      setIsFinished(false);
      setMemo("");
      setAudioURL("");
      setQAudioUrl("");
      setUseTTS(false);

      // 설문 기반 프롬프트
      const chosenLabels = SURVEY.topics
        .filter((t) => selectedTopics.includes(t.key))
        .map((t) => t.label);
      const topicLine =
        chosenLabels.length > 0
          ? `Topic: choose ONE from this list → ${chosenLabels.join(" | ")}`
          : `Topic: choose ONE at random from everyday topics (home, routine, hobbies, work/school, travel, etc.)`;
      const profileBits = [
        `Level target: ${level}`,
        residence && `Residence: ${residence}`,
        role && `Role: ${role}`,
        recentCourse && `Recent course: ${recentCourse}`,
      ].filter(Boolean).join(" | ");

      const prompt = `
You are an OPIC examiner. Generate EXACTLY ONE OPIC-style interview question in English.
- ${topicLine}
- Level: ${level}
- ${profileBits}
- One concise question only (18–30 words). No Q1/Q2 numbering, no extra explanations.
`.trim();

      // 질문 생성
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const data = await res.json();
      const msg = (data?.answer || "").trim();
      setQuestion(msg || "질문을 불러오지 못했습니다.");

      if (!msg) {
        setUseTTS(true);
        playTTS("Sorry, I couldn't load the question.");
        if (!hasStartedAudio) {
          setHasStartedAudio(true);
          setTimeLeft(60);
          setTimerRunning(true);
        }
        return;
      }

      // 서버 TTS(모바일 품질/일관성) 우선
      const audioUrl = await fetchQuestionAudio(msg);
      if (audioUrl) {
        setQAudioUrl(audioUrl);
        // 사용자 제스처 직후 자동재생 시도 (차단되면 버튼으로 재생)
        setTimeout(() => {
          try { qAudioRef.current?.play().catch(() => { }); } catch { }
        }, 0);
      } else {
        // 실패 → 브라우저 TTS 폴백
        setUseTTS(true);
        playTTS(msg);
        if (!hasStartedAudio) {
          setHasStartedAudio(true);
          setTimeLeft(60);
          setTimerRunning(true);
        }
      }
    } catch (e) {
      console.error("질문 생성 오류:", e);
      setQuestion("질문을 불러오는 중 오류가 발생했습니다.");
      setUseTTS(true);
      playTTS("Sorry, something went wrong.");
      if (!hasStartedAudio) {
        setHasStartedAudio(true);
        setTimeLeft(60);
        setTimerRunning(true);
      }
    } finally {
      setLoading(false);
    }
  };

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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
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
    formData.append("file", audioBlob, recMime === "audio/mp4" ? "recording.m4a" : "recording.webm");
    formData.append("model", "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}` },
      body: formData,
    });
    const data = await res.json();
    return data.text;
  };

  const stopRecording = () => {
    if (!mediaRecorder) return;
    try {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsFinished(true);
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
    } catch (e) {
      console.error("녹음 종료 오류:", e);
    }
  };

  /* =============== 저장 =============== */
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

  /* =============== 저장 보기/복귀 =============== */
  const toggleSavedView = () => {
    const history = JSON.parse(localStorage.getItem(LS.history) || "[]");
    setSavedHistory(history);
    setUi("review");
  };
  const returnToPractice = async () => {
    await fetchQuestionFromGPT();
    setIsFinished(false);
    setUi("practice");
  };

  /* =============== 스크롤탑 =============== */
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  /* =============== 로딩 오버레이 =============== */
  const LoadingOverlay = () =>
    loading ? (
      <div className="loading-overlay">
        <div className="spinner" aria-label="loading" />
        <div className="loading-text">로딩 중…</div>
      </div>
    ) : null;

  /* =============== 화면 렌더 =============== */
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
                <select value={level} onChange={(e) => changeLevel(e.target.value)}>
                  {["IM2–IH", "IL–IM1", "IH–AL"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>거주 형태</label>
                <select value={residence} onChange={(e) => changeResidence(e.target.value)}>
                  <option value="">(선택)</option>
                  {SURVEY.residenceOptions.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>역할</label>
                <select value={role} onChange={(e) => changeRole(e.target.value)}>
                  <option value="">(선택)</option>
                  {SURVEY.roles.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>최근 수강 이력</label>
                <select value={recentCourse} onChange={(e) => changeRecentCourse(e.target.value)}>
                  <option value="">(선택)</option>
                  {SURVEY.recentCourseOptions.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="topics">
              <div className="topics-head">Topics (multi‑select)</div>
              <div className="chip-row">
                {SURVEY.topics.map((t) => {
                  const active = selectedTopics.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => toggleTopic(t.key)}
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
                onClick={async () => {
                  await fetchQuestionFromGPT();
                  setUi("practice");
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

          {/* 텍스트는 숨기고, 오디오는 서버 MP3(우선) 또는 TTS */}
          {qAudioUrl ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <audio
                ref={qAudioRef}
                src={qAudioUrl}
                preload="auto"
                playsInline
                onPlay={() => {
                  if (!hasStartedAudio) {
                    setHasStartedAudio(true);
                    setTimeLeft(60);
                    setTimerRunning(true);
                  }
                }}
              />
              <img src={IMAGE_URL} alt="avatar" style={{ maxWidth: 320, borderRadius: 12 }} />
              <button
                className="btn primary"
                onClick={() => {
                  try {
                    window.speechSynthesis.cancel();
                    if (qAudioRef.current) {
                      qAudioRef.current.currentTime = 0;
                      qAudioRef.current.play().catch(() => { });
                    }
                  } catch { }
                }}
              >
                ▶ 다시 듣기
              </button>
            </div>
          ) : useTTS ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <img src={IMAGE_URL} alt="avatar" style={{ maxWidth: 320, borderRadius: 12 }} />
              <button
                className="btn primary"
                onClick={() => {
                  window.speechSynthesis.cancel();
                  playTTS(question);
                  if (!hasStartedAudio) {
                    setHasStartedAudio(true);
                    setTimeLeft(60);
                    setTimerRunning(true);
                  }
                }}
              >
                ▶ 다시 듣기
              </button>
            </div>
          ) : (
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
                if (qAudioRef.current) {
                  qAudioRef.current.pause();
                  qAudioRef.current.currentTime = 0;
                }
              } catch { }
              await fetchQuestionFromGPT();
            }}
            disabled={loading}
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
              <button
                onClick={async () => {
                  if (!question.trim()) return alert("질문이 먼저 필요해요!");
                  const prompt = `
You are an OPIC examiner. Write a model answer in English to the following question.
- Level: IM2–IH
- Length: about 90–140 words
- Tone: natural, personal, conversational
- Include 1–2 specific details or short examples
Question: ${question}
`.trim();
                  const res = await fetch(`${API_BASE}/ask`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: prompt }),
                  });
                  const data = await res.json();
                  const answer = (data?.answer || "").trim();
                  if (answer) {
                    setMemo((prev) => prev + `\n\n\n➡️ GPT 모범답안:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${answer}`);
                  } else {
                    alert("모범답안 생성 실패");
                  }
                }}
              >
                <i className="fas fa-magic"></i> 모범답안 요청하기
              </button>
              <button onClick={handleSave}>
                <i className="fas fa-floppy-disk"></i> 질문 + 메모 저장
              </button>
              <button onClick={toggleSavedView}>
                <i className="fas fa-folder-open"></i> 저장된 질문/답변 보기
              </button>
            </>
          )}

          <div className="practice-actions">
            <button type="button" className="btn-reset" onClick={() => setUi("survey")} title="설문 다시하기">
              <i className="fas fa-arrow-left icon-nudge" aria-hidden="true"></i>
              설문 다시하기
            </button>
          </div>

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
                width: "50px",
                height: "50px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontSize: "22px",
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

  if (ui === "review") {
    return (
      <>
        <div className="App started review-mode">
          <h2>
            <i className="fas fa-book-journal-whills" style={{ color: "#4e47d1", marginRight: 10 }}></i>
            저장된 질문과 답변
          </h2>

          <button onClick={returnToPractice}>
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
                  <i className="fas fa-question-circle" style={{ marginRight: 8, color: "#6c63ff" }}></i>
                  Q{index + 1}. {item.question}
                </strong>
              </p>

              <button onClick={() => setOpenAnswerIndex(openAnswerIndex === index ? null : index)}>
                <i className={`fas ${openAnswerIndex === index ? "fa-chevron-up" : "fa-comment-dots"}`}></i>
                &nbsp;{openAnswerIndex === index ? "답변 숨기기" : "답변 보기"}
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
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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
