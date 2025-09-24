// src/components/Survey.js
import { useState } from 'react';
import { LS, SURVEY, API_BASE } from '../App'; // ✅ API_BASE 추가

function Survey({ setUi }) {
    const [level, setLevel] = useState(localStorage.getItem(LS.level) || "IH–AL");
    const [residence, setResidence] = useState(localStorage.getItem(LS.residence) || "");
    const [role, setRole] = useState(localStorage.getItem(LS.role) || "");
    const [recentCourse, setRecentCourse] = useState(localStorage.getItem(LS.recentCourse) || "");
    const [selectedTopics, setSelectedTopics] = useState(
        JSON.parse(localStorage.getItem(LS.topics) || "[]")
    );

    /* ------------------- 질문 프리로드 (기능만 추가) ------------------- */
    const buildQuestionBatchPrompt = () => {
        const selectedTopicLabels = SURVEY.topics
            .filter((t) => selectedTopics.includes(t.key))
            .map((t) => t.label);

        return `
You are an expert OPIC coach.
Return ONLY a valid JSON array of 20 strings. No code block, no numbering, no extra text.

Rules:
- Each question: 14–22 words, single sentence, natural spoken English.
- No duplicates in meaning/wording; avoid template-like phrasing.
- Mix tenses (past/present/future) within ${level || "IM2–IH"}.
- Reflect the profile faithfully; keep everyday-life topics unless specified.
- Ban starters: ["Can you tell me", "Could you tell me", "Please describe"].
- Avoid yes/no and multi-question chains ("and/or").

[User Profile]
Target Level: ${level || "Not specified"}
Role: ${role || "Not specified"}
Residence: ${residence || "Not specified"}
Recent Course: ${recentCourse || "Not specified"}
Preferred Topics: ${selectedTopicLabels.length
                ? selectedTopicLabels.join(", ")
                : "General everyday topics (home, routine, hobbies, work, school, travel, etc.)"
            }
`.trim();
    };

    const preloadQuestionsToLocalStorage = async () => {
        try {
            const prompt = buildQuestionBatchPrompt();
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
            if (Array.isArray(arr) && arr.length) {
                localStorage.setItem("prefetchedBatch", JSON.stringify(arr.slice(0, 20)));
            }
        } catch (e) {
            // 프리로드 실패는 치명적이지 않음(Practice에서 자동 백업 경로 있음)
            console.error("preload error", e);
        }
    };

    /* ------------------- 기존 핸들러 유지(화면 전환) + 프리로드 추가 ------------------- */

    const handleStart = () => {
        // 프리로드는 기다리지 않고 백그라운드에서 실행
        preloadQuestionsToLocalStorage();
        // 바로 Practice 화면으로 전환 → 로딩 오버레이 즉시 노출
        setUi("practice");
    };


    return (
        <div className="survey-wrap">
            <div className="survey-card">
                <h2 className="survey-title">
                    <i className="fa-regular fa-file-lines" />
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
                            {SURVEY.residenceOptions.map((x) => (<option key={x} value={x}>{x}</option>
                            ))}
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
                        onClick={handleStart} // ✅ 최소침습: 기능만 추가
                    >
                        {"이 설정으로 시작"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Survey;
