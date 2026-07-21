# 닷닷갓 킷은 문서 목차를 어떻게 유지하는가

닷닷갓 킷은 문서 목차를 한 번 만들고 끝내지 않는다. 초기화, README 인덱스, 자동 검증, 추적 관계, 영향 분석과 아카이브를 작업 흐름에 결합해 문서가 추가되고 이동하고 분리된 뒤에도 탐색 구조를 현재 상태로 유지한다.

**Language:** [English edition](ENGLISH.md)

앞선 글에서는 프로젝트의 하위 디렉터리와 파일명이 AI 에이전트를 위한 책의 목차라고 설명했다. 그러나 프로젝트가 성장하면 새 문서가 README에서 누락되고, 이동한 문서의 링크가 이전 경로에 남으며, 완료된 계획이 활성 작업과 섞일 수 있다.

닷닷갓 킷은 문서 구조를 권장사항으로만 두지 않는다. 문서가 만들어지고 변경되고 완료되는 모든 단계에 목차를 갱신하는 장치를 둔다.

## 기본 목차를 만들고 성장에 맞춰 확장한다

닷닷갓 킷은 프로젝트 초기화 단계에서 기본 문서 구조를 만든다.

```text
AGENTS.md
CLAUDE.md
CODEX.md
docs/
├── README.md
├── spec/
│   └── README.md
├── arch/
│   └── README.md
├── test/
│   └── README.md
├── plan/
│   └── README.md
└── archive/
    └── README.md
```

빈 디렉터리만 만드는 것이 아니다. 각 README는 영역의 역할과 문서를 배치하는 기준을 설명한다. 문서를 쓰기 전에 책의 부와 기본 목차부터 만드는 셈이다.

에이전트가 달라져도 같은 구조를 사용한다. `AGENTS.md`는 모든 에이전트가 공유하는 작업 규칙을 제공하고, `CLAUDE.md`와 `CODEX.md`는 이 규칙으로 연결되는 얇은 진입점 역할을 한다. 프로젝트 문서 탐색은 `docs/README.md`에서 시작한다.

따라서 Pi, Claude Code, Codex가 서로 다른 문서 체계를 만들지 않고 같은 경로와 용어를 공유할 수 있다.

닷닷갓 킷은 모든 문서를 하나의 거대한 목차에 나열하지 않는다. 각 디렉터리의 `README.md`가 자기 영역의 로컬 목차를 담당한다.

```text
docs/README.md
    ↓
docs/spec/README.md
    ↓
docs/spec/cli/README.md
    ↓
docs/spec/cli/LOAD_SNAPSHOT.md
```

각 README에는 중요한 문서와 하위 디렉터리, 상태, 한 줄 설명을 기록한다. 문서를 추가하거나 이름을 바꾸거나 분리하거나 아카이브할 때는 가장 가까운 README를 같은 변경에서 갱신한다.

이 규칙 덕분에 README는 소개문이 아니라 실제 문서 탐색을 위한 라우팅 테이블이 된다.

작은 주제는 하나의 집중된 문서로 시작한다.

```text
docs/spec/PAYMENT.md
```

한 도메인이 여러 문서로 성장하면 별도의 디렉터리와 README를 갖는 구조로 승격한다.

```text
docs/spec/payment/
├── README.md
├── LIST_API.md
├── SUMMARY_API.md
└── REFUND_POLICY.md
```

이 방식은 하나의 목차가 지나치게 길어지는 것을 막고, 거대한 문서가 여러 책임을 동시에 설명하는 것도 방지한다. 문서가 늘어날 때 파일만 추가하는 것이 아니라 탐색 계층도 함께 조정하는 것이다.

문서 구조를 확장한 뒤에는 각 경로가 프로젝트 메모리에서 맡을 역할을 설정할 수 있다. `dotdotgod config .`으로 현재 정책을 확인하고, `dotdotgod config init .`으로 내장 기본값을 `dotdotgod.config.json`에 기록한 뒤 `memory.areas`를 편집한다.

```json
{
  "memory": {
    "areas": [
      { "id": "decision", "label": "Decisions", "paths": ["docs/decision/**"], "scope": "shared", "freshness": "fresh", "role": "decision-record", "priority": 70, "includeBodiesByDefault": true }
    ]
  }
}
```

새 경로를 추가 메모리 영역으로 등록할 수 있고, 기본 `spec`, `architecture`, `test` 영역의 경로와 우선순위를 바꾸거나 필요하지 않은 항목을 배열에서 제거할 수도 있다. 설정은 파일이나 디렉터리를 자동으로 만들고 지우는 기능이 아니라, 이미 존재하는 문서를 어떤 역할과 범위의 메모리로 분류할지 정하는 정책이다. 구체적인 필드와 우선순위 규칙은 [메모리 영역 설정 스펙](../../spec/MEMORY_AREA_CONFIG.md)에서 확인할 수 있다.

## 이름과 구조를 자동으로 검증한다

문서 규칙은 작성자의 기억에만 의존해서는 오래 유지되지 않는다. 닷닷갓 CLI는 프로젝트 문서가 정해진 구조를 따르는지 검사한다.

```bash
dotdotgod validate . \
  --include-local-memory \
  --check-index
```

검증은 다음과 같은 문제를 찾는다.

- 필요한 기본 문서와 README 인덱스가 존재하는가
- Markdown 링크와 구조화된 추적 정보가 유효한가
- 문서 이름, 경로와 크기가 관리 규칙을 따르는가
- 인덱스가 현재 파일 상태와 일치하는가

문서 크기도 목차를 유지하기 위한 검증 대상이다. 기본값은 Markdown 파일 하나당 200줄과 10,000자다. 둘 중 하나를 넘으면 `FILE_TOO_LONG` 또는 `FILE_TOO_LARGE` 오류가 발생한다. 이때 하나의 문서를 계속 늘리기보다 주제별로 나누고 가장 가까운 README 목차를 갱신해야 한다.

프로젝트는 `dotdotgod.config.json`에서 크기 제한과 제외 경로를 조정할 수 있다.

```json
{
  "validation": {
    "markdown": {
      "maxLines": 200,
      "maxChars": 10000,
      "exclude": ["docs/archive/README.md"]
    }
  }
}
```

예외는 의도적으로 큰 인덱스나 생성 문서처럼 분할하기 어려운 경로에만 좁게 적용한다. 일회성 검증에서는 `--max-lines`와 `--max-chars`로 기준을 덮어쓸 수 있으며, 자동 생성되는 추적 링크 영역과 `json dotdotgod` 블록은 본문 크기를 왜곡하지 않도록 측정에서 제외된다.

책을 출간하기 전에 목차, 상호 참조와 누락된 페이지를 확인하는 교정 과정과 비슷하다. 문서 구조를 사람의 주의력에만 맡기지 않고 코드처럼 검사한다. 검증은 누락되거나 지나치게 커진 목차 항목을 찾아 탐색 구조가 무너지는 것을 막는다.

## 스펙과 구현, 테스트를 연결한다

목차가 잘 구성되어 있어도 문서가 실제 코드와 분리되어 있다면 프로젝트 메모리의 신뢰도는 낮아진다. 닷닷갓 킷은 중요한 동작 스펙에 구조화된 추적 정보를 기록해 구현 파일, 테스트, 관련 문서와 검증 명령을 연결한다.

예를 들어 CLI 구현을 변경했다면 `graph impact`로 함께 검토할 스펙과 테스트를 찾을 수 있다.

```bash
dotdotgod graph impact . --changed <path>
```

그래프와 인덱스는 원본 문서를 대신하지 않는다. 변경 파일에서 관련 문서를 찾는 방법과 결과의 우선순위를 정하는 과정은 후속 글 [변경 파일에서 함께 확인할 문서를 찾는 방법](../how-graph-impact-finds-related-docs/README.md)에서 자세히 다룬다.

## 현재 계획과 과거 기록을 분리한다

문서 체계가 오래될수록 현재 정보와 역사적 정보의 구분이 중요해진다.

진행 중인 작업은 다음 경로에 기록한다.

```text
docs/plan/<task-slug>/README.md
```

계획에는 목표, 범위, 대상 파일, 위험, 구현 순서, 검증 방법과 진행 상태가 들어간다. 작업이 끝나면 계획을 아카이브로 이동한다.

```text
docs/archive/plan/<task-slug>/
```

`docs/archive/README.md`는 완료된 작업을 찾는 역사 목차로 남는다. 과거를 삭제하지 않으면서도 현재 작업과 섞이지 않게 하는 방식이다.

에이전트는 모든 아카이브 본문을 항상 읽지 않는다. 먼저 역사 목차를 확인하고, 특정한 과거 결정이 필요할 때만 관련 기록을 연다. 아카이브는 과거를 보존하면서 현재 목차에서 완료된 작업을 분리한다.

## 목차는 작업 흐름 속에서 유지된다

닷닷갓 킷은 초기화와 공통 에이전트 규칙으로 기본 목차를 만들고, 각 README를 로컬 목차로 사용한다. 문서가 성장하면 도메인 디렉터리로 승격하고, 자동 검증과 영향 분석으로 링크와 추적 관계를 점검한다. 계획과 아카이브의 수명주기는 현재와 과거를 분리한다. 이렇게 유지된 목차는 Load가 현재 작업에 필요한 문서만 선택하는 프로젝트 메모리 지도로 사용된다.

문서 체계는 잘 정리된 초기 상태만으로 유지되지 않는다. 문서가 추가되고, 변경되고, 분리되고, 완료되는 모든 과정에 목차를 갱신하는 규칙이 포함되어야 한다.

닷닷갓 킷이 관리하려는 것은 Markdown 파일의 집합이 아니다. 사람과 여러 AI 에이전트가 같은 방식으로 읽고, 변경하고, 검증할 수 있는 **살아 있는 프로젝트 메모리 체계**다.

## 함께 읽기

- [AI 에이전트의 메모리는 문서 목차에서 시작된다](../document-directory-as-table-of-contents/README.md)
- [AI에게 모든 문서를 읽히지 않고 최신 프로젝트 컨텍스트를 유지하는 방법](../how-load-keeps-ai-context-fresh/README.md)
- [변경 파일에서 함께 확인할 문서를 찾는 방법](../how-graph-impact-finds-related-docs/README.md)
- [Load 프로젝트 스펙](../../spec/LOAD_PROJECT.md)
- [Markdown 검증 설정](../../spec/VALIDATION_CONFIG.md)
- [graph impact 명령 스펙](../../spec/cli/GRAPH_IMPACT.md)
- [임팩트 랭킹 아키텍처](../../arch/IMPACT_RANKING_CONFIG.md)
- [문서 구조 아키텍처](../../arch/DOCS_STRUCTURE.md)
