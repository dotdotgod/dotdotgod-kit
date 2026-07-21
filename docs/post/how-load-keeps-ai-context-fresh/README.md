# AI에게 모든 문서를 읽히지 않고 최신 프로젝트 컨텍스트를 유지하는 방법

닷닷갓의 Load는 저장소 전체를 AI에게 주입하지 않는다. 현재 파일과 인덱스의 일관성을 확인하고, 역할과 우선순위가 있는 제한된 프로젝트 지도를 만든 뒤, AI가 README 목차를 따라 현재 작업에 필요한 문서만 읽게 한다. 좋은 컨텍스트는 많은 정보를 한 번에 넣는 것이 아니라 **최신성, 범위와 탐색 순서**를 함께 관리할 때 만들어진다.

프로젝트가 커질수록 모든 문서를 매번 읽히는 방식은 불안정해진다. 현재 스펙과 오래된 계획이 섞이고, 중요한 제약이 관련 없는 정보에 묻히며, 컨텍스트가 커져도 정확성이 높아진다고 보장할 수 없다.

```text
현재 문서
  → 최신 인덱스
  → 범위가 제한된 스냅샷
  → README 기반 탐색
  → 작업 컨텍스트
```

Load는 문서를 복사하는 기능이 아니다. 현재 저장소에서 필요한 문서까지 탐색 경로를 만드는 컨텍스트 선별 과정이다.

## 현재 파일과 인덱스의 일관성을 먼저 확인한다

Load는 현재 메모리 대상 파일의 지문을 저장된 인덱스의 SHA-256 값과 비교한다. 이를 통해 추가·수정·삭제된 파일과 호환되지 않는 캐시 스키마를 찾는다.

```js
const indexed = new Map(index.files.map((file) => [file.path, file.sha256]));
const currentMap = new Map(currentFiles.map((file) => [file.path, file.sha256]));
const stale = currentFiles.filter((file) => indexed.get(file.path) !== file.sha256);
const removed = [...indexed.keys()].filter((path) => !currentMap.has(path));
```

인덱스가 최신이면 기존 캐시를 사용한다. 캐시가 없거나 오래되었거나 스키마가 맞지 않으면 원본 파일에서 인덱스를 다시 만든 뒤 스냅샷을 생성한다.

```text
상태 확인
  ├─ 최신 → 기존 인덱스 사용
  └─ 없음 / 오래됨 / 스키마 불일치
       → 파생 인덱스 갱신
       → 스냅샷 생성
```

`load-snapshot`은 프로젝트의 소스, 문서와 설정을 수정하지 않는다. 다만 원본에서 다시 만들 수 있는 `.dotdotgod/` 파생 인덱스는 필요할 때 갱신할 수 있다.

Load가 문서 내용 자체의 진실성을 판정하는 것은 아니다. 원본 내용의 사실 정확성은 작성과 리뷰가 담당하고, `dotdotgod validate`는 문서 구조, 설정과 추적성 같은 기계 검증 규칙을 확인한다. Load는 AI에게 제공하는 검색 지도가 현재 파일 상태와 어긋나지 않도록 한다.

## 전체 본문 대신 제한된 프로젝트 지도를 만든다

다음 명령은 최신 인덱스에서 탐색용 스냅샷을 만든다.

```bash
dotdotgod load-snapshot . --json
```

스냅샷은 전체 그래프와 모든 문서 본문을 담지 않는다. 주요 커뮤니티, 메모리 영역별 대표 파일, 생략된 항목 수, 그래프 크기와 아카이브 포함 범위만 제한적으로 제공한다.

```js
const bounds = {
  fullGraphIncluded: false,
  archiveBodiesIncluded: status.archiveBodiesIncluded,
  archiveMapIncluded: true
};
```

정보를 없애는 것이 아니다. 어떤 정보가 어디에 있는지 먼저 알려주고, 본문은 현재 요청이 필요로 할 때만 읽게 한다. 전체 그래프를 넣지 않았다는 사실과 생략된 항목 수도 스냅샷에 남아 AI가 지도의 경계를 알 수 있게 한다.

## 파일 경로에 메모리 역할을 부여한다

스냅샷은 파일 목록만 보여주지 않는다. `memory.areas` 설정을 사용해 파일을 제품 스펙, 아키텍처 근거, 테스트 지식, 활성 계획과 역사 목차 같은 역할로 분류한다.

각 영역에는 `scope`, `freshness`, `priority`와 `includeBodiesByDefault`가 포함된다. 이 값은 공유 지식과 로컬 작업 기억을 구분하고 현재 정보를 역사적 정보보다 먼저 보여준다. `includeBodiesByDefault`는 해당 영역의 파일을 기본 인덱스와 Load 대상에 넣을지 정한다. 그렇다고 스냅샷이 문서 본문 전체를 프롬프트에 삽입하는 것은 아니다. 파일 경로 자체가 AI의 해석과 읽기 순서를 안내하는 메타데이터로 쓰인다.

프로젝트는 `dotdotgod config init .`으로 기본 정책을 `dotdotgod.config.json`에 기록한 뒤 메모리 영역을 추가하거나 기본 영역의 경로, 역할과 우선순위를 바꾸고 필요 없는 영역을 제거할 수 있다. 설정은 실제 문서를 생성하거나 삭제하지 않고, 존재하는 문서를 프로젝트 메모리에서 어떻게 분류할지 정한다.

## README 목차를 선택적 읽기 전략으로 바꾼다

Pi의 `/dd:load`와 `/dd:load:compact`는 CLI 스냅샷을 프롬프트에 그대로 쏟아 넣지 않는다. 캐시 상태와 메모리 지도를 읽기 전략으로 바꾼다.

에이전트는 스냅샷을 첫 번째 프로젝트 지도로 사용하고, 이미 파악한 배경 문서는 다시 읽지 않는다. 문서 탐색은 `docs/README.md`와 각 영역의 README에서 시작하며, 요청과 관련된 하위 목차만 확장한다. 계획은 목록에서 관련 작업을 선택하고, 아카이브는 역사 목차에서 필요한 기록만 연다.

```text
AGENTS.md
  → docs/README.md
  → 관련 영역의 README.md
  → 관련 도메인의 README.md
  → 필요한 문서와 절
```

| 모드 | 적합한 상황 | 제공하는 범위 |
|---|---|---|
| Full | 프로젝트를 처음 여는 세션 | 프로젝트 개요, 규칙, 명령, 문서 지도와 활성 계획 |
| Compact | 배경을 아는 후속 작업과 자동 갱신 | 최신성 변화, 관련 영역, 활성 계획과 다음 읽기 |

Full 모드는 책의 전체 지도를 펼치고, Compact 모드는 바뀐 목차와 다음에 읽을 장에 집중한다.

## 목차 노출과 메모리 분류를 별도로 관리한다

`load.documentationSummary.exclude`는 Load가 책처럼 보여주는 문서 목차에서 특정 디렉터리를 제외한다. 이 프로젝트에서는 활성 계획, 포스트와 아카이브를 기본 문서 요약에서 숨긴다.

```json
{
  "load": {
    "documentationSummary": {
      "exclude": ["docs/plan", "docs/post", "docs/archive"]
    }
  }
}
```

이 설정은 `memory.areas`와 독립적이다. 목차에서 제외한 `docs/post/`도 그래프 인덱스와 검색에는 남길 수 있다. `docs/archive/README.md`는 과거 기록의 목차로 사용하지만, 오래된 아카이브 본문은 기본 스냅샷에 넣지 않는다. 목차 노출, 검색 가능성, 본문 포함 여부를 분리해 불필요한 컨텍스트를 줄인다.

CLI가 없거나 유효한 JSON을 반환하지 못해도 Load는 실패한 채 끝나지 않는다. 기본 메모리 파일과 `docs/` 아래의 README를 제한적으로 수집해 원본 목차를 따라갈 수 있는 대체 지도를 만든다.

> 원본 문서가 프로젝트의 진실이고, 캐시와 그래프는 그 문서에 더 빨리 도달하게 하는 색인이다.

## 최신 컨텍스트는 하나의 기능이 아니라 파이프라인이다

Load는 항상 옳은 문서를 자동으로 만들어 주지 않는다. 원본 문서가 정확해야 Load의 지도도 유용하다. 최신성 확인은 리뷰를 대신하지 않으며, 범위를 제한한 스냅샷도 필요한 사실을 자동으로 골랐다고 보장하지 않는다. 우선순위와 README 기반 탐색은 다음에 읽을 문서를 정하는 단서일 뿐이다.

> 좋은 AI 컨텍스트는 최신 원본을 확인하고, 전달 범위를 제한하고, 필요한 정보까지의 경로를 제공할 때 만들어진다.

## 함께 읽기

- [AI 에이전트의 메모리는 문서 목차에서 시작된다](../document-directory-as-table-of-contents/README.md)
- [닷닷갓 킷은 문서 목차를 어떻게 유지하는가](../how-dotdotgod-maintains-document-toc/README.md)
- [변경 파일에서 함께 확인할 문서를 찾는 방법](../how-graph-impact-finds-related-docs/README.md)
- [Load Project 스펙](../../spec/LOAD_PROJECT.md)
- [메모리 영역 설정](../../spec/MEMORY_AREA_CONFIG.md)
- [캐시와 인덱스 아키텍처](../../arch/validation/CACHE_AND_INDEX.md)
