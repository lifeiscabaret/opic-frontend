// src/App.js
import { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

/* ====================== 환경 ====================== */
const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://opic-backend.onrender.com";

/* ====================== 유틸 ====================== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ====================== App ====================== */
function App() {
  // 화면 모드
  const [isStarted, setIsStarted] = useState(false);
  const [mode, setMode] = useState("practice"); // practice | review

  // 서버 웜업
  const [serverReady, setServerReady] = useState(false);

  // 질문/타이머
  const [question, setQuestion] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  // 녹음/STT
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recMime, setRecMime] = useState("audio/webm");
  const [audioURL, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);

  // 질문 오디오
  const [qAudioUrl, setQAudioUrl] = useState("");
  const audioRef = useRef(null);
  const shouldAutoplayRef = useRef(false);

  /* =================== 서버 깨우기 =================== */
  async function wakeBackend() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      if (!r.ok) throw new Error("health fail");
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

  /* ============= OPIC 질문 프롬프트 ============= */
  const QUESTION_PROMPT = `
You are an OPIC (Oral Proficiency Interview–Computer) examiner.
Create an English question set that mirrors the real OPIC exam.

Requirements:
- Level: IM2–IH.
- Topic: choose ONE at random from
  [Travel, Daily Routine, Hobbies, Work, School, Home, Shopping, Movies, Health,
   Neighborhood, Transportation, Friends, Weather, Restaurants, Exercise].
- Format (exactly this layout):
  Scenario: <one short sentence that sets a specific situation>
  Q1: <first question – present/past experience & details>
  Q2: <follow-up – reasons, feelings, or difficulties; ask for 1–2 specifics>
  Q3: <follow-up – compare, future plan, or hypothetical>

Guidelines:
- All in English.
- Each question: one sentence (15–25 words).
- Return ONLY the four lines that start with Scenario/Q1/Q2/Q3.
  `.trim();

  /* ============= 질문 생성 + 서버 TTS(MP3) ============= */
  async function fetchQuestionFromGPT() {
    try {
      // 초기화
      setTimeLeft(60);
      setTimerRunning(false);
      setIsFinished(false);
      setMemo("");
      setAudioURL("");
      setQAudioUrl("");

      // 질문 생성
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: QUESTION_PROMPT }),
      });
      const data = await res.json();
      const msg = (data?.answer || "").trim();
      setQuestion(msg || "질문을 불러오지 못했습니다.");

      if (!msg) return;

      // 여성 톤 verse로 서버 TTS
      const tts = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg, voice: "verse" }),
      });
      if (!tts.ok) {
        console.error("/tts failed:", await tts.text());
        return;
      }
      const { audioUrl } = await tts.json();
      setQAudioUrl(audioUrl || "");
    } catch (e) {
      console.error("fetchQuestionFromGPT error:", e);
      setQuestion("질문을 불러오는 중 오류가 발생했습니다.");
    }
  }

  // 오디오 URL 준비되면 자동재생(사용자 제스처 직후)
  useEffect(() => {
    if (!qAudioUrl || !shouldAutoplayRef.current) return;
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => { });
    shouldAutoplayRef.current = false;
  }, [qAudioUrl]);

  // 타이머 (오디오 끝난 뒤 시작)
  useEffect(() => {
    if (!timerRunning) return;
    if (timeLeft <= 0) {
      setIsFinished(true);
      setTimerRunning(false);
      return;
    }
    const id = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timeLeft]);

  /* ============= 모범답안 프롬프트 & 호출 ============= */
  const modelAnswerPrompt = (q) => `
You are an OPIC rater and coach.
Write a model answer in English for the prompt below at IM2–IH level.

Requirements:
- Length: 120–180 words.
- First-person, natural spoken style (use contractions like I'm, can't).
- Structure: brief opener → specific details/examples (time, place, who, what, why) → short wrap-up.
- Include 1–2 concrete examples or mini-stories, not generic statements.
- Avoid overly advanced vocabulary or C2 expressions; keep it clean and natural.

Prompt:
${q}
`.trim();

  async function fetchBestAnswerFromGPT() {
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
      alert("❗ 모범답안 생성 실패");
    }
  }

  /* ================== STT: 백엔드 프록시 ================== */
  async function transcribeAudio(blob) {
    const form = new FormData();
    form.append("file", blob, recMime === "audio/mp4" ? "recording.m4a" : "recording.webm");
    const r = await fetch(`${API_BASE}/stt`, { method: "POST", body: form });
    if (!r.ok) throw new Error(`/stt ${r.status} ${await r.text()}`);
    const j = await r.json();
    return j.text || "";
  }

  /* ================== 녹음 시작/정지 ================== */
  async function startRecording() {
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
      // @ts-ignore
      recorder.chunks = chunks;
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (e) {
      console.error("startRecording error:", e);
      alert("마이크 권한을 확인해 주세요 (설정 > 브라우저 > 마이크 허용).");
    }
  }

  function stopRecording() {
    if (!mediaRecorder) return;
    try {
      mediaRecorder.onstop = async () => {
        const type = recMime || "audio/webm";
        // @ts-ignore
        const blob = new Blob(mediaRecorder.chunks, { type });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
        try {
          const text = await transcribeAudio(blob);
          setMemo((prev) => prev + "\n" + (text || ""));
        } catch (e) {
          console.error("STT error:", e);
        }
      };
      mediaRecorder.stop();
      setIsRecording(false);
      setIsFinished(true);
    } catch (e) {
      console.error("stopRecording error:", e);
    }
  }

  /* ================== 저장/리뷰 ================== */
  function handleSave() {
    if (!memo.trim()) return alert("📝 답변을 먼저 입력해주세요!");
    const saved = JSON.parse(localStorage.getItem("opicHistory") || "[]");
    const newEntry = {
      question,
      memo: memo.split("➡️ GPT 모범답안:")[0].trim(),
      gptAnswer: memo.includes("➡️ GPT 모범답안:")
        ? memo.split("➡️ GPT 모범답안:")[1].trim()
        : "",
    };
    localStorage.setItem("opicHistory", JSON.stringify([...saved, newEntry]));
    alert("저장되었습니다!");
  }

  function toggleSavedView() {
    const history = JSON.parse(localStorage.getItem("opicHistory") || "[]");
    setSavedHistory(history);
    setMode("review");
  }

  function returnToPractice() {
    setMode("practice");
    shouldAutoplayRef.current = true;
    fetchQuestionFromGPT();
    setTimeLeft(60);
    setMemo("");
    setAudioURL("");
    setIsFinished(false);
  }

  /* ================== 렌더 ================== */
  if (!serverReady) {
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p className="start-subtitle">서버 깨우는 중… (최대 50초)</p>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p
          className="start-subtitle"
          onClick={() => {
            setIsStarted(true);
            shouldAutoplayRef.current = true; // 첫 질문 자동재생 허용
            fetchQuestionFromGPT();
          }}
          style={{ cursor: "pointer" }}
        >
          Let’s start practice
        </p>
      </div>
    );
  }

  if (mode === "practice") {
    return (
      <div className="App started">
        <h2>오늘의 질문</h2>
        <h3>남은 시간: {timeLeft}초</h3>

        {/* 질문 텍스트 */}
        <p className="question-text">{question || "로딩 중..."}</p>

        {/* 질문 오디오: 끝났을 때 타이머 시작 */}
        {qAudioUrl && (
          <audio
            ref={audioRef}
            src={qAudioUrl}
            preload="auto"
            playsInline
            onEnded={() => {
              setTimeLeft(60);
              setTimerRunning(true);
            }}
            style={{ display: "block", margin: "12px 0" }}
            controls
          />
        )}

        {/* 녹음 */}
        {!isRecording ? (
          <button onClick={startRecording}>
            <i className="fas fa-microphone"></i> 녹음 시작
          </button>
        ) : (
          <button onClick={stopRecording}>
            <i className="fas fa-stop-circle"></i> 녹음 정지
          </button>
        )}

        {/* 다른 질문 */}
        <button
          onClick={() => {
            shouldAutoplayRef.current = true; // 버튼 제스처로 자동재생 허용
            fetchQuestionFromGPT();
            setTimerRunning(false); // 새 질문 준비 중 타이머 일시정지
          }}
        >
          <i className="fas fa-shuffle"></i> 다른 질문 받기
        </button>

        {/* 메모 */}
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

        {/* 모범답안/저장/리뷰 */}
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
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className="App started review-mode">
        <h2>
          <i
            className="fas fa-book-journal-whills"
            style={{ color: "#4e47d1", marginRight: 10 }}
          />{" "}
          저장된 질문과 답변
        </h2>

        <button onClick={returnToPractice}>
          <i className="fas fa-arrow-left" /> 다른 문제 풀기
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
                />
                Q{index + 1}. {item.question}
              </strong>
            </p>

            <button
              onClick={() =>
                setOpenAnswerIndex(openAnswerIndex === index ? null : index)
              }
            >
              <i
                className={`fas ${openAnswerIndex === index ? "fa-chevron-up" : "fa-comment-dots"
                  }`}
              />
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
      </div>
    );
  }

  return null;
}

export default App;