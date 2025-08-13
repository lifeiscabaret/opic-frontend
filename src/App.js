// src/App.js
import React, { useEffect, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

// ✅ 백엔드 URL (env 우선, 없으면 Render 주소 사용)
const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://opic-backend.onrender.com";

function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [mode, setMode] = useState("practice"); // 'practice' | 'review'
  const [question, setQuestion] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);

  // ⏫ 스크롤-투-탑 버튼 표시 여부
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ✅ 서버 깨우기(콜드스타트 대비)
  const [serverReady, setServerReady] = useState(false);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function wakeBackend() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Health ${res.status}`);
      return true;
    } catch (_) {
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

  // ✅ OPIC 단일 질문 생성
  const fetchQuestionFromGPT = async () => {
    try {
      setTimeLeft(60);
      setIsFinished(false);
      setMemo("");
      setAudioURL("");

      const prompt = `
You are an OPIC examiner. Generate EXACTLY ONE OPIC-style interview question in English.
- Level: IM2–IH
- Style: everyday life, personal experience, routines, preferences
- No multi-part numbering (no Q1/Q2/Q3). One concise question only.
- 18–30 words if possible.
Example topics: home town, daily routine, weekend activities, transportation, movies, online shopping, travel plans, favorite restaurant, hobbies.
Output: just the single question sentence.
`.trim();

      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });

      const data = await res.json();
      const message = data?.answer?.trim();
      setQuestion(message || "질문을 불러오지 못했습니다.");
    } catch (error) {
      console.error("질문을 불러오는 중 오류 발생:", error);
      setQuestion("질문을 불러오는 중 오류가 발생했습니다.");
    }
  };

  // 타이머
  useEffect(() => {
    if (!isStarted || mode !== "practice") return;
    if (timeLeft === 0) {
      setIsFinished(true);
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isStarted, mode]);

  // ✅ 모범답안 요청
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
          prev +
          `\n\n\n➡️ GPT 모범답안:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${answer}`
      );
    } else {
      alert("모범답안 생성 실패");
    }
  };

  // ⚠️ 브라우저→OpenAI 직접 STT
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
    if (mediaRecorder) {
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
    }
  };

  // 저장
  const handleSave = () => {
    if (!memo.trim()) return alert("📝 답변을 먼저 입력해주세요!");
    const saved = JSON.parse(localStorage.getItem("opicHistory") || "[]");
    const newEntry = {
      question,
      memo: memo.split("➡️GPT 모범답안:")[0].trim(),
      gptAnswer: memo.includes("➡️ GPT 모범답안:")
        ? memo.split("➡️ GPT 모범답안:")[1].trim()
        : "",
    };
    localStorage.setItem("opicHistory", JSON.stringify([...saved, newEntry]));
    alert("저장되었습니다!");
  };

  // 저장 보기
  const toggleSavedView = () => {
    const history = JSON.parse(localStorage.getItem("opicHistory") || "[]");
    setSavedHistory(history);
    setMode("review");
  };

  const returnToPractice = () => {
    setMode("practice");
    fetchQuestionFromGPT();
    setTimeLeft(60);
    setMemo("");
    setAudioURL("");
    setIsFinished(false);
  };

  // ⏫ 스크롤-투-탑: 스크롤 감지
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 콜드스타트 표시
  if (!serverReady) {
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p className="start-subtitle">서버 깨우는 중… (최대 50초)</p>
      </div>
    );
  }

  // 시작 화면
  if (!isStarted) {
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p
          className="start-subtitle"
          onClick={() => {
            setIsStarted(true);
            fetchQuestionFromGPT();
          }}
        >
          Let’s start practice
        </p>
      </div>
    );
  }

  // 연습 화면
  if (mode === "practice") {
    return (
      <div className="App started">
        <h2>오늘의 질문</h2>
        <h3>남은 시간: {timeLeft}초</h3>
        <p className="question-text">{question || "로딩 중..."}</p>

        {!isRecording ? (
          <button onClick={startRecording}>
            <i className="fas fa-microphone"></i> 녹음 시작
          </button>
        ) : (
          <button onClick={stopRecording}>
            <i className="fas fa-stop-circle"></i> 녹음 정지
          </button>
        )}

        <button onClick={fetchQuestionFromGPT}>
          <i className="fas fa-shuffle"></i> 다른 질문 받기
        </button>

        <div style={{ marginTop: "40px" }}>
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
      </div>
    );
  }

  // 저장 리뷰 화면
  if (mode === "review") {
    return (
      <div className={`App started ${mode === "review" ? "review-mode" : ""}`}>
        <h2>
          <i
            className="fas fa-book-journal-whills"
            style={{ color: "#4e47d1", marginRight: "10px" }}
          ></i>{" "}
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
              minHeight: "120px",
              margin: "20px auto",
              padding: "20px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              backgroundColor: "#f9f9f9",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <p>
              <strong>
                <i
                  className="fas fa-question-circle"
                  style={{ marginRight: "8px", color: "#6c63ff" }}
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
                className={`fas ${openAnswerIndex === index ? "fa-chevron-up" : "fa-comment-dots"
                  }`}
              ></i>
              &nbsp;{openAnswerIndex === index ? "답변 숨기기" : "답변 보기"}
            </button>

            {openAnswerIndex === index && (
              <>
                <p style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}>
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

        {/* ⏫ 맨 위로 버튼 */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            title="맨 위로"
            style={{
              position: "fixed",
              bottom: "30px", // 화면 하단에서 30px 위
              left: "50%",    // 화면 가로 중앙
              transform: "translateX(-50%)", // 정확히 중앙 정렬
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
    );
  }

  return null;
}

export default App;
