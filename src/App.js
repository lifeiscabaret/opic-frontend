// src/App.js
import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

// ✅ 백엔드 URL (env 우선, 없으면 Render 주소 사용)
const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://opic-backend.onrender.com";

// ✅ 아바타 이미지 경로 (env > /public/avatar.png)
const IMAGE_URL =
  process.env.REACT_APP_AVATAR_IMAGE_URL || `${window.location.origin}/avatar.png`;

// 로컬스토리지 키
const LS = {
  level: "opic:level",
  role: "opic:role",
  residence: "opic:residence",
  recentCourse: "opic:recentCourse",
  topics: "opic:selectedTopics",
  history: "opicHistory",
};

// 설문 옵션
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

// 🗣️ D‑ID: 텍스트를 립싱크 영상 URL로 변환
async function speakText(text) {
  try {
    const res = await fetch(`${API_BASE}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        imageUrl: IMAGE_URL,
        voice: "en-US-JennyNeural",
      }),
    });

    if (!res.ok) {
      const ct = res.headers.get("content-type") || "";
      const body = await res.text();
      console.error("[/speak error]", res.status, ct, body.slice(0, 500));
      return null;
    }

    const data = await res.json();
    return data?.videoUrl || null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function App() {
  // UI 상태: start | survey | practice | review
  const [ui, setUi] = useState("start");

  // 공통 상태
  const [serverReady, setServerReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // 설문 상태
  const [level, setLevel] = useState(localStorage.getItem(LS.level) || "IH–AL");
  const [residence, setResidence] = useState(localStorage.getItem(LS.residence) || "");
  const [role, setRole] = useState(localStorage.getItem(LS.role) || "");
  const [recentCourse, setRecentCourse] = useState(localStorage.getItem(LS.recentCourse) || "");
  const [selectedTopics, setSelectedTopics] = useState(
    JSON.parse(localStorage.getItem(LS.topics) || "[]")
  );

  // 연습 상태
  const [question, setQuestion] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // 아바타 영상
  const [avatarUrl, setAvatarUrl] = useState("");
  const avatarRef = useRef(null);

  // 서버 깨우기
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

  // 설문 핸들러
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

  // ⏯️ 아바타 재생 유틸
  const playAvatar = () => {
    const v = avatarRef.current;
    if (!v) return;
    try {
      v.muted = false;      // 사용자 제스처(버튼 클릭 이후)라면 해제 가능
      v.currentTime = 0;
      v.play().catch((e) => {
        // 브라우저 정책으로 막히면 버튼으로 듣게 두자
        console.warn("Autoplay prevented, use replay button.", e?.message);
      });
    } catch (e) {
      console.warn("Video play error:", e?.message);
    }
  };

  // 질문 생성 + 아바타 자동재생
  const fetchQuestionFromGPT = async () => {
    setLoading(true);
    try {
      setTimeLeft(60);
      setIsFinished(false);
      setMemo("");
      setAudioURL("");
      setAvatarUrl("");

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
      ]
        .filter(Boolean)
        .join(" | ");

      const prompt = `
You are an OPIC examiner. Generate EXACTLY ONE OPIC-style interview question in English.
- ${topicLine}
- Level: ${level}
- ${profileBits}
- One concise question only (18–30 words). No Q1/Q2 numbering, no extra explanations.
`.trim();

      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      const data = await res.json();
      const message = (data?.answer || "").trim();
      setQuestion(message || "질문을 불러오지 못했습니다.");

      if (message) {
        const url = await speakText(message);
        if (url) {
          setAvatarUrl(url); // useEffect에서 자동 재생
        }
      }
    } catch (error) {
      console.error("질문 생성 오류:", error);
      setQuestion("질문을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 아바타 URL이 생기면 자동 재생 (practice 화면일 때만)
  useEffect(() => {
    if (ui !== "practice" || !avatarUrl) return;
    const v = avatarRef.current;
    if (!v) return;
    const handler = () => playAvatar();
    v.addEventListener("loadeddata", handler, { once: true });
    return () => v && v.removeEventListener("loadeddata", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl, ui]);

  // 타이머
  useEffect(() => {
    if (ui !== "practice") return;
    if (timeLeft === 0) {
      setIsFinished(true);
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, ui]);

  // 모범답안
  const fetchBestAnswerFromGPT = async () => {
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
      setMemo(
        (prev) =>
          prev + `\n\n\n➡️ GPT 모범답안:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${answer}`
      );
    } else {
      alert("모범답안 생성 실패");
    }
  };

  // 브라우저→OpenAI 직접 STT
  const transcribeAudio = async (audioBlob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    formData.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}` },
      body: formData,
    });

    const data = await res.json();
    return data.text;
  };

  // 녹음
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.chunks = chunks;
    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
  };
  const stopRecording = () => {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    setIsRecording(false);
    setIsFinished(true);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(mediaRecorder.chunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioURL(url);
      const transcript = await transcribeAudio(blob);
      setMemo((prev) => prev + "\n" + transcript);
    };
  };

  // 저장
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

  // 저장 보기/돌아가기
  const toggleSavedView = () => {
    const history = JSON.parse(localStorage.getItem(LS.history) || "[]");
    setSavedHistory(history);
    setUi("review");
  };
  const returnToPractice = async () => {
    await fetchQuestionFromGPT();
    setTimeLeft(60);
    setMemo("");
    setAudioURL("");
    setIsFinished(false);
    setUi("practice");
  };

  // 스크롤탑
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // 공용 로딩 오버레이
  const LoadingOverlay = () =>
    loading ? (
      <div className="loading-overlay">
        <div className="spinner" aria-label="loading" />
        <div className="loading-text">로딩 중…</div>
      </div>
    ) : null;

  // ===== 화면들 =====

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
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>거주 형태</label>
                <select value={residence} onChange={(e) => changeResidence(e.target.value)}>
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
                <select value={role} onChange={(e) => changeRole(e.target.value)}>
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
                  onChange={(e) => changeRecentCourse(e.target.value)}
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
              <button className="btn ghost" onClick={() => setUi("start")}>
                뒤로
              </button>
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

          {/* 🔊 실제 시험처럼: 텍스트는 숨기고(렌더 X), 아바타가 질문 영역에서 자동 재생 */}
          {avatarUrl ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <video
                ref={avatarRef}
                src={avatarUrl}
                autoPlay
                playsInline
                className="avatar-video"
                style={{ maxWidth: 420, borderRadius: 12 }}
              />
              <button className="btn primary" onClick={playAvatar}>
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

          {/* 내 녹음 미리듣기 */}
          {audioURL && (
            <div style={{ marginTop: 12 }}>
              <audio controls src={audioURL} />
            </div>
          )}

          <button onClick={fetchQuestionFromGPT} disabled={loading}>
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
              <button onClick={fetchBestAnswerFromGPT}>
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

          {/* 설문 다시하기 */}
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
