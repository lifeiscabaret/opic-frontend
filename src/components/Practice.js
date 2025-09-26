import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { API_BASE, LS, SURVEY } from "../App";

const FALLBACK_QUESTIONS = [
    "Tell me about a recent weekend activity you really enjoyed and why it was meaningful.",
    "Describe your favorite place at home and how you usually spend time there.",
    "Talk about a hobby you picked up recently and how you got into it.",
];

const TTS_VOICE = "shimmer";

function Practice({ setUi, setLoading, setLoadingText, setSavedHistory }) {
    // UI state
    const [question, setQuestion] = useState("");
    const [timeLeft, setTimeLeft] = useState(60);
    const [timerRunning, setTimerRunning] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [memo, setMemo] = useState("");
    const [needVideoGesture, setNeedVideoGesture] = useState(false);

    // Recording state
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [recMime, setRecMime] = useState("audio/webm");
    const [isRecording, setIsRecording] = useState(false);
    const [audioURL, setAudioURL] = useState("");

    // Refs
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const pendingAudioUrlRef = useRef(null);

    // Question bank
    const [questionBank, setQuestionBank] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);

    const playAudioAndVideo = useCallback(async (audioUrl) => {
        const audio = audioRef.current;
        const video = videoRef.current;
        if (!audio || !video) return;

        audio.src = audioUrl;
        audio.load();

        audio.onended = () => {
            video.pause();
            setTimeLeft(60);
            setTimerRunning(true);
        };

        video.currentTime = 0;

        try {
            await Promise.all([video.play(), audio.play()]);
            setNeedVideoGesture(false);
        } catch (error) {
            console.error("Autoplay was prevented:", error);
            pendingAudioUrlRef.current = audioUrl;
            setNeedVideoGesture(true);
            video.play().catch(e => console.error("Muted video also failed to play:", e));
        }
    }, []);

    const fetchQuestionBatch = useCallback(async () => {
        const level = localStorage.getItem(LS.level) || "IH–AL";
        const role = localStorage.getItem(LS.role) || "";
        const residence = localStorage.getItem(LS.residence) || "";
        const recentCourse = localStorage.getItem(LS.recentCourse) || "";
        const selectedTopics = JSON.parse(localStorage.getItem(LS.topics) || "[]");

        const topicLabels = SURVEY.topics
            .filter(t => selectedTopics.includes(t.key))
            .map(t => t.label);

        const prompt = `
You are an expert OPIC coach. Generate 20 personalized, OPIC-style interview questions in English based on the user's profile.
- Return ONLY a valid JSON array of strings. No extra text or commentary.
- Each question: 14-22 words, single sentence, natural spoken style.
- Base questions on these topics: ${topicLabels.length > 0 ? topicLabels.join(', ') : 'General everyday topics'}.
- Reference Profile: Level: ${level}, Role: ${role}, Residence: ${residence}, Course: ${recentCourse}.
`.trim();

        try {
            setBankLoading(true);
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
                try { arr = JSON.parse(match[0]); } catch { arr = []; }
            }
            if (!Array.isArray(arr) || !arr.length) arr = FALLBACK_QUESTIONS;
            setQuestionBank(prev => [...prev, ...arr.filter(Boolean)]);
        } finally {
            setBankLoading(false);
        }
    }, []);

    const runOne = useCallback(async () => {
        setLoadingText("AI가 맞춤형 질문을 생성중입니다...");
        setLoading(true);
        setTimeLeft(60);
        setTimerRunning(false);
        setIsFinished(false);
        setMemo("");
        setAudioURL("");
        setNeedVideoGesture(false);

        try {
            let nextQuestion;
            if (questionBank.length > 0) {
                nextQuestion = questionBank[0];
                setQuestion(nextQuestion);
                setQuestionBank(prev => prev.slice(1));
            } else {
                await fetchQuestionBatch();
                const fetchedBank = await new Promise(resolve => {
                    setQuestionBank(currentBank => {
                        resolve(currentBank);
                        return currentBank;
                    });
                });
                nextQuestion = fetchedBank[0] || FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
                setQuestion(nextQuestion);
                setQuestionBank(prev => prev.slice(1));
            }

            const res = await fetch(`${API_BASE}/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: nextQuestion, voice: TTS_VOICE }),
            });

            if (!res.ok) throw new Error("TTS request failed");
            const audioBlob = await res.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            await playAudioAndVideo(audioUrl);

        } catch (e) {
            console.error("runOne failed", e);
            toast.error("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setLoading(false);
            if (questionBank.length < 5 && !bankLoading) {
                fetchQuestionBatch();
            }
        }
    }, [bankLoading, fetchQuestionBatch, playAudioAndVideo, questionBank, setLoading, setLoadingText]);


    useEffect(() => {
        runOne();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            const preferredMime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
            setRecMime(preferredMime);
            const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
            const chunks = [];
            recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
            recorder.start();
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
        mediaRecorder.onstop = async () => {
            setLoadingText("음성을 텍스트로 변환 중입니다...");
            setLoading(true);
            const type = recMime || "audio/webm";
            const audioBlob = new Blob(mediaRecorder.chunks, { type });
            setAudioURL(URL.createObjectURL(audioBlob));
            try {
                const formData = new FormData();
                formData.append("audio", audioBlob, `recording.${type.split("/")[1]}`);
                const res = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: formData });
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
    }, [mediaRecorder, recMime, setLoading, setLoadingText]);

    const fetchBestAnswerFromGPT = useCallback(async () => {
        if (!question.trim()) return toast.error("질문이 먼저 필요해요!");
        setLoadingText("모범답안을 생성 중입니다...");
        setLoading(true);
        try {
            const targetBand = localStorage.getItem(LS.level) || "IM2–IH";
            const modelAnswerPrompt = `
You are an OPIC rater and coach. Write a model answer in English for the prompt at ${targetBand} level.
Constraints: 130–170 words, first-person, friendly spoken style, clear structure with examples.
Prompt: ${question}`.trim();
            const res = await fetch(`${API_BASE}/ask`, {
                method: "POST", headers: { "Content-Type": "application/json" },
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

    return (
        <div className="App started">
            <h2>{question}</h2>
            <h3>남은 시간: {timeLeft}초</h3>
            <div style={{ position: "relative", width: 360, height: 360, marginTop: 16 }}>
                <video ref={videoRef} src="/avatar.mp4" muted playsInline loop preload="auto" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 16, objectFit: "cover", background: "#000" }} />
                <audio ref={audioRef} />
                {needVideoGesture && (
                    <button className="btn primary" style={{ position: "absolute", inset: 0, margin: "auto", height: 56, width: 220, backdropFilter: "blur(2px)", }}
                        onClick={async () => {
                            const url = pendingAudioUrlRef.current;
                            if (url) {
                                await playAudioAndVideo(url);
                            }
                        }}>
                        ▶ 아바타 재생하기
                    </button>
                )}
            </div>
            <button className="btn primary" onClick={() => { if (audioRef.current.src) playAudioAndVideo(audioRef.current.src); }} style={{ marginTop: 12 }}>
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
            {audioURL && <div style={{ marginTop: 12 }}><audio controls src={audioURL} /></div>}
            <button onClick={runOne} disabled={bankLoading} style={{ marginTop: 16 }}>
                <i className="fa-solid fa-shuffle" aria-hidden="true"></i>{" "}
                {bankLoading ? "새 질문 로딩…" : "다른 질문 받기"}
            </button>
            <div style={{ marginTop: 40, width: "100%", maxWidth: "600px" }}>
                <h3>📝 내 답변 메모하기</h3>
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={5} placeholder="여기에 영어로 말한 내용을 적어보세요!" />
            </div>
            {isFinished && (
                <>
                    <button onClick={fetchBestAnswerFromGPT}><i className="fa-solid fa-wand-magic" aria-hidden="true"></i> 모범답안 요청하기</button>
                    <button onClick={handleSave}><i className="fa-solid fa-floppy-disk" aria-hidden="true"></i> 질문 + 메모 저장</button>
                    <button onClick={handleGoToReview}><i className="fa-solid fa-folder-open" aria-hidden="true"></i> 저장된 질문/답변 보기</button>
                </>
            )}
            <div className="practice-actions">
                <button type="button" className="btn-reset" onClick={() => setUi("survey")} title="설문 다시하기">
                    <i className="fa-solid fa-arrow-left icon-nudge" aria-hidden="true"></i> 설문 다시하기
                </button>
            </div>
        </div>
    );
}
export default Practice;