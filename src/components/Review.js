import { useEffect, useState } from 'react';
import { LS } from '../App';

function Review({ setUi, savedHistory, setSavedHistory }) {
    const [openAnswerIndex, setOpenAnswerIndex] = useState(null);
    const [reviewMode, setReviewMode] = useState('latest'); // 'latest' or 'list'

    // savedHistory가 App.js에서 오지 않았을 경우 localStorage에서 불러오기
    useEffect(() => {
        if (savedHistory.length === 0) {
            const historyFromStorage = JSON.parse(localStorage.getItem(LS.history) || "[]");
            setSavedHistory(historyFromStorage);
        }
    }, [savedHistory, setSavedHistory]);

    const latestItem = savedHistory.length > 0 ? savedHistory[savedHistory.length - 1] : null;

    if (savedHistory.length === 0) {
        return (
            <div className="App started review-latest-view">
                <div className="question-block">
                    <div className="review-content">
                        <p>저장된 질문이 없습니다.</p>
                        <p>연습 화면으로 돌아가 질문을 저장해주세요.</p>
                    </div>
                </div>
                <div className="review-actions">
                    <button onClick={() => setUi("practice")}>
                        <i className="fas fa-arrow-left"></i> 연습 화면으로 돌아가기
                    </button>
                </div>
            </div>
        )
    }

    return (
        reviewMode === 'latest' ? (
            <div className="App started review-latest-view">
                {latestItem && (
                    <div className="question-block">
                        <div className="review-header">
                            <div className="review-header-left">
                                <i className="fas fa-sparkles"></i>
                                <h3>최근 복습 질문</h3>
                            </div>
                            <span className="latest-badge">LATEST</span>
                        </div>
                        <div className="review-content">
                            <p className="latest-review-question"><strong>{latestItem.question}</strong></p>
                            <div className="answer-content">
                                <p style={{ whiteSpace: "pre-wrap" }}>💬 <em>{latestItem.memo}</em></p>
                                {latestItem.gptAnswer && (
                                    <div className="gpt-answer-box">
                                        <strong>➡️ AI 모범답안</strong>
                                        <em>{latestItem.gptAnswer}</em>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div className="review-actions">
                    <button onClick={() => { setReviewMode('list'); setOpenAnswerIndex(null); }}>
                        <i className="fas fa-list-ul"></i> 전체 목록 보기
                    </button>
                    <button onClick={() => setUi("practice")}>
                        <i className="fas fa-arrow-left"></i> 다른 문제 풀기
                    </button>
                </div>
            </div>
        ) : (
            <div className="App started review-mode">
                <h2>
                    <i className="fas fa-book-journal-whills" style={{ color: "#4e47d1", marginRight: 10 }}></i>
                    저장된 질문과 답변
                </h2>
                <button onClick={() => setUi("practice")}>
                    <i className="fas fa-arrow-left"></i> 다른 문제 풀기
                </button>
                {savedHistory.slice().reverse().map((item, index) => (
                    <div key={index} className="question-block">
                        <p>
                            <strong>
                                <i className="fas fa-question-circle" style={{ marginRight: 8, color: "#6c63ff" }}></i>
                                Q{savedHistory.length - index}. {item.question}
                            </strong>
                        </p>
                        <button
                            onClick={() => setOpenAnswerIndex(openAnswerIndex === index ? null : index)}
                            className={`review-toggle-btn ${openAnswerIndex === index ? 'open' : ''}`}
                        >
                            <i className={`fas ${openAnswerIndex === index ? "fa-chevron-up" : "fa-comment-dots"}`}></i>
                            &nbsp;{openAnswerIndex === index ? "답변 숨기기" : "답변 보기"}
                        </button>
                        {openAnswerIndex === index && (
                            <div className="answer-content">
                                <p style={{ whiteSpace: "pre-wrap" }}>💬 <em>{item.memo}</em></p>
                                {item.gptAnswer && (
                                    <div className="gpt-answer-box">
                                        <strong>➡️ AI 모범답안</strong>
                                        <em>{item.gptAnswer}</em>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )
    );
}

export default Review;
