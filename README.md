# 🎤 OPIC AI Trainer

AI를 활용해 OPIC(Oral Proficiency Interview) 시험 대비를 도와주는 웹 애플리케이션입니다.  
실제 시험과 유사한 환경에서 질문을 받고, 음성으로 답변하며, 답변 내용을 저장하고 피드백을 받을 수 있습니다.

---

## 🚀 배포 링크
🔗 [OPIC AI Trainer 바로가기](https://illustrious-hummingbird-0af3bb.netlify.app/)

---

## 📌 주요 기능
- **랜덤 문제 제공** – 실제 OPIC 시험과 유사한 질문 랜덤 제공
- **음성 녹음 기능** – 브라우저에서 직접 음성 녹음 가능
- **답변 메모** – 말한 내용을 메모하여 기록
- **답변 저장 및 조회** – 이전에 했던 질문과 답변을 다시 확인 (현재는 브라우저 `localStorage`에 저장)
- **모범 답안 보기** – AI 기반 예시 답변 제공

---

## 🖼 화면 미리보기

| 메인 화면 | 문제 화면 | 답변 저장 화면 |
|-----------|-----------|----------------|
| ![메인 화면](./frontend/assets/main.png) | ![문제 화면](./frontend/assets/question.png) | ![답변 저장 화면](./frontend/assets/answer1.png)<br>![답변 저장 화면2](./frontend/assets/answer2.png) |

---

## 🛠 기술 스택
**Frontend**
- React.js
- CSS
- Web Audio API (음성 녹음)
- localStorage (간단한 답변 저장)

**Backend**
- Node.js (Express)
- OpenAI API (질문 생성 & 모범 답안 생성)

**배포**
- Frontend: Netlify
- Backend: Render

---

## 📂 프로젝트 구조
frontend/
├─ assets/                 # README에 사용하는 스크린샷 이미지
│  ├─ main.png
│  ├─ question.png
│  ├─ answer1.png
│  ├─ answer2.png
│  └─ (기타 캡처 이미지)
├─ public/                 # 정적 파일
│  ├─ _redirects
│  ├─ favicon.ico
│  ├─ index.html
│  ├─ manifest.json
│  └─ robots.txt
├─ src/                    # 주요 React 코드
│  ├─ api.js               # API 요청 관련 유틸
│  ├─ App.js               # 메인 App 컴포넌트
│  ├─ App.css
│  ├─ App.test.js
│  ├─ index.js             # 진입 파일
│  ├─ index.css
│  ├─ logo.svg
│  ├─ reportWebVitals.js
│  └─ setupTests.js
├─ .env                    # 환경 변수 설정
├─ .gitignore
├─ package-lock.json
├─ package.json
└─ README.md



---

backend/                  # 백엔드 서버 (Express)
├─ server.js              # 메인 서버 로직 (CORS, 라우팅, OpenAI API 호출)
├─ index.js               # 서버 실행 진입점
├─ .env                   # 환경 변수 (API 키, 포트 등)
├─ .gitignore             # Git에 올리지 않을 파일 설정
├─ package.json           # 의존성 및 스크립트 관리
├─ package-lock.json      # 의존성 버전 잠금
├─ build/                 # 프론트엔드 빌드 파일
│  ├─ index.html          # 메인 HTML
│  ├─ favicon.ico         # 파비콘
│  ├─ manifest.json       # PWA 매니페스트
│  ├─ robots.txt          # 검색엔진 크롤링 설정
│  ├─ asset-manifest.json # 빌드된 파일 매핑 정보
│  └─ static/             # 정적 리소스 (JS, CSS, 이미지)


## 💡 향후 개선 계획
- **MongoDB 연동**하여 서버 기반 답변 저장 기능 구현
- **사용자 계정 시스템** 추가로 개인별 연습 기록 관리
- **통계/피드백 시스템** 도입하여 학습 성과 시각화
- **STT(음성 인식)** 백엔드 처리로 API 키 보안 강화

---

## 📜 라이선스
MIT License