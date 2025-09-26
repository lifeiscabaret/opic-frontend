# 🎤 OPIC Master (v2)

AI 기반 OPIc(Oral Proficiency Interview) 시험 대비 웹 애플리케이션입니다.  
실제 시험과 유사한 환경에서 **아바타 + 음성 합성(TTS)** 으로 질문을 제시하고,  
사용자는 **음성(STT) 또는 텍스트**로 답변할 수 있습니다.  

---

## 🚀 배포 링크
- **v2 (AWS 기반 최신 버전)**: https://main.d32tjci5ztnd7z.amplifyapp.com/
- **v1 (Render + Netlify 버전)**: https://illustrious-hummingbird-0af3bb.netlify.app

---
## 📌 주요 기능
- **실제 OPIc 시험 흐름 구현**: Survey → 질문 제시 → 답변 녹음/텍스트 → Review
- **질문 생성**: OpenAI GPT-4o-mini 기반, Survey 결과 반영 맞춤형 질문
- **아바타 질문 시스템**: D-ID/비디오 아바타 + OpenAI TTS 동기화
- **음성 인식(STT)**: Whisper API 기반 실시간 음성 → 텍스트 변환
- **콜드스타트 완화**: `undici keep-alive` + warm-up 요청으로 첫 응답 지연 최소화
- **LRU 캐시**: 동일 문장 TTS 재생 시 즉시 응답
- **Review 모드**: 답변 + AI 모범답안 저장 후 복습 가능
- **모바일 최적화**: 소음 환경에서 텍스트 답변 모드 지원

---


## 🖼 화면 미리보기

### 메인 화면
<img src="./assets/main.png" width="600"/>

### OPIC Survey 화면
<img src="./assets/opic survey.jpg" width="600"/>

### 문제 화면
<img src="./assets/question.jpg" width="600"/>

### 녹음 화면
<img src="./assets/record.jpg" width="600"/>

### 모바일 
<img src="./assets/mobile.jpeg" width="600"/>

### 답변 저장 화면
<img src="./assets/answer1.png" width="600"/>
<img src="./assets/answer2.png" width="600"/>

---

## 🛠 기술 스택
### Frontend
- React.js, React Router
- Web Audio API (녹음)
- localStorage (사용자 히스토리 저장)
- UI: Custom CSS + FontAwesome

### Backend
- Node.js (Express)
- OpenAI API
  - GPT-4o-mini (질문 생성, 모범답안)
  - TTS-1 (음성 합성)
  - Whisper-1 (음성 인식)
- multer (파일 업로드), undici (keep-alive)

### Infra
- Frontend: AWS Amplify
- Backend: AWS App Runner
- (과거 v1) Frontend: Netlify / Backend: Render

---

## 📂 프로젝트 구조

```bash
OPIC-AI-TRAINER/
├─ backend/                      # Express 서버 (OpenAI 연동)
│  ├─ .env                       # 환경 변수 (git에 올라가지 않음)
│  ├─ .gitignore
│  ├─ server.js
│  ├─ package.json
│  └─ package-lock.json
│
opic-frontend/                   # 프론트엔드 (React)
├─ public/
│  ├─ avatar.mp4                 # 아바타 영상 파일
│  ├─ favicon.ico
│  ├─ index.html
│  ├─ manifest.json
│  └─ robots.txt
│
├─ src/
│  ├─ App.js                     # 메인 App 컴포넌트
│  ├─ App.css
│  ├─ Survey.js                  # OPIC Survey 단계
│  ├─ Practice.js                # 질문/답변 실습
│  ├─ Review.js                  # 답변 검토 & 모범답안 비교
│  ├─ LoadingOverlay.js          # 로딩 UI
│  ├─ ScrollButtons.js           # 페이지 내 이동 버튼
│  ├─ assets/                    # 캡처/이미지 리소스
│  │  ├─ main.png
│  │  ├─ opic_survey.jpg
│  │  ├─ question.jpg
│  │  ├─ answer1.png
│  │  ├─ answer2.png
│  │  ├─ mobile.jpeg
│  │  └─ record.jpg
│  └─ index.js / index.css
│
├─ server.js                     # 백엔드 (Express API)
├─ package.json
├─ package-lock.json
└─ README.md
``` 

---

## 향후 개선 계획
- **Heygen API 연동**으로 아바타가 실제로 질문을 말해주는 인터랙티브 환경 제공  
  (기능 구현 완료, 유료 결제 필요로 배포 미적용 상태)  
- **AI 피드백/채점 시스템** 도입으로 사용자의 답변을 점수화하고 예상 등급(IH, AL 등)까지 예측  
- **MongoDB 연동**하여 서버 기반 답변 저장 기능 구현  
- **사용자 계정 시스템** 추가로 개인별 연습 기록 관리  
- **통계/피드백 대시보드** 도입으로 학습 성과 시각화 및 맞춤형 개선 방향 제안  
- **스트리밍 TTS 적용**으로 첫 응답 지연 최소화 및 몰입도 강화

---

## 📜 라이선스
MIT License
