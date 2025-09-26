import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { API_BASE, LS, SURVEY } from "../App";

const FALLBACK_QUESTIONS = [
    "Tell me about a recent weekend activity you really enjoyed and why it was meaningful.",
    "Describe your favorite place at home and how you usually spend time there.",
    "Talk about a hobby you picked up recently and how you got into it.",
];

const TTS_VOICE = "shimmer";
const getRandomFallback = () =>
    FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];

function Practice({ setUi, setLoading, setLoadingText, setSavedHistory }) {
    const [question, setQuestion] = useState("Loading your first question...");
    const [timeLeft, setTimeLeft] = useState(60);
    const [timerRunning, setTimerRunning] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [memo, setMemo] = useState("");
    const [needVideoGesture, setNeedVideoGesture] = useState(false);

    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [recMime, setRecMime] = useState("audio/webm");
    const [isRecording, setIsRecording] = useState(false);
    const [audioURL, setAudioURL] = useState("");

    const [questionBank, setQuestionBank] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);

    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const pendingAudioUrlRef = useRef(null);
    const isInitialLoad = useRef(true);

    /* ------------------------------ AV 동시 재생 (싱크 보정) ------------------------------ */
    const playAudioAndVideo = useCallback(async (audioUrl) => {
        const audio = audioRef.current;
        const video = videoRef.current;
        if (!audio || !video) return;

        setNeedVideoGesture(false);

        // 오디오 준비
        audio.src = audioUrl;
        audio.preload = "auto";
        audio.load();

        // 비디오 메타데이터 준비 후 0초로 맞추기
        const ensureVideoReady = () =>
            new Promise((resolve) => {
                if (video.readyState >= 1) {
                    video.currentTime = 0;
                    resolve();
                } else {
                    video.addEventListener(
                        "loadedmetadata",
                        () => {
                            video.currentTime = 0;
                            resolve();
                        },
                        { once: true }
                    );
                }
            });

        const startSynced = async () => {
            try {
                await ensureVideoReady();

                // 오디오가 실제로 "playing" 되는 순간에 비디오 플레이 → 싱크 딜레이 제거
                const onAudioPlaying = async () => {
                    audio.removeEventListener("playing", onAudioPlaying);
                    try {
                        await video.play();
                    } catch (e) {
                        console.warn("Video play blocked:", e);
                        setNeedVideoGesture(true);
                    }
                };
                audio.addEventListener("playing", onAudioPlaying);

                await audio.play(); // 자동재생이 막히면 catch
            } catch (err) {
                console.warn("Autoplay was prevented:", err);
                pendingAudioUrlRef.current = audioUrl;
                setNeedVideoGesture(true);
                // 시각 피드백용으로 무음 비디오 시도
                video.play().catch(() => { });
            }
        };

        await startSynced();

        // 오디오 끝나면 타이머 시작
        audio.onended = () => {
            video.pause();
            setTimeLeft(60);
            setTimerRunning(true);
        };
    }, []);

    /* -------------------------- 질문 배치 프리페치 --------------------------- */
    const fetchQuestionBatch = useCallback(async () => {
        setBankLoading(true);
        try {
            const level = localStorage.getItem(LS.level) || "IH–AL";
            const role = localStorage.getItem(LS.role) || "";
            const residence = localStorage.getItem(LS.residence) || "";
            const recentCourse = localStorage.getItem(LS.recentCourse) || "";
            const selectedTopics = JSON.parse(localStorage.getItem(LS.topics) || "[]");

            const topicLabels =
                (SURVEY.topics || [])
                    .filter((t) => selectedTopics.includes(t.key))
                    .map((t) => t.label) || [];

            const prompt = `
You are an expert OPIC coach. Generate 20 personalized, OPIC-style interview questions in English based on the user's profile.
- Return ONLY a valid JSON array of strings. No extra text or commentary.
- Each question: 14-22 words, single sentence, natural spoken style.
- Base questions on these topics: ${topicLabels.length > 0 ? topicLabels.join(", ") : "General everyday topics"}.
- Reference Profile: Level: ${level}, Role: ${role}, Residence: ${residence}, Course: ${recentCourse}.
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
            let arr = match ? JSON.parse(match[0]) : [];
            if (!Array.isArray(arr) || !arr.length) arr = FALLBACK_QUESTIONS;
            setQuestionBank((prev) => [...prev, ...arr.filter(Boolean)]);
        } catch (e) {
            console.error("fetchQuestionBatch failed:", e);
        } finally {
            setBankLoading(false);
        }
    }, []);

    /* ------------------------------ 라운드 시작 ------------------------------ */
    const runOne = useCallback(
        async (isInitial = false) => {
            setLoadingText("AI가 맞춤형 질문을 생성중입니다...");
            if (!isInitial) setLoading(true);

            setTimeLeft(60);
            setTimerRunning(false);
            setIsFinished(false);
            setMemo("");
            setAudioURL("");
            setNeedVideoGesture(false);

            try {
                let nextQuestion;
                if (isInitial) {
                    nextQuestion = getRandomFallback();
                    fetchQuestionBatch();
                } else {
                    if (questionBank.length > 0) {
                        nextQuestion = questionBank[0];
                        setQuestionBank((prev) => prev.slice(1));
                        if (questionBank.length < 5 && !bankLoading) {
                            fetchQuestionBatch();
                        }
                    } else {
                        nextQuestion = getRandomFallback();
                        if (!bankLoading) fetchQuestionBatch();
                    }
                }

                setQuestion(nextQuestion);

                const res = await fetch(`${API_BASE}/tts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: nextQuestion, voice: TTS_VOICE }),
                });
                if (!res.ok) throw new Error("TTS request failed");

                // 서버가 octet-stream 으로 줄 때 타입 보정
                let audioBlob = await res.blob();
                if (!audioBlob.type || audioBlob.type === "application/octet-stream") {
                    const ab = await audioBlob.arrayBuffer();
                    audioBlob = new Blob([ab], { type: "audio/mpeg" });
                }

                const audioUrl = URL.createObjectURL(audioBlob);
                await playAudioAndVideo(audioUrl);
            } catch (e) {
                console.error("runOne failed", e);
                toast.error("질문을 생성하는 데 실패했습니다. Fallback 질문으로 시작합니다.");
                setQuestion(getRandomFallback());
            } finally {
                if (!isInitial) setLoading(false);
            }
        },
        [bankLoading, fetchQuestionBatch, playAudioAndVideo, questionBank, setLoading, setLoadingText]
    );

    /* ------------------------------ 초기 1회 실행 ------------------------------ */
    useEffect(() => {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            runOne(true);
        }
    }, [runOne]);

    /* -------------------------------- 타이머 -------------------------------- */
    useEffect(() => {
        if (!timerRunning) return undefined;
        if (timeLeft <= 0) {
            setIsFinished(true);
            setTimerRunning(false);
            return undefined;
        }
        const id = setInterval(() => setTimeLeft((s) => s - 1), 1000);
        return () => clearInterval(id);
    }, [timerRunning, timeLeft]);

    /* ------------------------------ 녹음 컨트롤 ------------------------------ */
    // 아이폰/Continuity 마이크 자동 선택 방지 + 최소 녹음 길이 보장
    const startRecording = useCallback(async () => {
        try {
            // 가능한 입력 장치 조사
            let deviceId = localStorage.getItem("OPIC_INPUT_DEVICE_ID") || "";

            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const inputs = devices.filter((d) => d.kind === "audioinput");
                // 경고 없이 동작하도록 불필요한 escape 제거 (hands-free)
                const pick = (list) =>
                    list.find((d) => !/iphone|continuity|hands-free|airpods/i.test(d.label)) || list[0];
                if (!deviceId && inputs.length) {
                    const chosen = pick(inputs);
                    if (chosen && chosen.deviceId) {
                        deviceId = chosen.deviceId;
                        localStorage.setItem("OPIC_INPUT_DEVICE_ID", deviceId);
                    }
                }
            } catch {
                // 권한 전 단계 혹은 일부 브라우저에서 enumerate 실패 가능 → 무시
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 48000,
                },
            });

            const preferredMimeOptions = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/mp4",
            ];
            const preferredMime =
                preferredMimeOptions.find((mt) => MediaRecorder.isTypeSupported(mt)) ||
                "audio/webm";

            setRecMime(preferredMime);
            const recorder = new MediaRecorder(stream, { mimeType: preferredMime });

            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size) chunks.push(e.data);
            };

            recorder.start();

            // 첫 덩어리 0byte 방지: 최소 300ms 보장
            await new Promise((r) => setTimeout(r, 300));

            // 임시 저장
            // eslint-disable-next-line no-underscore-dangle
            recorder.chunks = chunks;
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            console.error("Recording start error:", err);
            toast.error("마이크 권한/입력장치를 확인해 주세요.");
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (!mediaRecorder) return;
        mediaRecorder.onstop = async () => {
            setLoadingText("음성을 텍스트로 변환 중입니다...");
            setLoading(true);

            const type = recMime || "audio/webm";
            const parts = mediaRecorder.chunks || [];
            if (!parts.length) {
                setLoading(false);
                toast.error("녹음이 너무 짧아서 인식하지 못했어요. 한 문장 이상 말해줘!");
                return;
            }
            const audioBlob = new Blob(parts, { type });
            if (audioBlob.size < 1024) {
                setLoading(false);
                toast.error("녹음 길이가 너무 짧아요. 다시 시도해줘!");
                return;
            }

            setAudioURL(URL.createObjectURL(audioBlob));
            try {
                const formData = new FormData();
                formData.append("audio", audioBlob, `recording.${(type.split("/")[1] || "webm")}`);

                const res = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: formData });
                if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
                const data = await res.json();
                if (data.text) setMemo(data.text);
                else toast.error("음성 인식 결과가 비어 있어요.");
            } catch (e) {
                console.error("Transcription error:", e);
                toast.error("음성 인식에 실패했어요. 네트워크/서버 상태를 확인해줘!");
            } finally {
                setLoading(false);
            }
        };
        mediaRecorder.stop();
        setIsRecording(false);
        setIsFinished(true);
    }, [mediaRecorder, recMime, setLoading, setLoadingText]);

    /* --------------------------- 모범답안 생성 --------------------------- */
    const fetchBestAnswerFromGPT = useCallback(async () => {
        if (!question.trim()) {
            toast.error("질문이 먼저 필요해요!");
            return;
        }
        setLoadingText("모범답안을 생성 중입니다...");
        setLoading(true);
        try {
            const targetBand = localStorage.getItem(LS.level) || "IM2–IH";
            const modelAnswerPrompt = `
You are an OPIC rater and coach. Write a model answer in English for the prompt at ${targetBand} level.
Constraints: 130–170 words, first-person, friendly spoken style, clear structure with examples.
Prompt: ${question}
      `.trim();

            const res = await fetch(`${API_BASE}/ask`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: modelAnswerPrompt }),
            });
            const data = await res.json();
            const answer = (data?.answer || "").trim();
            if (answer) {
                setMemo((prev) => `${prev}\n\n\n➡️ AI 모범답안:\n\n${answer}`);
            } else {
                toast.error("모범답안 생성 실패");
            }
        } finally {
            setLoading(false);
        }
    }, [question, setLoading, setLoadingText]);

    /* -------------------------------- 저장/리뷰 -------------------------------- */
    const handleSave = useCallback(() => {
        if (!memo.trim()) {
            toast.error("📝 답변을 먼저 입력해주세요!");
            return;
        }
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
        if (history.length === 0) {
            toast.error("저장된 질문이 없습니다.");
            return;
        }
        setSavedHistory(history);
        setUi("review");
    }, [setSavedHistory, setUi]);

    return (
        <div className="App started">
            <h2>{question}</h2>
            <h3>남은 시간: {timeLeft}초</h3>

            <div style={{ position: "relative", width: 360, height: 360, marginTop: 16 }}>
                <video
                    ref={videoRef}
                    src="/avatar.mp4"        // public/avatar.mp4
                    muted
                    playsInline
                    autoPlay
                    loop
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
                            const url = pendingAudioUrlRef.current;
                            if (url) await playAudioAndVideo(url);
                        }}
                    >
                        ▶ 아바타 재생하기
                    </button>
                )}
            </div>

            <button
                className="btn primary"
                onClick={() => {
                    const src = audioRef.current?.src;
                    if (src) playAudioAndVideo(src);
                }}
                style={{ marginTop: 12 }}
            >
                ▶ 다시 듣기
            </button>

            {!isRecording ? (
                <button onClick={startRecording} disabled={!timerRunning} style={{ marginTop: 16 }}>
                    <i className="fa-solid fa-microphone" aria-hidden="true" />{" "}
                    {timerRunning ? "답변 녹음 시작" : "질문 듣고 답변하세요"}
                </button>
            ) : (
                <button onClick={stopRecording} style={{ marginTop: 16 }}>
                    <i className="fa-solid fa-circle-stop" aria-hidden="true" /> 녹음 정지
                </button>
            )}

            {audioURL && (
                <div style={{ marginTop: 12 }}>
                    <audio controls src={audioURL} />
                </div>
            )}

            <button onClick={() => runOne(false)} disabled={bankLoading} style={{ marginTop: 16 }}>
                <i className="fa-solid fa-shuffle" aria-hidden="true" />{" "}
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
                        <i className="fa-solid fa-wand-magic" aria-hidden="true" /> 모범답안 요청하기
                    </button>
                    <button onClick={handleSave}>
                        <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> 질문 + 메모 저장
                    </button>
                    <button onClick={handleGoToReview}>
                        <i className="fa-solid fa-folder-open" aria-hidden="true" /> 저장된 질문/답변 보기
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
                    <i className="fa-solid fa-arrow-left icon-nudge" aria-hidden="true" /> 설문 다시하기
                </button>
            </div>
        </div>
    );
}

export default Practice;
