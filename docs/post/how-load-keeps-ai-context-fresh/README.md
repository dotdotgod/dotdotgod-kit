# 닷닷갓 Load는 문서 목차를 어떻게 읽기 경로로 바꾸는가

Docs-first 프로젝트 메모리는 사람이 검토할 수 있는 문서를 원본으로 둔다. 에이전트는 그중 현재 작업에 필요한 범위를 골라 읽어야 한다. **닷닷갓의 Load는 유지되는 문서 목차에서 현재 요청에 맞는 짧은 읽기 경로를 만든다.**

**Language:** [English edition](ENGLISH.md)

**Published:** [Velog](https://velog.io/@vgb3766/%EB%8B%B7%EB%8B%B7%EA%B0%93-Load%EB%8A%94-%EB%AC%B8%EC%84%9C-%EB%AA%A9%EC%B0%A8%EB%A5%BC-%EC%96%B4%EB%96%BB%EA%B2%8C-%EC%9D%BD%EA%B8%B0-%EA%B2%BD%EB%A1%9C%EB%A1%9C-%EB%B0%94%EA%BE%B8%EB%8A%94%EA%B0%80)

앞선 글에서는 문서와 파생 탐색 데이터의 역할을 구분했다. 이번 글에서는 에이전트가 세션을 시작하거나 컨텍스트를 갱신할 때 Load가 어떤 순서로 읽을 범위를 줄이는지 살펴본다.

## 먼저 프로젝트의 진입점을 확인한다

Load는 저장소 전체를 검색하기 전에 프로젝트 메모리의 기본 진입점을 확인한다.

```text
AGENTS.md
현재 에이전트의 진입점
README.md
docs/README.md
```

`AGENTS.md`는 여러 에이전트가 공유하는 작업 규칙을 제공한다. 저장소 README는 프로젝트의 목적과 사용법을 설명하고, `docs/README.md`는 스펙, 아키텍처, 테스트와 로컬 메모리 영역으로 이어지는 최상위 목차다.

Load는 저장소 루트와 사용자가 이미 변경한 작업 상태도 확인한다. 현재 세션에서 기본 정보가 이미 분명하면 기존 컨텍스트를 활용하고 사용자 변경을 보존한다.

이 단계에서 다음 탐색이 시작될 안정적인 주소를 확보한다.

## 목차에서 탐색을 시작한다

인자 없이 Load를 실행하면 `docs/` 아래의 공유 Markdown 경로를 prefix-compressed tree로 보여준다.

```text
/load
```

문서 지도는 `docs/`를 깊이 1로 계산해 디렉터리 깊이 5까지 펼친다. 경계보다 깊은 하위 트리는 그 아래에 존재하는 디렉터리와 Markdown 파일의 정확한 재귀 개수로 요약한다.

```text
docs/
├── spec/
│   ├── README.md
│   └── cli/
│       ├── README.md
│       └── QUERY.md
├── arch/
│   └── README.md
└── test/
    └── README.md
```

이 지도에서 에이전트는 디렉터리 구조로 탐색 범위를 고르고 README 목차를 따라 다음 문서를 선택한다. 경로가 문서의 역할을 먼저 보여주기 때문에 필요한 영역을 빠르게 구분할 수 있다.

## 질문이 있으면 읽기 경로를 더 좁힌다

Load에 전달한 자유 형식 인자는 하나의 자연어 검색어가 된다.

```text
/load command routing
```

사용 가능한 경우 다음과 같은 로컬 query를 실행한다.

```bash
dotdotgod query . "command routing" --limit 30 --json
```

focused Load는 문서 지도를 깊이 3으로 줄이고, 의미가 가까운 Markdown 파일을 최대 30개까지 제시한다. 한 파일에서 여러 문단이 검색되더라도 가장 순위가 높은 구간 하나만 대표 결과로 사용한다.

```text
자연어 질문
  → 의미가 가까운 문서 경로
  → 경로의 역할과 README 확인
  → 필요한 원문의 관련 절 읽기
```

query 결과는 질문과 관련될 가능성이 높은 원문으로 이어지는 경로다. 임베딩 모델, 문단 분할과 캐시가 검색을 어떻게 만드는지는 후속 글에서 별도로 살펴본다.

## 현재 작업과 과거 기록은 필요할 때만 연다

공유 문서 지도와 query의 기본 범위에서는 다음 하위 트리를 제외한다.

```text
docs/plan/
docs/archive/
```

이 기본 범위는 현재 공유 문서에 우선순위를 둔다. 현재 작업에 계획이 관련되면 `docs/plan/`의 항목을 확인하고 필요한 계획을 읽는다. 과거 결정이 필요할 때는 `docs/archive/README.md`를 역사 목차로 사용해 관련 아카이브 본문을 찾는다. 현재 작업과 과거 기록은 이렇게 서로 다른 읽기 경로로 들어온다.

## 검색이 실패해도 문서 목차는 남는다

Load는 다음 선택적 CLI 탐색 안내를 제공한다.

```text
Help: dotdotgod --help
```

이 안내는 CLI 실행 상태와 독립적으로 제공된다. CLI나 셸을 사용할 수 없는 환경에서는 README와 문서 지도가 탐색 경로를 이어간다.

focused query에서 모델 다운로드, 추론 또는 캐시 오류가 발생하면 Load는 기본 문서 목차로 돌아간다. Load가 유지하는 소스, 관리 문서와 프로젝트 설정은 그대로 보존된다. query는 Git에서 제외된 `.dotdotgod/vectors/` 캐시를 갱신할 수 있고, 처음 사용할 때 로컬 임베딩 모델을 사용자 단위 캐시에 내려받을 수 있다.

## 좋은 컨텍스트는 짧은 읽기 경로에서 나온다

Load가 읽기 범위를 줄이는 순서는 단순하다.

1. 관리되는 프로젝트와 문서 진입점을 확인한다.
2. 제한된 깊이의 문서 지도로 탐색 범위를 보여준다.
3. 질문이 있으면 의미 검색으로 후보 문서를 좁힌다.
4. 현재 작업에 필요한 계획과 역사만 선택한다.
5. 에이전트가 원문의 필요한 절만 읽게 한다.

같은 원본 문서에서도 현재 세션과 질문에 맞는 읽기 경로를 만들 수 있다.

> 최신 프로젝트 컨텍스트는 신뢰할 수 있는 원본에서 지금 읽어야 할 문서까지의 짧은 경로로 유지된다.

## 함께 읽기

- [AI 에이전트의 메모리는 문서 목차에서 시작된다](../document-directory-as-table-of-contents/README.md)
- [닷닷갓 킷은 문서 목차를 어떻게 유지하는가](../how-dotdotgod-maintains-document-toc/README.md)
- [Docs-first 프로젝트 메모리에서 벡터 검색의 역할](../docs-first-project-memory/README.md)
- [닷닷갓 query는 자연어 질문에서 관련 문서를 어떻게 찾는가](../how-query-finds-related-docs/README.md)
- [Load 프로젝트 스펙](../../spec/LOAD_PROJECT.md)
