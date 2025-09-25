// src/components/Practice.js
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { API_BASE, LS } from "../App";

const FALLBACK_QUESTIONS = [
    "Tell me about a recent weekend activity you really enjoyed and why it was meaningful.",
    "Describe your favorite place at home and how you usually spend time there.",
    "Talk about a hobby you picked up recently and how you got into it.",
];

// 여성 음성 고정
const TTS_VOICE = "shimmer";

/** 현재 설문 선택값 시그니처(필요시 로컬 프리페치 검증에 사용 가능) */
function getProfileSignature() {
    const level = localStorage.getItem(LS.level) || "";
    const role = localStorage.getItem(LS.role) || "";
    const residence = localStorage.getItem(LS.residence) || "";
    const recentCourse = localStorage.getItem(LS.recentCourse) || "";
    const topics = JSON.parse(localStorage.getItem(LS.topics) || "[]");
    return JSON.stringify({ level, role, residence, recentCourse, topics });
}

function Practice({ setUi, setLoading, setLoadingText, setSavedHistory }) {
    // UI state
    const [question, setQuestion] = useState("");
    const [timeLeft, setTimeLeft] = useState(60);
    const [timerRunning, setTimerRunning] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [memo, setMemo] = useState("");

    // Recording state
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [recMime, setRecMime] = useState("audio/webm");
    const [isRecording, setIsRecording] = useState(false);
    const [audioURL, setAudioURL] = useState("");

    // Refs
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const didInitRef = useRef(false); // StrictMode guard
    const ttsReqIdRef = useRef(0); // TTS race guard
    const ttsCacheRef = useRef(new Map()); // TTS cache: text -> objectURL

    // “비디오 먼저 허용” 안내 오버레이 용
    const pendingAudioRef = useRef(null);
    const [needVideoGesture, setNeedVideoGesture] = useState(false);

    // Question bank
    const [questionBank, setQuestionBank] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);

    /** ---------- 오디오/비디오 재생 (아바타 먼저) ---------- */
    const playAudioUrl = useCallback(async (audioUrl) => {
        const a = audioRef.current;
        const v = videoRef.current;
        if (!(a && v)) return;

        // 오디오 종료 시 타이머 시작
        a.onended = () => {
            v.pause();
            setTimeLeft(60);
            setTimerRunning(true);
        };

        // 비디오가 먼저 끝나도 오디오가 남아있으면 비디오 반복
        v.onended = () => {
            if (a && !a.paused && !a.ended) v.play().catch(() => { });
        };

        // 비디오 준비(화면 보장)
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.currentTime = 0;

        try {
            // 1) 비디오부터 재생 시도 (브라우저 자동재생 정책 회피)
            await v.play();
        } catch {
            // 자동재생 제한/코덱 문제 → 사용자 제스처 유도
            pendingAudioRef.current = audioUrl;
            setNeedVideoGesture(true);
            return;
        }

        // 2) 비디오 시작 성공 → 오디오 재생
        a.src = audioUrl;
        try {
            await a.play();
        } catch {
            // 일부 브라우저 정책으로 오디오가 막혀도 UI 흐름은 유지
        }
    }, []);

    /** ---------- 질문 배치 생성 (Survey 토픽 강제) ---------- */
    const fetchQuestionBatchRaw = useCallback(async () => {
        const level = localStorage.getItem(LS.level) || "IH–AL";
        const role = localStorage.getItem(LS.role) || "";
        const residence = localStorage.getItem(LS.residence) || "";
        const recentCourse = localStorage.getItem(LS.recentCourse) || "";
        const selectedTopics = JSON.parse(localStorage.getItem(LS.topics) || "[]");

        // 토픽 리스트가 비어있으면 일반 일상 주제로 제한
        const topicList = selectedTopics.length ? selectedTopics : ["General Everyday Life"];

        const prompt = `
You are an OPIC coach.
Return ONLY a valid JSON array of 20 English questions (strings). No code block, no numbering, no extra text.

Hard constraints:
- Use ONLY these topics; do NOT include any question outside this list:
  ${JSON.stringify(topicList)}
- 14–22 words each, natural spoken English, everyday-life tone.
- No yes/no questions. No multiple sub-questions in one.
- Ban starters: ["Can you tell me", "Could you tell me", "Please describe"].
- Avoid duplicates or template-style rephrasing.

Reference profile (for light personalization, but NEVER to introduce off-topic questions):
- Level: ${level || "Not specified"}
- Role: ${role || "Not specified"}
- Residence: ${residence || "Not specified"}
- Recent Course: ${recentCourse || "Not specified"}
`.trim();

        const res = await fetch(`${API_BASE}/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: prompt }),
        });
        if (!res.ok) throw new Error(`ask failed: ${res.status}`);

        const data = await res.json();
        const raw = data?.answer || "";
        const match = raw.match(/\[.*\]/s);
        let arr = [];
        if (match) {
            try {
                arr = JSON.parse(match[0]);
            } catch {
                arr = [];
            }
        }
        if (!Array.isArray(arr) || !arr.length) arr = FALLBACK_QUESTIONS;
        return arr.filter(Boolean);
    }, []);

    /** ---------- 배치 추가 ---------- */
    const appendNewBatch = useCallback(async () => {
        setBankLoading(true);
        try {
            const arr = await fetchQuestionBatchRaw();
            setQuestionBank((prev) => [...prev, ...arr]);
            return arr;
        } finally {
            setBankLoading(false);
        }
    }, [fetchQuestionBatchRaw]);

    /** ---------- 다음 질문 하나 꺼내기 ---------- */
    const takeOneFromBank = useCallback(async () => {
        // 은행 비어있으면 바로 배치 채우고 첫 소비
        if (questionBank.length === 0 && !bankLoading) {
            const batch = await appendNewBatch();
            if (Array.isArray(batch) && batch.length > 0) {
                const first = batch[0];
                setQuestionBank((prev) => prev.slice(1)); // 첫 개 소비
                return first;
            }
            return "";
        }
        // 기존 은행에서 하나 소비
        return await new Promise((resolve) => {
            setQuestionBank((current) => {
                if (current.length === 0) {
                    resolve("");
                    return [];
                }
                const [q, ...rest] = current;
                if (rest.length < 5 && !bankLoading) appendNewBatch(); // 미리 채우기
                resolve(q);
                return rest;
            });
        });
    }, [appendNewBatch, bankLoading, questionBank.length]);

    /** ---------- 이후 턴: 은행에서 소비 → TTS 병렬 ---------- */
    const runNextTurn = useCallback(async () => {
        setLoadingText("AI가 맞춤형 질문을 생성중입니다...");
        setLoading(true);
        setTimeLeft(60);
        setTimerRunning(false);
        setIsFinished(false);
        setMemo("");
        setAudioURL("");

        try {
            const q = await takeOneFromBank();
            if (!q) {
                toast.error("질문 생성에 실패했습니다. 잠시 후 새로고침 해주세요.");
                setLoading(false);
                return;
            }

            // 텍스트 먼저
            setQuestion(q);

            // TTS race guard & 미디어 리셋
            const id = ++ttsReqIdRef.current;
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.removeAttribute("src");
                audioRef.current.load();
            }
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }

            // 캐시 우선
            const cached = ttsCacheRef.current.get(q);
            if (cached) {
                if (id === ttsReqIdRef.current) await playAudioUrl(cached);
            } else {
                const res = await fetch(`${API_BASE}/tts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: q, voice: TTS_VOICE }),
                });
                if (!res.ok) throw new Error("TTS request failed");
                const audioBlob = await res.blob();
                const audioUrl = URL.createObjectURL(audioBlob);

                // LRU 50
                ttsCacheRef.current.set(q, audioUrl);
                if (ttsCacheRef.current.size > 50) {
                    const firstKey = ttsCacheRef.current.keys().next().value;
                    URL.revokeObjectURL(ttsCacheRef.current.get(firstKey));
                    ttsCacheRef.current.delete(firstKey);
                }

                if (id === ttsReqIdRef.current) await playAudioUrl(audioUrl);
            }

            // 다음 1개 미리 캐싱
            setQuestionBank((bank) => {
                if (!bank.length) return bank;
                const next = bank[0];
                if (next && !ttsCacheRef.current.has(next)) {
                    fetch(`${API_BASE}/tts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: next, voice: TTS_VOICE }),
                    })
                        .then((r) => (r.ok ? r.blob() : Promise.reject()))
                        .then((b) => {
                            const url = URL.createObjectURL(b);
                            ttsCacheRef.current.set(next, url);
                            if (ttsCacheRef.current.size > 50) {
                                const firstKey = ttsCacheRef.current.keys().next().value;
                                URL.revokeObjectURL(ttsCacheRef.current.get(firstKey));
                                ttsCacheRef.current.delete(firstKey);
                            }
                        })
                        .catch(() => { });
                }
                return bank;
            });
        } catch (e) {
            console.error("runNextTurn failed", e);
            toast.error("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    }, [playAudioUrl, setLoading, setLoadingText, takeOneFromBank]);

    /** ---------- 첫 질문: 즉시 Fallback → 병렬 배치 ---------- */
    const runFirstFast = useCallback(async () => {
        setLoadingText("AI가 맞춤형 질문을 생성중입니다...");
        setLoading(true);
        setTimeLeft(60);
        setTimerRunning(false);
        setIsFinished(false);
        setMemo("");
        setAudioURL("");

        try {
            // ① 은행 비어있다면: Fallback 즉시 표출 + TTS
            if (questionBank.length === 0 && !bankLoading) {
                const fb =
                    FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
                setQuestion(fb);

                // TTS race guard & 미디어 리셋
                const id = ++ttsReqIdRef.current;
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.removeAttribute("src");
                    audioRef.current.load();
                }
                if (videoRef.current) {
                    videoRef.current.pause();
                    videoRef.current.currentTime = 0;
                }

                const cached = ttsCacheRef.current.get(fb);
                if (cached) {
                    if (id === ttsReqIdRef.current) await playAudioUrl(cached);
                } else {
                    const r = await fetch(`${API_BASE}/tts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: fb, voice: TTS_VOICE }),
                    });
                    if (r.ok) {
                        const b = await r.blob();
                        const url = URL.createObjectURL(b);
                        ttsCacheRef.current.set(fb, url);
                        if (ttsCacheRef.current.size > 50) {
                            const firstKey = ttsCacheRef.current.keys().next().value;
                            URL.revokeObjectURL(ttsCacheRef.current.get(firstKey));
                            ttsCacheRef.current.delete(firstKey);
                        }
                        if (id === ttsReqIdRef.current) await playAudioUrl(url);
                    }
                }

                // ② 동시에 실제 배치 생성(백그라운드)
                appendNewBatch().catch(() => { });
                return;
            }

            // 은행에 이미 있으면 정상 흐름
            await runNextTurn();
        } catch (e) {
            console.error("runFirstFast failed", e);
            toast.error("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    }, [appendNewBatch, bankLoading, playAudioUrl, questionBank.length, setLoading, setLoadingText, runNextTurn]);

    /** ---------- 초기 진입 ---------- */
    useEffect(() => {
        if (didInitRef.current) return;
        didInitRef.current = true;

        // (옵션) 설문 프리페치가 있다면 시그니처 검증 후 로드
        setQuestionBank([]);
        try {
            const raw = localStorage.getItem("prefetchedBatch");
            if (raw) {
                const obj = JSON.parse(raw);
                const curSig = getProfileSignature();
                if (obj && obj.sig === curSig && Array.isArray(obj.data) && obj.data.length) {
                    setQuestionBank(obj.data);
                }
            }
        } catch { }
        localStorage.removeItem("prefetchedBatch");

        // 첫 질문은 빠르게: Fallback 즉시 + 백그라운드 배치
        runFirstFast();
    }, [runFirstFast]);

    /** ---------- 타이머 ---------- */
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

    /** ---------- 녹음 ---------- */
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
            });
            const preferredMime = MediaRecorder.isTypeSupported("audio/mp4")
                ? "audio/mp4"
                : "audio/webm";
            setRecMime(preferredMime);
            const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
            const chunks = [];
            recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
            recorder.start();
            // @ts-ignore
            recorder.chunks = chunks;
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            console.error("Recording start error:", err);
            toast.error("마이크 권한을 확인해 주세요.");
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (!mediaRecorder) return;
        try {
            mediaRecorder.onstop = async () => {
                setLoadingText("음성을 텍스트로 변환 중입니다...");
                setLoading(true);
                const type = recMime || "audio/webm";
                const audioBlob = new Blob(mediaRecorder.chunks, { type });
                setAudioURL(URL.createObjectURL(audioBlob));

                try {
                    const formData = new FormData();
                    formData.append("audio", audioBlob, `recording.${type.split("/")[1]}`);
                    const res = await fetch(`${API_BASE}/transcribe`, {
                        method: "POST",
                        body: formData,
                    });
                    if (!res.ok) throw new Error("Transcription failed");
                    const data = await res.json();
                    if (data.text) setMemo(data.text);
                } catch (e) {
                    console.error("Transcription error:", e);
                    toast.error("음성을 텍스트로 변환하는 데 실패했습니다.");
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
    }, [mediaRecorder, recMime, setLoading, setLoadingText]);

    /** ---------- 모범답안 ---------- */
    const fetchBestAnswerFromGPT = useCallback(async () => {
        if (!question.trim()) return toast.error("질문이 먼저 필요해요!");
        setLoadingText("모범답안을 생성 중입니다...");
        setLoading(true);
        try {
            const targetBand = localStorage.getItem(LS.level) || "IM2–IH";
            const modelAnswerPrompt = `
You are an OPIC rater and coach.
Write a model answer in English for the prompt at ${targetBand} level.

Constraints:
- 130–170 words. First-person, friendly spoken style (contractions ok).
- Clear structure: (1) brief opening stance, (2) 1–2 concrete examples with small details,
  (3) reflection/reason, (4) short wrap-up).
- Include 2–3 useful collocations or phrasal verbs naturally.
- Avoid bullet points, headings, lecturing tone, or textbook phrases.

Prompt:
${question}
`.trim();

            const res = await fetch(`${API_BASE}/ask`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: modelAnswerPrompt }),
            });
            const data = await res.json();
            const answer = (data?.answer || "").trim();
            if (answer) {
                setMemo((prev) => prev + `\n\n\n➡️ AI 모범답안:\n\n${answer}`);
            } else {
                toast.error("모범답안 생성 실패");
            }
        } finally {
            setLoading(false);
        }
    }, [question, setLoading, setLoadingText]);

    /** ---------- 저장/리뷰 ---------- */
    const handleSave = useCallback(() => {
        if (!memo.trim()) return toast.error("📝 답변을 먼저 입력해주세요!");
        const saved = JSON.parse(localStorage.getItem(LS.history) || "[]");
        const separator = "➡️ AI 모범답안:";
        const newEntry = {
            question,
            memo: memo.split(separator)[0].trim(),
            gptAnswer: memo.includes(separator) ? memo.split(separator)[1].trim() : "",
        };
        localStorage.setItem(LS.history, JSON.stringify([...saved, newEntry]));
        toast.success("저장되었습니다!");
    }, [memo, question]);

    const handleGoToReview = useCallback(() => {
        const history = JSON.parse(localStorage.getItem(LS.history) || "[]");
        if (history.length === 0) return toast.error("저장된 질문이 없습니다.");
        setSavedHistory(history);
        setUi("review");
    }, [setSavedHistory, setUi]);

    /** ---------- UI ---------- */
    return (
        <div className="App started">
            <h2>{question}</h2>
            <h3>남은 시간: {timeLeft}초</h3>

            <div style={{ position: "relative", width: 360, height: 360, marginTop: 16 }}>
                <video
                    ref={videoRef}
                    src="/avatar.mp4" // public/avatar.mp4
                    muted
                    playsInline
                    preload="auto"
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        borderRadius: 16,
                        objectFit: "cover",
                        background: "#000",
                    }}
                />
                <audio ref={audioRef} />

                {needVideoGesture && (
                    <button
                        className="btn primary"
                        style={{
                            position: "absolute",
                            inset: 0,
                            margin: "auto",
                            height: 56,
                            width: 220,
                            backdropFilter: "blur(2px)",
                        }}
                        onClick={async () => {
                            try {
                                await videoRef.current.play(); // 사용자 제스처로 비디오 허용
                                setNeedVideoGesture(false);
                                const url = pendingAudioRef.current;
                                if (url) {
                                    audioRef.current.src = url;
                                    await audioRef.current.play();
                                }
                            } catch {
                                toast.error("아바타 재생을 허용해 주세요(다시 시도).");
                            }
                        }}
                    >
                        ▶ 아바타 재생하기
                    </button>
                )}
            </div>

            <button
                className="btn primary"
                onClick={() => {
                    videoRef.current?.play()?.catch(() => { });
                    audioRef.current?.play()?.catch(() => { });
                }}
                style={{ marginTop: 12 }}
            >
                ▶ 다시 듣기
            </button>

            {!isRecording ? (
                <button onClick={startRecording} disabled={!timerRunning} style={{ marginTop: 16 }}>
                    <i className="fa-solid fa-microphone" aria-hidden="true"></i>{" "}
                    {timerRunning ? "답변 녹음 시작" : "질문 듣고 답변하세요"}
                </button>
            ) : (
                <button onClick={stopRecording} style={{ marginTop: 16 }}>
                    <i className="fa-solid fa-circle-stop" aria-hidden="true"></i> 녹음 정지
                </button>
            )}

            {audioURL && (
                <div style={{ marginTop: 12 }}>
                    <audio controls src={audioURL} />
                </div>
            )}

            <button onClick={runNextTurn} disabled={bankLoading} style={{ marginTop: 16 }}>
                <i className="fa-solid fa-shuffle" aria-hidden="true"></i>{" "}
                {bankLoading ? "새 질문 로딩…" : "다른 질문 받기"}
            </button>

            <div style={{ marginTop: 40, width: "100%", maxWidth: "600px" }}>
                <h3>📝 내 답변 메모하기</h3>
                <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={5}
                    placeholder="여기에 영어로 말한 내용을 적어보세요!"
                />
            </div>

            {isFinished && (
                <>
                    <button onClick={fetchBestAnswerFromGPT}>
                        <i className="fa-solid fa-wand-magic" aria-hidden="true"></i> 모범답안 요청하기
                    </button>
                    <button onClick={handleSave}>
                        <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i> 질문 + 메모 저장
                    </button>
                    <button onClick={handleGoToReview}>
                        <i className="fa-solid fa-folder-open" aria-hidden="true"></i> 저장된 질문/답변 보기
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
                    <i className="fa-solid fa-arrow-left icon-nudge" aria-hidden="true"></i> 설문 다시하기
                </button>
            </div>
        </div>
    );
}

export default Practice;
