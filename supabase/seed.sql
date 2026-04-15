-- Seed data: first content — 가치관 경매 (Values Auction)
-- Run AFTER schema.sql

insert into public.contents (
  title,
  description,
  min_people,
  max_people,
  requires_table,
  tension_level,
  play_type,
  duration_min,
  needs_materials,
  activity_type,
  leader_guide,
  member_guide,
  winner_formula
) values (
  '가치관 경매',
  '각자에게 소중한 가치관(사랑, 우정, 자유 등)을 경매로 낙찰받는 활동. 내가 무엇을 가장 소중히 여기는지 발견하게 됩니다.',
  6,
  30,
  false,
  'medium',
  'individual',
  20,
  'paper_pen',
  'values',
  $md$## 가치관 경매 진행 가이드

### 준비 (5분)
1. 각 팀원에게 종이와 펜을 나눠준다
2. 팀원들에게 가상 경매 머니 100만원을 부여한다고 안내한다
3. 경매에 나올 가치관 목록을 공개한다:
   사랑 / 우정 / 자유 / 성공 / 건강 / 가족 / 믿음 / 즐거움 / 안정 / 성장

### 진행 (10~15분)
1. 가치관을 하나씩 경매에 올린다
2. "이 가치관에 입찰하실 분?" 하고 시작
3. 손을 드는 사람들끼리 금액을 높여가며 경쟁
4. 더 이상 올리는 사람이 없으면 낙찰
5. 낙찰자와 금액을 기록한다
6. 모든 가치관을 진행하거나 예산이 떨어질 때까지 반복

### 마무리 (5분)
1. 각자 어떤 가치관을 낙찰받았는지 나눔
2. "왜 그 가치관에 가장 많이 입찰했나요?" 질문으로 나눔 유도$md$,
  $md$오늘은 가치관 경매입니다! 🎉

당신에게는 가상의 경매 머니 100만원이 있어요.
아래 가치관들이 경매에 나올 거예요:

사랑 / 우정 / 자유 / 성공 / 건강 / 가족 / 믿음 / 즐거움 / 안정 / 성장

💡 메모 팁: 아래 메모장에 각 가치관마다 얼마를 쓸지 미리 적어두세요.
실제 입찰은 손을 들어서 진행합니다!$md$,
  $md$우승자(MVP) 결정 기준:
1. 가장 많은 가치관을 낙찰받은 사람
2. 동률 시: 총 사용 금액이 적은 사람 (효율적 입찰)
3. 그래도 동률 시: 리더가 직접 선정$md$
);
