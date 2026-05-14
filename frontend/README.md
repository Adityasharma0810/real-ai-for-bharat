# AI SkillFit — Frontend

React Native (Expo) mobile and web app for the AI SkillFit voice interview platform.

For full setup instructions, prerequisites, and how to run the project, see the **[root README](../README.md)**.

---

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env

# Run on web (recommended for development)
npx expo start --web

# Run on Android
npx expo start --android

# Run on iOS
npx expo start --ios
```

## Environment Variables

Copy `.env.example` to `.env`:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
EXPO_PUBLIC_BACKEND_API_KEY=skillfit-local
```

See the [root README](../README.md) for full details.
