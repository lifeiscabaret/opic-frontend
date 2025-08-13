// src/api.js
const API_BASE = process.env.REACT_APP_API_BASE_URL;
// Netlify에 이미 설정해둔 https://opic-backend.onrender.com 를 읽어옴

if (!API_BASE) {
    // 빌드 시점에 환경변수 누락 체크(개발 중 빨리 발견)
    // eslint-disable-next-line no-console
    console.warn('REACT_APP_API_BASE_URL is not set');
}

export async function health() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health ${res.status}`);
    return res.json();
}

export async function ask({ question, prompt }) {
    const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, prompt }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ASK ${res.status}: ${text}`);
    }
    return res.json(); // { answer }
}
