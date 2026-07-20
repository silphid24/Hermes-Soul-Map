# workspace/ — 기능 문서 라이프사이클

각 기능은 `<feature-slug>/` 디렉터리 하나를 가지며, 그 안에 3개 문서가 들어갑니다.

```
workspace/
├── _template/                 # 복사해서 쓰는 양식 (ingest는 _ 로 시작하면 무시)
│   ├── spec.md
│   ├── design.md
│   └── implementation.md
└── <feature-slug>/            # 예: auth-oauth, billing-invoice ...
    ├── spec.md
    ├── design.md
    └── implementation.md
```

## 규칙

- `slug`은 kebab-case. 한 기능 = 한 디렉터리.
- 새 기능은 보통 `/plan <slug> <설명>`으로 시작하면 orchestrator가 `_template/spec.md`를 복사해 채웁니다.
- 진행 순서는 항상 **spec → design → implementation**.
- 각 문서 상단 frontmatter의 `required_approvals`가 모두 `approved`가 되어야 다음 문서로 넘어갑니다.
- `_`로 시작하는 디렉터리(`_template`)는 docs-platform ingest 대상에서 제외됩니다.

## frontmatter 규약 (ingest가 읽는 부분)

```yaml
status: draft | review | approved
approvals:
  <role>: pending | approved | changes_requested
required_approvals: [<role>, ...]
```

## `## Reviews` 규약 (ingest가 읽는 부분)

본문 맨 아래 `## Reviews` 섹션에 리뷰어별 블록을 추가합니다. 헤더 형식이 정확해야 파싱됩니다(`### <reviewer> — <date>`, 구분자는 em dash `—`).

```markdown
## Reviews

### designer — 2026-06-24
**결정**: approved
**이유**: 디자인 시스템과 정합. 접근성 요구 충족.
**변경 요청**:
- (없음)
```

`**결정**:` 값(approved / changes_requested)이 승인 집계의 근거가 됩니다.

## docs-platform로 게시

```bash
# 단일 프로젝트
python docs-platform/ingest.py
# 공유 플랫폼 (여러 sub-project)
python <kit>/docs-platform/ingest.py --project <this-subproject>
```

`/document` 커맨드가 이 과정을 대신 실행합니다.
