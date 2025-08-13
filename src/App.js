// React 훅 import 및 상태 선언
import React, { useEffect, useState } from 'react';
import './App.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

// 메인 App 컴포넌트 정의
function App() {
  const [isStarted, setIsStarted] = useState(false);
  // 현재 화면 모드 상태 (start/practice/review)
  const [mode, setMode] = useState('practice'); // 'practice' | 'review'
  // 현재 GPT 질문 상태
  const [question, setQuestion] = useState('');
  // 타이머 상태 (초 단위)
  const [timeLeft, setTimeLeft] = useState(60);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [, setAudioURL] = useState('');
  const [memo, setMemo] = useState('');
  const [isFinished, setIsFinished] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [openAnswerIndex, setOpenAnswerIndex] = useState(null);

  // GPT에서 질문 가져오는 함수 정의
  const fetchQuestionFromGPT = async () => {
    try {
      setTimeLeft(60);
      setIsFinished(false);
      setMemo('');
      setAudioURL('');

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '너는 오픽 시험관이야. 영어로 IM2~IH 수준의 질문을 하나 만들어줘.',
            },
          ],
        }),
      });

      const data = await res.json();
      const message = data.choices?.[0]?.message?.content;
      setQuestion(message || '질문을 불러오지 못했습니다.');
    } catch (error) {
      console.error('질문을 불러오는 중 오류 발생:', error);
      setQuestion('질문을 불러오는 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    if (!isStarted || mode !== 'practice') return;

    if (timeLeft === 0) {
      setIsFinished(true);
      return;
    }

    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    // 조건에 따라 화면 UI 렌더링 시작
    return () => clearInterval(timer);
  }, [timeLeft, isStarted, mode]);

  const fetchBestAnswerFromGPT = async () => {
    if (!question.trim()) return alert('❗ 질문이 먼저 필요해요!');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '너는 영어 오픽 시험관이야. 사용자 질문에 대해 IM2~IH 수준의 영어 답변을 작성해줘.',
          },
          {
            role: 'user',
            content: question,
          },
        ],
      }),
    });
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content;
    if (answer) {
      setMemo((prev) => prev + `\n\n\n🌟 GPT 모범답안:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${answer}`);
    } else {
      alert('❗ 모범답안 생성 실패');
    }
  };

  const transcribeAudio = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const data = await res.json();
    return data.text;
  };

  // 녹음 시작 함수 정의
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

  // 녹음 정지 함수 정의
  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsFinished(true);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(mediaRecorder.chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
        const transcript = await transcribeAudio(blob);
        setMemo((prev) => prev + '\n' + transcript);
      };
    }
  };

  const handleSave = () => {
    if (!memo.trim()) return alert('📝 답변을 먼저 입력해주세요!');
    const saved = JSON.parse(localStorage.getItem('opicHistory') || '[]');
    const newEntry = {
      question,
      memo: memo.split('🌟 GPT 모범답안:')[0].trim(),
      gptAnswer: memo.includes('🌟 GPT 모범답안:') ? memo.split('🌟 GPT 모범답안:')[1].trim() : '',
    };
    localStorage.setItem('opicHistory', JSON.stringify([...saved, newEntry]));
    alert('✅ 저장되었습니다!');
  };

  const toggleSavedView = () => {
    const history = JSON.parse(localStorage.getItem('opicHistory') || '[]');
    setSavedHistory(history);
    setMode('review');
  };

  const returnToPractice = () => {
    setMode('practice');
    fetchQuestionFromGPT();
    setTimeLeft(60);
    setMemo('');
    setAudioURL('');
    setIsFinished(false);
  };

  if (!isStarted) {
    // 조건에 따라 화면 UI 렌더링 시작
    return (
      <div className="start-screen">
        <h1 className="start-title">OPIC</h1>
        <p className="start-subtitle" onClick={() => {
          setIsStarted(true);
          fetchQuestionFromGPT();
        }}>
          Let’s start practice
        </p>
      </div>
    );
  }

  // ▶ 실전 연습화면 렌더링 조건
  if (mode === 'practice') {
    // 조건에 따라 화면 UI 렌더링 시작
    return (
      <div className="App started">
        <h2>오늘의 질문</h2>
        <h3>남은 시간: {timeLeft}초</h3>
        <p className="question-text">
          {question || '로딩 중...'}
        </p>

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

        <div style={{ marginTop: '40px' }}>
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

  // 저장된 질문/답변 리뷰 화면 렌더링 조건
  if (mode === 'review') {
    // 조건에 따라 화면 UI 렌더링 시작
    return (
      // ▶ 저장된 질문/답변 리뷰 화면 렌더링 조건
      <div className={`App started ${mode === 'review' ? 'review-mode' : ''}`}>
        <h2><i className="fas fa-book-journal-whills" style={{ color: '#4e47d1', marginRight: '10px' }}></i> 저장된 질문과 답변</h2>

        <button onClick={returnToPractice}>
          <i className="fas fa-arrow-left"></i> 다른 문제 풀기
        </button>
        {savedHistory.map((item, index) => (
          <div
            key={index}
            className="question-block"
            style={{
              width: '80%',
              minHeight: '120px',
              margin: '20px auto',
              padding: '20px',
              border: '1px solid #ccc',
              borderRadius: '10px',
              backgroundColor: '#f9f9f9',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}
          >
            {/* 아이콘 포함한 질문 텍스트 */}
            <p>
              <strong>
                <i
                  className="fas fa-question-circle"
                  style={{ marginRight: '8px', color: '#6c63ff' }}
                ></i>
                Q{index + 1}. {item.question}
              </strong>
            </p>

            {/* 답변 보기/숨기기 버튼 */}
            <button
              onClick={() =>
                setOpenAnswerIndex(openAnswerIndex === index ? null : index)
              }
            >
              <i className={`fas ${openAnswerIndex === index ? 'fa-chevron-up' : 'fa-comment-dots'}`}></i>
              &nbsp;{openAnswerIndex === index ? '답변 숨기기' : '답변 보기'}
            </button>

            {/* 실제 답변 텍스트들 */}
            {openAnswerIndex === index && (
              <>
                <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>
                  💬 <em>{item.memo}</em>
                </p>
                {item.gptAnswer && (
                  <div className="gpt-answer-box">
                    <strong>🌟 GPT 모범답안</strong>
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
}

// App 컴포넌트 내보내기
export default App;