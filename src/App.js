import { useEffect, useRef, useState, useCallback } from "react";
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

// 폴백질문
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
  // 공통 ui
  const [ui, setUi] = useState("start"); // start | survey | practice | review
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
  const [timerRunning, setTimerRunning] = useState(false);

  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recMime, setRecMime] = useState("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [memo, setMemo] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);

  // 속도개선
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const [sessionId, setSessionId] = useState("");        // 스트리밍 세션 재사용
  const [videoReady, setVideoReady] = useState(false);   // 프리뷰 표시 제어
  const guardRef = useRef(null); // 레이스 가드(1.2s 타임아웃)

  // 질문 배치 캐시
  const [questionBank, setQuestionBank] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  // 프리페치(다음 질문/영상)
  const [nextQuestion, setNextQuestion] = useState("");
  const [nextAvatarUrl, setNextAvatarUrl] = useState("");

  /* ── WebRTC: 1회 초기화 후 재사용 ─────── */
  const initStreamingOnce = useCallback(async () => {
    if (pcRef.current && sessionId) return sessionId;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const [stream] = e.streams;
        const v = videoRef.current;
        if (v && stream) {
          v.srcObject = stream;
          v.playsInline = true;
          v.autoplay = true;
          v.muted = false;
          if (guardRef.current) { clearTimeout(guardRef.current); guardRef.current = null; }
          v.play().catch(() => { });
        }
      };

      pc.createDataChannel("d");
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);

      const r = await fetch(`${API_BASE}/api/did/webrtc/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp }),
      });
      const j = await r.json();
      if (!j?.answer || !j?.session_id) throw new Error("no answer/session_id");
      await pc.setRemoteDescription({ type: "answer", sdp: j.answer });
      setSessionId(j.session_id);
      return j.session_id;
    } catch (e) {
      console.error("initStreamingOnce error", e);
      return "";
    }
  }, [sessionId]);

  const sendTalk = async (text) => {
    if (!text?.trim() || !sessionId) return;
    try {
      await fetch(`${API_BASE}/api/did/webrtc/talk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text }),
      });
    } catch (e) {
      console.error("sendTalk error", e);
    }
  };

  /* ── 서버 깨우기 ─────────────────────── */
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
    return () => { mounted = false; };
  }, []);

  //  서버 준비되면 start/survey에서도 스트리밍 세션 미리 붙임
  useEffect(() => {
    if (!serverReady) return;
    if (ui === "start" || ui === "survey") {
      initStreamingOnce(); // 비가청, 권한 불필요
    }
  }, [serverReady, ui, initStreamingOnce]);

  /* ── 타이머 ──────────────────────────── */
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

  /* ── 질문 배치 캐시 ──────────────────── */
  const fetchQuestionBatch = async () => {
    const prompt = `
Generate 20 OPIC-style interview questions in English.
- Each 14–22 words, single sentence.
- Everyday topics (home/routine/hobbies/work/school/travel etc.)
- Return ONLY a JSON array of strings. No commentary.
`.trim();

    try {
      setBankLoading(true);
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const data = await res.json();
      let arr = [];
      try { arr = JSON.parse(data?.answer || "[]"); } catch { arr = []; }

      // 폴백 적용
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

  const getNextQuestionFromBank = async () => {
    await ensureQuestionBank();
    if (questionBank.length === 0) return "";
    const [q, ...rest] = questionBank;
    setQuestionBank(rest);
    if (rest.length < 5 && !bankLoading) fetchQuestionBatch();
    return q;
  };

  /* ── mp4 렌더 → 스왑(세션은 유지) ─────── */
  const swapToMp4WhenReady = async (text) => {
    try {
      const res = await fetch(`${API_BASE}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data?.videoUrl) { // "ok"와 "url" 대신 "videoUrl" 확인
        const v = videoRef.current;
        if (v) {
          v.srcObject = null;
          v.src = data.videoUrl;
          v.onloadeddata = () => setVideoReady(true);
          v.onended = () => { setTimeLeft(60); setTimerRunning(true); };
          /* ★ 레이스 가드 해제: mp4가 승자면 가드 중단 */
          if (guardRef.current) { clearTimeout(guardRef.current); guardRef.current = null; }
          v.play().catch(() => { });
        }
      } else {
        const approx = Math.min(90, Math.max(4, Math.round(text.split(/\s+/).length * 0.33)));
        setTimeout(() => { if (!timerRunning) { setTimeLeft(60); setTimerRunning(true); } }, approx * 1000);
      }
    } catch {
      const approx = Math.min(90, Math.max(4, Math.round(text.split(/\s+/).length * 0.33)));
      setTimeout(() => { if (!timerRunning) { setTimeLeft(60); setTimerRunning(true); } }, approx * 1000);
    }
  };

  // 여러 개 조기 프리페치

  const queuePrefetch = async (count = 3) => {
    for (let i = 0; i < count; i++) {
      // questionBank가 바닥나면 먼저 채움
      if (questionBank.length < 1 && !bankLoading) {
        await ensureQuestionBank();
      }
      await prefetchNext();
    }
  };

  /* ── 프리페치(다음 질문/영상) ───────────── */
  const prefetchNext = async () => {
    try {
      const nq = await getNextQuestionFromBank();
      if (!nq) return;

      const res = await fetch(`${API_BASE}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nq }),
      });
      const data = await res.json();
      if (data?.videoUrl) { // "ok"와 "url" 대신 "videoUrl" 확인
        setNextQuestion(nq);
        setNextAvatarUrl(data.videoUrl);
      } else {
        setNextQuestion(nq);
        setNextAvatarUrl("");
      }
    } catch (e) {
      console.warn("prefetchNext failed", e);
    }
  };

  /* ── 한 번 실행(현재 질문) ─────────────── */
  const runOne = async () => {
    setLoading(true);
    setVideoReady(false);
    setTimeLeft(60);
    setTimerRunning(false);
    setIsFinished(false);
    setMemo("");
    setAudioURL("");
    if (guardRef.current) { clearTimeout(guardRef.current); guardRef.current = null; }

    try {
      // (1) 질문 확보: 프리페치 > 캐시
      let q = nextQuestion;
      let preUrl = nextAvatarUrl;
      if (q) {
        setNextQuestion("");
        setNextAvatarUrl("");
      } else {
        q = await getNextQuestionFromBank();
      }
      if (!q) { await ensureQuestionBank(); q = await getNextQuestionFromBank(); }
      if (!q) { setLoading(false); return; }
      setQuestion(q);

      // (2) 스트리밍 세션 준비(최초 1회) → 즉시 말하기
      const sid = await initStreamingOnce();
      if (sid) {
        sendTalk(q);
        /* ★ 1.2초 레이스 가드
           WHY: 1.2초 내 스트림 미수신 시 mp4로 즉시 스왑(빈 화면 체감 제거) */
        guardRef.current = setTimeout(() => {
          const v = videoRef.current;
          const hasStream = v && v.srcObject instanceof MediaStream;
          if (!hasStream) {
            if (preUrl) {
              v.srcObject = null;
              v.src = preUrl;
              v.onloadeddata = () => setVideoReady(true);
              v.onended = () => { setTimeLeft(60); setTimerRunning(true); };
              v.play().catch(() => { });
            } else {
              swapToMp4WhenReady(q);
            }
          }
        }, 1200);
      }

      // (3) mp4: 프리페치가 있으면 즉시, 없으면 백그라운드 렌더
      const v = videoRef.current;
      if (preUrl && v) {
        v.srcObject = null;
        v.src = preUrl;
        v.onloadeddata = () => setVideoReady(true);
        v.onended = () => { setTimeLeft(60); setTimerRunning(true); };
        if (guardRef.current) { clearTimeout(guardRef.current); guardRef.current = null; }
        v.play().catch(() => { });
      } else if (!sid) {
        // 스트리밍 불가 시 바로 mp4
        swapToMp4WhenReady(q);
      }

      // (4) 다음 것도 프리페치 시작
      queuePrefetch(2);
    } finally {
      setLoading(false);
    }
  };

  /* ── practice 진입 시: 첫 배치 + 첫 실행 ── */
  useEffect(() => {
    if (ui !== "practice") return;
    (async () => {
      await ensureQuestionBank();
      await runOne();
      queuePrefetch(2);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui]);

  // start/survey에서도 조기 프리페치

  useEffect(() => {
    if (!serverReady) return;
    if (ui === "start" || ui === "survey") {
      ensureQuestionBank();
      queuePrefetch(3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverReady, ui]);

  /* ── 녹음 ─────────────────────────────── */
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
    formData.append("file", audioBlob, recMime === "audio/mp4" ? "recording.m4a" : "recording.webm");
    const res = await fetch(`${API_BASE}/stt`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`/stt ${res.status}`);
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
        } catch { }
      };
      mediaRecorder.stop();
      setIsRecording(false);
      setIsFinished(true);
    } catch (e) {
      console.error("녹음 종료 오류:", e);
    }
  };

  /* ── 모범답안 ─────────────────────────── */
  const modelAnswerPrompt = (q) => `
You are an OPIC rater and coach.
Write a model answer in English for the prompt below at IM2–IH level.
- 120–180 words, first-person, natural spoken style, 1–2 concrete examples.
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
        (prev) => prev + `\n\n\n➡️ GPT 모범답안:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${answer}`
      );
    } else {
      alert("모범답안 생성 실패");
    }
  };

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

  /* ── 렌더 ─────────────────────────────── */
  if (!serverReady) {
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p className="start-subtitle">서버 깨우는 중…</p>
      </div>
    );
  }

  if (ui === "start") {
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p className="start-subtitle" onClick={() => setUi("survey")} style={{ cursor: "pointer" }}>
          Let’s start practice
        </p>
      </div>
    );
  }

  if (ui === "survey") {
    return (
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
                {SURVEY.residenceOptions.map((x) => (<option key={x} value={x}>{x}</option>))}
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
              // 화면/문구 그대로, 내부에서만 미리 붙이고 시작

              onClick={async () => { await initStreamingOnce(); setUi("practice"); }}
            >
              {loading ? "로딩 중..." : "이 설정으로 시작"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (ui === "practice") {
    return (
      <div className="App started">
        <h2>오늘의 질문</h2>
        <h3>남은 시간: {timeLeft}초</h3>

        {/* 아바타: 비디오 + 프리뷰(빈 공간 방지) */}
        <div style={{ position: "relative", width: 360, height: 360, marginTop: 16 }}>
          <video
            ref={videoRef}
            playsInline
            autoPlay
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 16, objectFit: "cover" }}
            onLoadedData={() => setVideoReady(true)}
          />
          {!videoReady && (
            <div
              style={{
                position: "absolute", inset: 0, borderRadius: 16,
                background: `center/cover no-repeat url(${process.env.REACT_APP_AVATAR_IMAGE_URL || ""})`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <div style={{
                width: 120, height: 12, borderRadius: 6,
                background: "linear-gradient(90deg, #223 0%, #334 50%, #223 100%)",
                animation: "shimmer 1.2s infinite linear",
              }} />
            </div>
          )}
        </div>

        <button
          className="btn primary"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.srcObject) v.play().catch(() => { });
            else { v.currentTime = 0; v.play().catch(() => { }); }
          }}
          style={{ marginTop: 12 }}
        >
          ▶ 다시 보기
        </button>

        {/* 질문 텍스트는 화면에 표시하지 않음 */}

        {!isRecording ? (
          <button onClick={startRecording} style={{ marginTop: 16 }}>
            <i className="fas fa-microphone"></i> 녹음 시작
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

        <button onClick={runOne} disabled={loading} style={{ marginTop: 16 }}>
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
            <button
              onClick={() => {
                const history = JSON.parse(localStorage.getItem(LS.history) || "[]");
                setSavedHistory(history);
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
    );
  }

  if (ui === "review") {
    return (
      <div className="App started review-mode">
        <h2>
          <i className="fas fa-book-journal-whills" style={{ color: "#4e47d1", marginRight: 10 }}></i>
          저장된 질문과 답변
        </h2>

        <button onClick={async () => { setUi("practice"); await runOne(); setIsFinished(false); }}>
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
                Q{index + 1}.
              </strong>
            </p>

            <button
              onClick={() => setOpenAnswerIndex(openAnswerIndex === index ? null : index)}
            >
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
      </div>
    );
  }

  return null;
}

export default App;