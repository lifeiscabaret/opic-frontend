// src/App.js
import { useEffect, useState } from 'react';
import { health, ask } from './api';
import './App.css';

function App() {
  const [alive, setAlive] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const h = await health();
        setAlive(h);
      } catch (e) {
        setErr(`Health check failed: ${e.message}`);
      }
    })();
  }, []);

  const onAsk = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setAnswer('');
    try {
      const res = await ask({ question: q });
      setAnswer(res.answer || '(empty)');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App" style={{ maxWidth: 720, margin: '40px auto', textAlign: 'left' }}>
      <h1>OPIC Practice (Netlify ↔ Render)</h1>

      <section style={{ padding: '12px 0' }}>
        <h3>Health</h3>
        <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
          {alive ? JSON.stringify(alive, null, 2) : 'checking...'}
        </pre>
      </section>

      <section style={{ padding: '12px 0' }}>
        <h3>Ask</h3>
        <form onSubmit={onAsk}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="질문을 입력하세요"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            style={{ marginTop: 10, padding: '10px 16px', borderRadius: 8 }}
          >
            {loading ? '요청 중…' : '질문 보내기'}
          </button>
        </form>

        {answer && (
          <div style={{ marginTop: 12 }}>
            <strong>Answer</strong>
            <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
              {answer}
            </pre>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 12, color: 'crimson' }}>
            <strong>Error:</strong> {err}
          </div>
        )}
      </section>

      <hr />
      <small>
        API_BASE: <code>{process.env.REACT_APP_API_BASE_URL || '(not set)'}</code>
      </small>
    </div>
  );
}

export default App;
