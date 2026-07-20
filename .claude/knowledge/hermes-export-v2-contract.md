# HermesExport v2 Contract

확정일: 2026-07-16

## 결정

`HermesExport`는 v1 필드(`profiles`, `sessions`, `cronJobs`, `flowLogs`)에 더해 optional v2 필드를 지원한다.

- `evolutionSnapshots` → `SoulMapData.evolution`
- `requests` → `SoulMapData.requests`
- `roadmap` → `SoulMapData.roadmap`
- `sourceHealth` → UI 전용 `deriveSourceHealth()` 결과

## 안전 규칙

- 기존 v1 JSON은 그대로 동작해야 한다.
- v2 optional 배열이 배열이 아니면 validate에서 차단하지 않고 mapper가 빈 배열로 안전 수렴한다.
- 식별자 없는 항목은 skip한다.
  - evolution: `agentId/profileId` 또는 `date` 없음 → skip
  - requests/roadmap: `id` 없음 → skip
- 값 오염은 fallback한다.
  - request status 미지값 → `queued`
  - priority 미지값 → `medium`
  - roadmap phase 미지값 → `future`
  - roadmap done은 `true`일 때만 true
  - source health status 미지값 → `unknown`

## Source Health 채널

고정 5채널: 세션, 기억, 스킬, 크론, 플로우로그.

상태 enum: `live | partial | empty | error | unknown`.
자동 판정은 count 기준 `live` 또는 `empty`만 만든다. `partial/error/unknown`은 export 제공값 또는 seed 미제공 상태에서만 표시한다.
