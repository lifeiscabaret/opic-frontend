// src/App.js
import { useEffect, useState } from "react";
import "./App.css";
import { Toaster } from "react-hot-toast";

import Survey from "./components/Survey";
import Practice from "./components/Practice";
import Review from "./components/Review";
import LoadingOverlay from "./components/LoadingOverlay";
import ScrollButtons from "./components/ScrollButtons";

/* ====================== 환경 ====================== */
// 로컬 개발: http://localhost:8080
export const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

const HEALTH_URL =
  (API_BASE.endsWith("/api") ? API_BASE.slice(0, -4) : API_BASE) + "/health";

/* =================== 로컬스토리지 키 =================== */
export const LS = {
  level: "opic:level",
  role: "opic:role",
  residence: "opic:residence",
  recentCourse: "opic:recentCourse",
  topics: "opic:selectedTopics",
  history: "opicHistory",
};

/* ====================== 설문 옵션 ====================== */
export const SURVEY = {
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

function App() {
  const [ui, setUi] = useState("start"); // start | survey | practice | review
  const [serverReady, setServerReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState(
    "AI가 맞춤형 질문을 생성중입니다..."
  );

  // Review 화면으로 전달할 상태
  const [savedHistory, setSavedHistory] = useState([]);

  /* ── 백엔드 깨우기 ─────────────────────── */
  const wakeBackend = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(HEALTH_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`Health ${res.status}`);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

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

  /* ── 화면 스위치 ─────────────────────── */
  const renderContent = () => {
    switch (ui) {
      case "survey":
        return <Survey setUi={setUi} />;
      case "practice":
        return (
          <Practice
            setUi={setUi}
            setLoading={setLoading}
            setLoadingText={setLoadingText}
            setSavedHistory={setSavedHistory}
          />
        );
      case "review":
        return (
          <Review
            setUi={setUi}
            savedHistory={savedHistory}
            setSavedHistory={setSavedHistory}
          />
        );
      case "start":
      default:
        return (
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
        );
    }
  };

  return (
    <>
      {/* 토스트 알림 */}
      <Toaster position="top-center" reverseOrder={false} />

      {/* 스크롤 업/다운 버튼 */}
      <ScrollButtons ui={ui} savedHistory={savedHistory} />

      {/* 로딩 오버레이 */}
      {loading && <LoadingOverlay loadingText={loadingText} />}

      {/* 서버 깨우는 동안 스타트 화면만 표시 */}
      {!serverReady && (
        <div className="start-screen">
          <h1 className="start-title">OPIC</h1>
          <p className="start-subtitle">서버 깨우는 중…</p>
        </div>
      )}

      {/* 서버 준비되면 실제 화면 렌더 */}
      {serverReady && renderContent()}
    </>
  );
}

export default App;
