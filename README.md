# AI SkillFit

A government skill assessment platform for Karnataka's blue-collar workforce. Candidates conduct real-time voice interviews with **Priya**, an AI interviewer, who evaluates their trade knowledge and produces a fitment score.

---

## How It Works

```
Candidate opens app
       │
       ▼
Taps "Start Interview" → app calls FastAPI backend
       │
       ▼
Backend creates LiveKit room + dispatches Priya (voice agent)
       │
       ▼
App connects to LiveKit room (audio only)
       │
       ▼
Candidate speaks with Priya in their preferred language
       │
       ▼
Interview ends → app shows fitment result
```

---

## Project Structure

```
AI-for-bharat-demo-repo/
├── frontend/               # React Native (Expo) mobile + web app
│   ├── src/
│   │   ├── screens/        # All app screens
│   │   ├── services/       # API calls (interviewService.ts, supabase/)
│   │   ├── navigation/     # React Navigation setup
│   │   ├── context/        # AuthContext (user session + profile)
│   │   ├── theme/          # Colors, spacing, typography
│   │   └── translations/   # EN / KN / HI strings
│   ├── .env.example        # ← copy to .env and fill in values
│   └── package.json
│
└── real_voice_bot/         # Python backend + LiveKit voice agent
    ├── server.py           # FastAPI server (start-interview, results endpoints)
    ├── agent.py            # Priya — LiveKit voice agent
    ├── nodes/              # Interview phase logic (icebreaker, technical, etc.)
    ├── requirements_backend.txt
    ├── requirements_agent.txt
    └── .env.example        # ← copy to .env and fill in values
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile / Web app | React Native (Expo SDK 54), TypeScript |
| Real-time voice | LiveKit Cloud |
| Speech-to-Text | Sarvam AI (`saaras:v3`) |
| Text-to-Speech | Sarvam AI (`bulbul:v3`, `ritu` voice) |
| LLM | Groq — Llama 3.3 70B |
| Auth + Database | Supabase |
| Backend API | FastAPI + Uvicorn |

---

## Prerequisites

Before running the project, you need accounts on these services. All have free tiers.

| Service | Used for | Sign up |
|---|---|---|
| **Sarvam AI** | Priya's voice — STT + TTS in Indian languages | https://dashboard.sarvam.ai |
| **Groq** | LLM brain for interview logic (free, very fast) | https://console.groq.com |
| **LiveKit Cloud** | Real-time voice rooms | https://cloud.livekit.io |
| **Supabase** | Auth and database for the app | https://supabase.com |

You will also need:
- **Python 3.10+**
- **Node.js 18+** and **npm**

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-org/AI-for-bharat-demo-repo.git
cd AI-for-bharat-demo-repo
```

### 2. Backend environment

```bash
cd real_voice_bot
cp .env.example .env
```

Open `.env` and fill in all five values:

```env
SARVAM_API_KEY=        # from dashboard.sarvam.ai → API Keys
GROQ_API_KEY=          # from console.groq.com → API Keys
LIVEKIT_URL=           # from cloud.livekit.io → your project → Settings (wss://...)
LIVEKIT_API_KEY=       # from cloud.livekit.io → your project → Settings
LIVEKIT_API_SECRET=    # from cloud.livekit.io → your project → Settings
```

Install Python dependencies:

```bash
pip install -r requirements_backend.txt
pip install -r requirements_agent.txt
```

### 3. Frontend environment

```bash
cd ../frontend
cp .env.example .env
```

The `.env` file only needs the backend URL. If running locally, the default is already correct:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
EXPO_PUBLIC_BACKEND_API_KEY=skillfit-local
```

Install Node dependencies:

```bash
npm install
```

---

## Running the App

You need **three terminals** running at the same time.

**Terminal 1 — FastAPI backend**
```bash
cd real_voice_bot
python server.py
```
Runs at `http://localhost:8000`. Check it's working: open `http://localhost:8000/health` in your browser.

**Terminal 2 — Priya voice agent**
```bash
cd real_voice_bot
python agent.py dev
```
This connects to LiveKit Cloud and waits for interview rooms to be created. You should see `registered worker` in the logs.

**Terminal 3 — Expo web app**
```bash
cd frontend
npx expo start --web
```
Opens at `http://localhost:8081`. Use Chrome for best WebRTC support.

---

## Using the App

1. Open `http://localhost:8081` in Chrome
2. Select your language
3. Sign up or log in
4. Complete the onboarding (name, trade, experience)
5. On the home screen, tap **Start Interview**
6. Tap **Begin Interview** on the prep screen
7. Allow microphone access when Chrome asks
8. Tap **Start Interview** — Priya will greet you and ask which language you prefer
9. Speak naturally — Priya will conduct a full trade assessment
10. When done, tap **End Interview** → view your fitment result

---

## API Endpoints

The FastAPI backend exposes three endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/start-interview` | Creates LiveKit room, dispatches Priya, returns token |
| `GET` | `/results?trade=optional` | Fetches interview results from the database |
| `POST` | `/save-result` | Called internally by Priya at end of interview |
| `GET` | `/health` | Health check |

**POST /start-interview**

Request body:
```json
{
  "candidate_name": "Ravi Kumar",
  "trade": "Electrician",
  "phone_number": "9876543210"
}
```

Response:
```json
{
  "token": "eyJ...",
  "room": "interview-9876543210-abc123",
  "url": "wss://your-project.livekit.cloud"
}
```

---

## Environment Variables Reference

### `real_voice_bot/.env`

| Variable | Description | Where to get it |
|---|---|---|
| `SARVAM_API_KEY` | Sarvam AI API key | dashboard.sarvam.ai → API Keys |
| `GROQ_API_KEY` | Groq API key | console.groq.com → API Keys |
| `LIVEKIT_URL` | LiveKit server WebSocket URL | cloud.livekit.io → project → Settings |
| `LIVEKIT_API_KEY` | LiveKit API key | cloud.livekit.io → project → Settings |
| `LIVEKIT_API_SECRET` | LiveKit API secret | cloud.livekit.io → project → Settings |

### `frontend/.env`

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | URL of the running FastAPI backend (e.g. `http://localhost:8000`) |
| `EXPO_PUBLIC_BACKEND_API_KEY` | Any string — the backend accepts all values currently |

---

## What Gets Committed to Git

| File | Committed | Reason |
|---|---|---|
| `real_voice_bot/.env` | ❌ No | Contains real API keys — gitignored |
| `real_voice_bot/.env.example` | ✅ Yes | Safe template for others |
| `frontend/.env` | ❌ No | Gitignored |
| `frontend/.env.example` | ✅ Yes | Safe template for others |
| All source code | ✅ Yes | |

> **Important:** Never commit your `.env` files. If you accidentally do, rotate your API keys immediately on each service dashboard.

---

## Supported Languages

Priya can conduct interviews in:

| Language | Code |
|---|---|
| English | `en-IN` |
| Hindi | `hi-IN` |
| Kannada | `kn-IN` |
| Tamil | `ta-IN` |
| Telugu | `te-IN` |
| Marathi | `mr-IN` |
| Bengali | `bn-IN` |
| Gujarati | `gu-IN` |
| Malayalam | `ml-IN` |
| Punjabi | `pa-IN` |
| Odia | `od-IN` |

---

## Troubleshooting

**Blank white screen in browser**
Open Chrome DevTools (F12) → Console tab and check for red errors. Most common cause is a JavaScript crash on startup.

**"Could not reach the server" when starting interview**
Make sure `python server.py` is running in Terminal 1 and accessible at `http://localhost:8000/health`.

**Priya joins the room but doesn't speak**
Make sure `python agent.py dev` is running in Terminal 2 and shows `registered worker` in the logs. Check that your `SARVAM_API_KEY` and `GROQ_API_KEY` are set correctly in `real_voice_bot/.env`.

**No audio from Priya in the browser**
Chrome requires a user gesture before playing audio. Make sure you tapped "Start Interview" yourself (not auto-triggered). Also ensure you're on `http://localhost` — Chrome blocks audio on other non-HTTPS origins.

**Microphone permission denied**
Click the lock icon in Chrome's address bar → Site settings → Microphone → Allow. Then refresh and try again.

**Agent crashes with `AttributeError: module 'livekit.rtc' has no attribute 'AutoSubscribe'`**
Your `livekit-agents` version is newer than expected. Run:
```bash
pip install -r requirements_agent.txt
```

---

## License

This project was built for the AI for Bharat initiative.
