# 모임 날짜와 지난 모임 자동 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모임 링크에 선택 입력인 날짜를 넣고, 날짜가 지난 모임을 '모임 열기' 목록에서 자동으로 제거한다.

**Architecture:** 날짜는 모임 JSON의 선택 필드 `date`로 링크 해시에 들어간다. 날짜 판정은 `public/group-share.js`의 순수 함수로 두고 `app.js`가 목록 렌더링과 저장 시 사용한다. 짧은 링크 Worker는 `date` 키를 허용한다.

**Tech Stack:** 바닐라 JS ES modules, `node --test`, Cloudflare Worker(D1).

**Spec:** `docs/superpowers/specs/2026-11-26-group-date-auto-cleanup-design.md`

## Global Constraints

- 날짜 형식: `YYYY-MM-DD`, 실제 존재하는 날짜만 허용.
- 판정 기준: 한국 시간(UTC+9) 오늘 날짜 > 모임 날짜이면 지난 모임.
- 날짜가 없으면 모임 JSON에 `date` 키를 넣지 않는다(기존 링크와 같은 URL 유지).
- `worker/route-api.mjs`와 `public/route-worker.txt`는 바이트 단위로 같아야 한다(`tests/short-links.test.mjs`).
- 외부 의존성 추가 금지.

## Review Focus

- `2026-02-30` 같은 존재하지 않는 날짜가 담긴 링크 → 클라이언트와 Worker 모두 거부.
- 한국 날짜 경계: UTC 2026-11-27T14:59Z는 한국 11/27 23:59(아직 당일), 15:00Z는 11/28 0시.
- 날짜가 지난 링크를 직접 열면 목적지는 표시되지만 목록에 다시 추가되지 않는다.
- 작성 중인 초안은 날짜가 지나도 목록에서 사라지지 않는다.
- 날짜 없는 기존 v1 링크가 이전과 똑같이 열리고 저장된다.

---

### Task 1: 모임 데이터의 날짜 필드와 날짜 판정 함수

**Files:**
- Modify: `public/group-share.js`
- Test: `tests/group-share.test.mjs`

**Interfaces:**
- Produces:
  - `createGroupUrl(base, name, places, date = '') -> string` (빈 문자열이면 `date` 키 생략)
  - `readGroupUrl(href) -> {v:1,name,places,date?} | null`
  - `koreaToday(now = new Date()) -> 'YYYY-MM-DD'`
  - `isGroupPast(group, now = new Date()) -> boolean` (`date` 없으면 false)
  - `formatGroupDate(date) -> string` 예: `'2026-11-28'` → `'11/28(토)'`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('group date travels in the link and is optional',()=>{
 const url=createGroupUrl('https://example.com/','모임',[place],'2026-11-28');
 assert.equal(readGroupUrl(url).date,'2026-11-28');
 assert.equal('date' in readGroupUrl(createGroupUrl('https://example.com/','모임',[place])),false);
 for(const bad of ['2026-02-30','2026/11/28','28-11-2026']) assert.throws(()=>createGroupUrl('https://example.com/','모임',[place],bad));
});
test('groups expire after the meeting day in Korea time',()=>{
 const g={date:'2026-11-27'};
 assert.equal(groupShare.koreaToday(new Date('2026-11-27T14:59:00Z')),'2026-11-27');
 assert.equal(groupShare.isGroupPast(g,new Date('2026-11-27T14:59:00Z')),false);
 assert.equal(groupShare.isGroupPast(g,new Date('2026-11-27T15:00:00Z')),true);
 assert.equal(groupShare.isGroupPast({},new Date('2030-01-01T00:00:00Z')),false);
 assert.equal(groupShare.formatGroupDate('2026-11-28'),'11/28(토)');
});
```

- [ ] **Step 2: 실행해서 실패 확인** — `node --test tests/group-share.test.mjs` → 새 테스트 FAIL.
- [ ] **Step 3: 구현** — `validate`에서 `date`가 있으면 정규식과 `Date.UTC` 왕복 검사로 실제 날짜인지 확인하고, 허용 키는 `v,name,places,date`.
- [ ] **Step 4: 실행해서 통과 확인** — 같은 명령, 전부 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "Add optional meeting date to group links"`

### Task 2: Worker가 날짜 있는 모임을 허용

**Files:**
- Modify: `worker/route-api.mjs` (`validSharedUrl`), `public/route-worker.txt`(같은 내용 복사)
- Test: `tests/short-links.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `createGroupUrl(base,name,places,date)`

- [ ] **Step 1: 실패하는 테스트 작성** — 날짜 있는 모임 URL(`createGroupUrl(site+'/kakaotmap/','모임',[place],'2026-11-28')`) POST → 201, `'2026-02-30'`을 직접 인코딩한 URL POST → 400.
- [ ] **Step 2: 실패 확인** — `node --test tests/short-links.test.mjs` → 201 기대 테스트 FAIL.
- [ ] **Step 3: 구현** — 모임 키 목록에 `date` 추가, 값이 있으면 Task 1과 같은 규칙으로 검사. 수정 후 `cp worker/route-api.mjs public/route-worker.txt`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "Accept meeting dates in short link worker"`

### Task 3: 날짜 입력과 목록 자동 정리 UI

**Files:**
- Modify: `public/index.html` (모임 이름 입력 뒤에 `<label for="group-date">모임 날짜 (선택)</label><input id="group-date" type="date">`, 안내 문구에 "날짜가 지나면 모임 목록에서 자동으로 빠집니다." 추가, `app.js`/`group-share.js` 버전 쿼리 갱신)
- Modify: `public/app.js`
- Test: `tests/group-share.test.mjs`의 기존 DOM fixture 패턴이 없으면 Task 1 함수 테스트로 충분하고, 수동 확인으로 검증한다.

**Interfaces:**
- Consumes: Task 1의 `createGroupUrl`, `readGroupUrl`, `isGroupPast`, `formatGroupDate`

- [ ] **Step 1: 초안에 날짜 저장** — `draft`를 `{name,places,date}`로 확장(저장값에 `date` 없으면 `''`), `group-date` 입력 시 `saveDraft`, `editGroup`에서 `group.date` 복원, 화면 열 때 입력값 채우기.
- [ ] **Step 2: 모든 `createGroupUrl` 호출에 날짜 전달** — 폼 제출, `renderLibrary`의 초안 URL, `deleteGroup`의 초안 비교, `openGroup`의 `safeUrl`, `groupSnapshot` 처리.
- [ ] **Step 3: 지난 모임 제외** — `rememberGroup`은 `isGroupPast(group)`이면 저장하지 않는다. `renderLibrary`는 `groupLibrary`에서 지난 모임을 걸러 localStorage에 다시 저장한 뒤 렌더링한다(초안 항목은 제외 대상 아님).
- [ ] **Step 4: 날짜 표시** — 목록 버튼 텍스트를 `(작성 중 · )` + `(formatGroupDate(date) + ' · ')` + 이름 + 목적지로 구성.
- [ ] **Step 5: 전체 테스트** — `npm test` → 전부 PASS.
- [ ] **Step 6: 수동 확인** — 로컬에서 날짜를 어제로 넣은 모임과 내일로 넣은 모임을 만들고 '모임 열기'에서 어제 모임만 사라지는지, 420px 폭에서 날짜 표시와 삭제 버튼이 보이는지 확인.
- [ ] **Step 7: 커밋** — `git commit -m "Hide past meetings from the group library"`
