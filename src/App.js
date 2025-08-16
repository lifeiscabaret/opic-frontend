import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

/* ====================== 환경 ====================== */
const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://opic-backend.onrender.com";

const IMAGE_URL =
  process.env.REACT_APP_AVATAR_IMAGE_URL ||
  `${window.location.origin}/avatar.png`;

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

/* =============== 브라우저 TTS(폴백) =============== */
function playTTS(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS unavailable:", e?.message);
  }
}

/* =============== 서버 TTS 호출(고음질) =============== */
async function fetchQuestionAudio(question) {
  try {
    const cacheKey = "opic:ttsCache:v1";
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "{}");
    if (cache[question]) return cache[question];

    const res = await fetch(`${API_BASE}/tts-eleven`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: question }),
    });
    if (!res.ok) {
      console.error("[/tts-eleven error]", res.status, await res.text());
      return null;
    }
    const { audioUrl } = await res.json();
    if (audioUrl) {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ ...cache, [question]: audioUrl })
      );
    }
    return audioUrl || null;
  } catch (e) {
    console.error("[/tts exception]", e);
    return null;
  }
}

function App() {
  const [ui, setUi] = useState("start"); // start | survey | practice | review
  const [serverReady, setServerReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const [level, setLevel] = useState(localStorage.getItem(LS.level) || "IH–AL");
  const [residence, setResidence] = useState(
    localStorage.getItem(LS.residence) || ""
  );
  const [role, setRole] = useState(localStorage.getItem(LS.role) || "");
  const [recentCourse, setRecentCourse] = useState(
    localStorage.getItem(LS.recentCourse) || ""
  );
  const [selectedTopics, setSelectedTopics] = useState(
    JSON.parse(localStorage.getItem(LS.topics) || "[]")
  );

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

  const [qAudioUrl, setQAudioUrl] = useState("");
  const [useTTS, setUseTTS] = useState(false);
  const qAudioRef = useRef(null);

  /* =============== 서버 깨우기 =============== */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) setServerReady(true);
      } catch {
        setServerReady(false);
      }
    })();
  }, []);

  /* =============== 질문 생성 + 오디오 준비 =============== */
  const fetchQuestionFromGPT = async () => {
    setLoading(true);
    try {
      const prompt = "Give me one OPIC-style interview question in English.";
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const data = await res.json();
      const msg = (data?.answer || "").trim();
      setQuestion(msg);

      const audioUrl = await fetchQuestionAudio(msg);
      if (audioUrl) {
        setQAudioUrl(audioUrl);
        setTimeout(() => {
          qAudioRef.current?.play().catch(() => { });
        }, 0);
      } else {
        setUseTTS(true);
        playTTS(msg);
      }
    } catch (e) {
      console.error("질문 오류:", e);
      setUseTTS(true);
      playTTS("Sorry, something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- render ---------------- */
  if (!serverReady) {
    return <p>서버 깨우는 중...</p>;
  }

  if (ui === "start") {
    return (
      <div className="start-screen">
        <h1>OPIC</h1>
        <p onClick={() => setUi("survey")}>Let’s start practice</p>
      </div>
    );
  }

  if (ui === "survey") {
    return (
      <div>
        <h2>Survey</h2>
        <button
          onClick={async () => {
            await fetchQuestionFromGPT();
            setUi("practice");
          }}
        >
          이 설정으로 시작
        </button>
      </div>
    );
  }

  if (ui === "practice") {
    return (
      <div>
        <h2>오늘의 질문</h2>
        <p>{question}</p>

        {qAudioUrl ? (
          <div>
            <audio ref={qAudioRef} src={qAudioUrl} preload="auto" playsInline />
            <button onClick={() => qAudioRef.current.play()}>다시 듣기</button>
          </div>
        ) : useTTS ? (
          <button onClick={() => playTTS(question)}>다시 듣기</button>
        ) : (
          <p>질문 준비 중…</p>
        )}

        <button onClick={fetchQuestionFromGPT}>다른 질문 받기</button>
      </div>
    );
  }

  return null;
}

export default App;
