# English Loop Web

English Loop의 Next.js PWA 프런트엔드입니다. FastAPI 백엔드는 별도 저장소인 `global-experience/english-loop-service`에서 관리합니다.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

로컬 API를 사용할 때 `.env.local`을 다음처럼 설정합니다.

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Vercel

저장소 루트를 그대로 Vercel 프로젝트에 연결합니다. 별도의 Root Directory 설정은 필요하지 않습니다.

```env
NEXT_PUBLIC_API_BASE_URL=/backend
API_PROXY_ORIGIN=https://YOUR_RENDER_SERVICE.onrender.com
```

`/backend` 요청은 `next.config.ts`의 rewrite를 통해 Render의 FastAPI로 전달됩니다.

## Verification

```bash
npm test -- --run
npm run build
```
