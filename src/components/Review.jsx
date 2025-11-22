export default function Review({ reviewData, onBack, onNext }) {
    if (!reviewData) {
        return (
            <div className="App started review-mode">
                <h2>OPIc AI Review</h2>
                <p>리뷰 데이터가 없습니다. 다시 연습을 시작해주세요.</p>
                <button className="btn ghost" onClick={onBack}>
                    ← 연습 화면으로
                </button>
            </div>
        );
    }

    const {
        questionText,
        answerText,
        fluency,
        grammar,
        vocab,
        taskAchievement,
        score,
        overallFeedback,
        recommendedLevel,
    } = reviewData;

    return (
        <div className="App started review-mode">
            <h2>OPIc AI Review</h2>

            <div
                style={{
                    marginBottom: 16,
                    padding: 16,
                    borderRadius: 8,
                    background: "#f5f5ff",
                }}
            >
                <p>
                    <strong>질문</strong>
                </p>
                <p>{questionText}</p>
            </div>

            <div
                style={{
                    marginBottom: 16,
                    padding: 16,
                    borderRadius: 8,
                    background: "#f7f7f7",
                    whiteSpace: "pre-wrap",
                }}
            >
                <p>
                    <strong>내 답변(STT 텍스트)</strong>
                </p>
                <p>{answerText}</p>
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 16,
                    marginBottom: 24,
                    flexWrap: "wrap",
                }}
            >
                <div
                    style={{
                        padding: 12,
                        borderRadius: 8,
                        background: "#4e47d1",
                        color: "white",
                        minWidth: 120,
                    }}
                >
                    <div style={{ fontSize: 12, opacity: 0.8 }}>점수</div>
                    <div style={{ fontSize: 20, fontWeight: "bold" }}>
                        {score ?? "-"} / 5
                    </div>
                </div>
                <div
                    style={{
                        padding: 12,
                        borderRadius: 8,
                        background: "#fff3cd",
                        minWidth: 150,
                    }}
                >
                    <div style={{ fontSize: 12, opacity: 0.8 }}>추천 레벨</div>
                    <div style={{ fontSize: 18, fontWeight: "bold" }}>
                        {recommendedLevel || "-"}
                    </div>
                </div>
            </div>

            <Section title="Fluency" text={fluency} />
            <Section title="Grammar" text={grammar} />
            <Section title="Vocabulary" text={vocab} />
            <Section title="Task Achievement" text={taskAchievement} />

            <div
                style={{
                    marginTop: 24,
                    padding: 16,
                    borderRadius: 8,
                    background: "#e8f5e9",
                    whiteSpace: "pre-wrap",
                }}
            >
                <p style={{ fontWeight: "bold" }}>Overall Feedback</p>
                <p>{overallFeedback}</p>
            </div>

            <div
                style={{
                    marginTop: 32,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                }}
            >
                <button className="btn ghost" onClick={onBack}>
                    ← 같은 질문 다시 말하기
                </button>
                <button className="btn primary" onClick={onNext}>
                    다음 질문 연습하기 →
                </button>
            </div>
        </div>
    );
}

function Section({ title, text }) {
    if (!text) return null;
    return (
        <div
            style={{
                marginBottom: 16,
                padding: 16,
                borderRadius: 8,
                background: "#ffffff",
                border: "1px solid #eee",
            }}
        >
            <p style={{ fontWeight: "bold" }}>{title}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
        </div>
    );
}
