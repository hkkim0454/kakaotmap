# 경로 비교 서버 배포

이 단계는 서버만 준비합니다. 바로길 화면 연결 및 실제 API 사용 권한 검증은 별도로 진행합니다.

1. Cloudflare Worker `barogil-route-api`의 비밀 값에 `TMAP_APP_KEY`, `KAKAO_REST_API_KEY`를 등록합니다.
2. D1 데이터베이스 `barogil-route-usage`를 만들고 Worker에 변수 이름 `ROUTE_DB`로 연결합니다.
3. Worker의 **코드 편집**에서 기존 Hello World 코드를 모두 지우고 [`worker/route-api.mjs`](../worker/route-api.mjs) 파일 전체를 붙여넣은 뒤 **배포**합니다. 키를 코드에 입력하지 않습니다.
4. `https://barogil-route-api.hkkim0454.workers.dev/health`를 열어 `configured`의 세 값이 모두 `true`인지 확인합니다. 이는 연결 이름과 키 존재 여부만 확인하며, DB 실행 권한 및 실제 API 인증 성공을 의미하지 않습니다.
5. 실제 `/compare` 호출로 결과를 검증한 다음 바로길 화면과 연결합니다.

진단 버전 `2026-10-13.2`부터 `/health`에 `version`이 표시됩니다. 비교 오류에는 `errorCode`, HTTP 응답을 받은 경우 `httpStatus`, 제공사가 숫자 오류 코드를 반환한 경우 `providerCode`가 포함됩니다. 인증·권한 거절, 잘못된 응답 형식, 경로 없음, 연결 실패, 시간 초과를 구분합니다. 제공사의 원문 메시지나 키는 응답에 포함하지 않습니다. 실제 실패 원인은 이 버전을 Worker에 배포한 뒤 한 번 조회하여 확인합니다.

처음 비교 요청이 들어오면 사용량 테이블을 자동 생성합니다. 별도 SQL 붙여넣기는 필요하지 않습니다.

## 동작 및 제한

- `POST /compare`: `{ "origin": { "x": 126.97, "y": 37.55 }, "destination": { "x": 127.1, "y": 37.4 } }`
- 추천 자동차 경로를 업체별 1회씩 요청합니다. 일반 승용차 기준 거리(m), 시간(초), 통행료(원)를 반환합니다. 누락된 통행료는 `null`이며 무료라고 표시하면 안 됩니다.
- 모든 이용자를 합해 한국 시간 하루 400회로 제한합니다. 실패한 조회도 횟수를 소비하며 재시도는 자동으로 하지 않습니다. D1 오류 시 외부 API 호출을 차단합니다.
- 카운터에는 날짜와 횟수만 저장합니다. 위치와 키는 저장하거나 로그로 출력하지 않습니다.
- CORS는 GitHub Pages 도메인만 허용하지만 사용자 인증 수단은 아닙니다. 다른 클라이언트가 공용 한도를 소진할 수 있습니다.
- 제한은 이 Worker의 호출만 제어합니다. 같은 API 키를 다른 서비스에서 사용한 호출량은 포함하지 않습니다. 유료 요금제를 신청하거나 변경하지 않습니다.
- `/health`는 외부 길찾기 API를 호출하지 않습니다.
- 앱 실행 시 경로가 다시 계산될 수 있으므로 비교 결과는 조회 시점의 예상값입니다.

참조: [TMAP 자동차 경로](https://tmap-skopenapi.readme.io/reference/자동차-경로안내), [카카오 자동차 길찾기](https://developers.kakaomobility.com/guide/navi-api/directions), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).
