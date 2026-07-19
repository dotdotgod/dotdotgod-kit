# AI에게 모든 문서를 읽히지 않고 최신 프로젝트 컨텍스트를 유지하는 방법

앞선 글에서는 프로젝트 문서가 책과 같은 목차를 가져야 하며, 닷닷갓 킷이 그 목차를 초기화하고 검증하는 방법을 살펴봤다. 그렇다면 AI 에이전트는 이 문서 메모리를 어떻게 불러올까?

저장소의 모든 문서를 매번 읽히는 방법은 프로젝트가 커질수록 불안정해진다. 현재 스펙과 오래된 계획이 섞이고, 중요한 제약이 관련 없는 정보에 묻히며, 컨텍스트는 커져도 정확성이 높아진다고 보장할 수 없다.

닷닷갓의 `load`는 문서 전체를 AI에게 주입하지 않는다. 현재 파일과 인덱스가 일치하는지 확인하고, 역할과 우선순위가 포함된 제한된 메모리 지도를 만든 다음, AI가 README 목차에서 필요한 문서만 읽게 한다.

> Load는 문서를 복사하는 기능이 아니라 최신성, 범위, 탐색 순서를 함께 관리하는 컨텍스트 큐레이션 과정이다.

## Load가 관리하는 세 가지

1. **Freshness:** 현재 파일과 메모리 인덱스가 일치하는가?
2. **Boundedness:** AI에게 전달할 컨텍스트의 크기가 제한되어 있는가?
3. **Routing:** AI가 다음에 읽을 문서를 판단할 수 있는가?

```text
현재 문서
  ↓ 최신성 확인
Fresh index
  ↓ 범위 제한
Bounded snapshot
  ↓ 역할과 목차 제공
Routing prompt
  ↓ 선택적 읽기
Task context
```

## 1. 현재 파일과 인덱스가 같은지 확인한다

최신성 판정은 `packages/cli/src/index/cache.mjs`의 `getStatus()`에서 시작한다. 현재 메모리 대상 파일의 fingerprint를 수집하고 저장된 인덱스의 SHA-256 값과 비교한다.

```js
const indexed = new Map(index.files.map((file) => [file.path, file.sha256]));
const currentMap = new Map(currentFiles.map((file) => [file.path, file.sha256]));
const stale = currentFiles.filter((file) => indexed.get(file.path) !== file.sha256);
const removed = [...indexed.keys()].filter((path) => !currentMap.has(path));
```

이 비교로 새로 추가되거나 수정되거나 삭제된 파일을 감지한다. 캐시 스키마가 현재 CLI와 맞는지도 함께 확인한다.

```js
const schemaOk = schemaVersion === CACHE_VERSION;
const ok = staleFiles.length === 0 && schemaOk;
```

Load가 문서 내용 자체의 진실성을 판정하는 것은 아니다. 원본 문서가 올바른지는 작성과 리뷰, 문서 검증이 담당한다. Load는 **AI에게 제공하는 검색 지도가 현재 저장소의 파일 상태와 어긋나지 않도록 한다.**

## 2. 오래된 인덱스는 먼저 갱신한다

같은 파일의 `readFreshIndex()`는 상태 확인과 갱신을 하나의 경로로 묶는다.

```js
const initialStatus = getStatus(root);
if (initialStatus.ok) return { index: readIndex(root), metadata: { cacheRefreshed: false } };
const index = buildIndex(root);
writeIndex(root, index);
return { status: getStatus(root), index, metadata: { cacheRefreshed: true } };
```

```text
인덱스 상태 확인
  ├─ fresh → 기존 인덱스 사용
  └─ missing / stale / schema mismatch
       ↓ 인덱스 재생성
       ↓ 갱신된 상태로 snapshot 생성
```

`load-snapshot`은 프로젝트의 소스나 문서를 수정하지 않는다. 다만 캐시가 오래되었으면 원본에서 다시 만들 수 있는 `.dotdotgod/` 파생 인덱스를 갱신할 수 있다.

## 3. 전체 문서 대신 제한된 메모리 지도를 만든다

`packages/cli/src/commands/load-snapshot.mjs`의 `runLoadSnapshot()`은 최신 인덱스에서 탐색용 요약을 만든다.

```js
const { status, index, metadata } = readFreshIndex(options.root);
const communities = buildCommunities(index, { communities: 5, items: 5 });
const memoryAreas = buildMemoryAreas(index, { items: 4 });
```

전체 그래프와 모든 문서 본문을 포함하는 대신 상위 커뮤니티 5개, 커뮤니티별 대표 항목 5개, 메모리 영역별 대표 파일 4개와 생략된 항목 수를 제공한다.

```js
const bounds = {
  communities: 5,
  communityItems: 5,
  memoryAreaItems: 4,
  fullGraphIncluded: false,
  archiveBodiesIncluded: status.archiveBodiesIncluded,
  archiveMapIncluded: true
};
```

정보를 없애는 것이 아니다. 어떤 정보가 어디에 있는지 알려주되, 본문은 현재 작업에 필요할 때만 읽게 한다.

## 4. 파일 목록에 메모리 역할을 부여한다

`packages/cli/src/load-snapshot/summary.mjs`의 `buildMemoryAreas()`는 파일을 역할이 있는 메모리 영역으로 분류한다.

```js
{
  label, role, scope, freshness, priority,
  includeBodiesByDefault, files, count, omitted
}
```

대표적인 역할은 다음과 같다.

- `behavior-truth`: 현재 제품의 동작 계약
- `architecture-rationale`: 설계 이유와 제약
- `verification-knowledge`: 테스트와 검증 방법
- `active-task-intent`: 현재 작업 의도
- `historical-memory-map`: 과거 기록의 목차

`scope`는 공유 지식과 로컬 작업 기억을 구분한다. `freshness`는 현재 정보를 먼저 보여주고 역사적 정보는 필요할 때만 찾게 한다. `priority`는 어떤 영역을 우선 노출할지 결정한다. 파일이 놓인 경로가 AI의 해석 방식까지 안내하는 메타데이터가 되는 것이다.

## 5. 스냅샷을 AI의 읽기 전략으로 바꾼다

Pi에서 `/dd:load`를 실행하면 `packages/pi/extensions/load-project/index.ts`가 CLI 스냅샷과 기본 파일 지도를 수집한다.

```ts
const snapshot = collectSnapshot(ctx.cwd);
const loadSnapshot = runDotdotgodLoadSnapshot(ctx.cwd);
const prompt = buildLoadPrompt(
  ctx.cwd, args, snapshot, loadSnapshot, { mode }
);
pi.sendUserMessage(prompt);
```

`runDotdotgodLoadSnapshot()`은 사용 가능한 로컬 또는 설치된 CLI를 찾아 `dotdotgod load-snapshot <cwd> --json`을 실행한다. `buildLoadPrompt()`는 그 JSON을 그대로 덤프하지 않고 다음 읽기 규칙으로 변환한다.

1. Load snapshot을 첫 번째 프로젝트 지도로 사용한다.
2. 이미 분명한 배경 문서는 다시 읽지 않는다.
3. README를 책의 목차로 취급한다.
4. 요청과 관련된 문서 영역만 확장한다.
5. 계획은 목록을 먼저 보고 관련 계획만 읽는다.
6. 아카이브는 역사 목차에서 필요한 본문만 선택한다.
7. 저장소 전체를 광범위하게 스캔하지 않는다.

여기서 최신 인덱스가 실제 AI의 컨텍스트 탐색 정책으로 바뀐다.

## 6. Full과 Compact로 컨텍스트 수명을 구분한다

Pi 확장은 `/dd:load`와 `/dd:load:compact`를 제공한다.

Full mode는 처음 프로젝트를 여는 세션이나 전체 작업 지도가 필요할 때 사용한다. 프로젝트 개요, 규칙, 명령과 검증 방법, 문서 지도와 활성 계획을 비교적 자세히 구성한다.

Compact mode는 이미 배경을 알고 있는 세션의 후속 작업이나 자동 갱신에 사용한다. 안정적인 배경을 반복하지 않고 캐시 갱신 여부, 변경 파일, 관련 문서 영역, 활성 계획과 다음 읽기에 집중한다.

> Full load가 책 전체의 지도를 다시 펼치는 작업이라면, Compact load는 바뀐 목차와 다음에 읽을 장만 확인하는 작업이다.

## 7. CLI가 없어도 README 목차로 복구한다

그래프와 캐시는 탐색을 빠르게 하지만 프로젝트 메모리의 원본은 아니다. `packages/pi/extensions/load-project/snapshot.ts`는 CLI를 실행할 수 없을 때 다음 기본 파일을 확인한다.

```text
AGENTS.md, CLAUDE.md, CODEX.md, README.md
docs/README.md, docs/spec/README.md
docs/test/README.md, docs/arch/README.md
docs/plan/README.md, docs/archive/README.md
```

그리고 `docs/` 아래의 디렉터리와 README를 제한적으로 수집한다. 인덱스가 없더라도 AI는 원본 README 목차를 따라 프로젝트 메모리를 탐색할 수 있다.

> 원본 문서가 프로젝트의 진실이고, 캐시와 그래프는 그 문서에 더 빨리 도달하게 하는 색인이다.

## 최신 컨텍스트는 하나의 기능이 아니라 파이프라인이다

| 문제 | 대응 방식 |
|---|---|
| 문서 추가·수정 | fingerprint 비교 |
| 문서 삭제 | 인덱스와 현재 경로 비교 |
| 오래된 캐시 형식 | 스키마 버전 검사 |
| 오래된 인덱스 | Load 시 lazy refresh |
| 너무 많은 문서 | snapshot 상한 |
| 과거와 현재의 혼합 | archive body 기본 제외 |
| 불분명한 다음 읽기 | memory role과 README routing |
| 반복되는 배경 | Compact mode |
| CLI 실행 실패 | README 기반 fallback |

```text
현재 문서 → Fresh index → Bounded snapshot → Routing prompt → Task context
```

닷닷갓의 Load는 “항상 옳은 문서”를 자동으로 만들어 주지 않는다. 대신 현재 저장소와 인덱스의 일관성을 확인하고, 제한된 프로젝트 지도를 생성하며, AI가 지금 필요한 장만 읽도록 안내한다.

> 좋은 AI 컨텍스트는 많은 정보를 한 번에 넣어서 만들어지지 않는다. 최신 원본을 확인하고, 범위를 제한하고, 필요한 정보까지의 경로를 제공할 때 만들어진다.

## 함께 읽기

- [AI 에이전트의 메모리는 문서 목차에서 시작된다](../document-directory-as-table-of-contents/README.md)
- [닷닷갓 킷은 문서 목차를 어떻게 유지하는가](../how-dotdotgod-maintains-document-toc/README.md)
- [Load Project 동작 계약](../../spec/LOAD_PROJECT.md)
- [컨텍스트 메커니즘](../../concept/CONTEXT_MECHANICS.md)
