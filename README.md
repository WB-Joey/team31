# 교회 팀모임 콘텐츠 플랫폼

교회 팀 리더(15~20명 규모)가 매주 팀모임 콘텐츠를 쉽게 선택하고 진행할 수 있는 웹 플랫폼.

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Realtime + Auth)
- **배포**: Vercel (예정)

---

## 🚀 첫 실행 순서

### 1. 의존성 설치
```bash
npm install
```

### 2. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. 프로젝트 **Settings → API** 에서 URL과 `anon` key 복사
3. `.env.local.example` 을 `.env.local` 로 복사 후 값 입력

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. DB 스키마 생성 & 시드 데이터 삽입
Supabase 대시보드 → **SQL Editor** 에서 순서대로 실행:
1. `supabase/schema.sql` 전체 복사 → 실행
2. `supabase/seed.sql` 전체 복사 → 실행 (가치관 경매 데이터)

### 4. 개발 서버 실행
```bash
npm run dev
```
→ http://localhost:3000 접속

---

## 🧭 현재 개발 단계 (1단계 완료)

| 단계 | 내용 | 상태 |
|------|------|------|
| 1 | 전체 구조 + DB + 첫 화면 ~ 리더 필터 | ✅ |
| 2 | 콘텐츠 선택 + 룸코드 + 팀원 입장 | ⏳ |
| 3 | 실시간 진행 화면 (타이머, 가이드, 메모장) | ⏳ |
| 4 | 결과 입력 + 공개 + 애니메이션 | ⏳ |
| 5 | 콘텐츠 추가 + 관리자 페이지 | ⏳ |

### 1단계에서 확인 가능한 화면
- `/` — 리더 / 팀원 선택
- `/leader/filter` — 리더 7가지 필터 설정
- `/leader/select` — (2단계 플레이스홀더)
- `/member/join` — (2단계 플레이스홀더)

---

## 🗂️ 폴더 구조
```
app/
  layout.tsx            # 루트 레이아웃 (한글 폰트 Pretendard)
  page.tsx              # 홈 (리더/팀원 선택)
  globals.css           # Tailwind + 전역 스타일
  leader/
    filter/page.tsx     # 7가지 필터 카드 UI
    select/page.tsx     # (2단계)
  member/
    join/page.tsx       # (2단계)
lib/
  supabase.ts           # Supabase 브라우저 클라이언트
  types.ts              # DB/필터 TypeScript 타입
supabase/
  schema.sql            # 테이블 4개 (contents, sessions, participants, results)
  seed.sql              # 가치관 경매 콘텐츠 삽입
```
