# 공유 링크 미리보기에 목적지 이름 표시

## 의도

카카오톡 등에 공유 링크를 보냈을 때 미리보기 카드에 목적지나 모임 이름이 보이게 한다. 비용이 드는 짧은 도메인은 쓰지 않는다.

## 목표

- Worker의 `GET /s/<id>`가 302 대신 200 HTML을 돌려준다. HTML에는 OG 태그와 즉시 이동(`<meta http-equiv="refresh" content="0;url=...">`), 수동 이동 링크가 들어 있다.
  - 모임: `og:title` = 모임 이름(+ 날짜가 있으면 ` · 11/28(토)`), `og:description` = 목적지 이름을 `, `로 연결.
  - 단일 목적지: `og:title` = 목적지 이름, `og:description` = 주소(없으면 `길 안내`).
  - 공통: `og:site_name` = `바로길`, `og:type` = `website`, `og:url` = 요청한 짧은 링크, `<title>` = `og:title`.
  - 모든 값은 HTML 이스케이프한다. 스크립트를 쓰지 않고 `Content-Security-Policy: default-src 'none'`을 보낸다.
- `POST /links`는 같은 URL이 이미 저장되어 있으면 기존 id를 돌려준다(일일 한도를 쓰지 않음).
- 공유받은 모임 화면은 열릴 때 짧은 링크를 미리 요청하고, 공유 버튼을 누르면 준비된 짧은 링크를 쓴다. 준비되지 않았으면 기존처럼 긴 링크를 쓴다. 공유 창은 버튼을 누른 직후 기다림 없이 연다.

## 하지 않는 것

- 미리보기 이미지(`og:image`)는 넣지 않는다.
- 짧은 도메인 구입, 링크 id 길이 변경은 하지 않는다.
- 카카오 SDK 공유 버튼은 만들지 않는다.

## 접근 방식

| 방식 | 장점 | 단점 |
|---|---|---|
| **Worker가 미리보기 HTML 제공 (선택)** | 어떤 메신저든 목적지 이름이 보임, 비용 없음 | Worker 재배포 필요 |
| 카카오 SDK 공유 | 이미지·버튼이 있는 카드 | 그 버튼으로 보낼 때만 동작, 콘솔 설정 필요 |
| 사이트 공통 OG 태그 | 가장 간단 | 목적지 이름이 보이지 않음 |

사용자가 Worker 방식을 선택했다.

## 제약

- `worker/route-api.mjs`와 `public/route-worker.txt`는 같아야 한다.
- 날짜 표기는 `public/group-share.js`의 `formatGroupDate`와 같은 형식이어야 한다. Worker는 사이트 모듈을 import할 수 없으므로 같은 로직을 Worker에 둔다.
