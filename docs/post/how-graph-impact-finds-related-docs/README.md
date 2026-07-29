# 변경 파일에서 함께 확인할 문서를 찾는 방법

`dotdotgod graph impact`는 변경한 파일을 출발점으로 관련 스펙, 아키텍처, 테스트, 검증 명령과 소스 파일을 찾아 우선순위가 있는 검토 목록으로 만든다. 저장소 전체를 다시 읽는 대신 **변경에서 문서로 이동하는 역방향 목차**를 제공해, 코드와 프로젝트 메모리가 서로 다른 방향으로 변하는 것을 줄인다.

문서 목차는 스펙에서 구현과 테스트로 이동할 때 유용하다. 실제 개발에서는 반대 방향도 필요하다. 설정이나 CLI 코드를 먼저 바꾼 뒤 어떤 스펙과 테스트를 함께 확인해야 하는지 알아야 하기 때문이다.

파일명 검색만으로는 이 질문에 답하기 어렵다. 코드와 문서가 같은 이름을 사용하지 않을 수 있고, 하나의 변경이 여러 패키지와 검증 경로에 연결될 수도 있다. `graph impact`는 프로젝트 그래프와 명시적인 추적 관계를 함께 사용해 탐색 범위를 좁힌다.

## 변경 파일을 그래프의 시작점으로 사용한다

하나의 파일을 변경했다면 다음 명령으로 관련 항목을 찾을 수 있다.

```bash
dotdotgod graph impact . \
  --changed packages/cli/src/commands/query.mjs \
  --yml
```

여러 파일을 함께 변경했다면 `--changed`를 반복한다.

```bash
dotdotgod graph impact . \
  --changed packages/cli/src/commands/query.mjs \
  --changed packages/cli/src/query/chunks.mjs \
  --yml
```

명령은 중복 경로를 처음 등장한 순서대로 정리하고, 최대 20개의 변경 파일을 같은 가중치의 시작점으로 사용한다. 결과에는 변경 파일이 먼저 나오며, 여러 변경 파일에 공통으로 연결된 문서는 전체 순위에서 하나로 합쳐진다.

## 명시적인 관계와 탐색 신호를 함께 사용한다

프로젝트 그래프에는 Markdown 링크, README 탐색 경로, 패키지와 리소스 관계, 메모리 영역과 구조화된 추적 정보가 들어 있다. `graph impact`는 변경 파일 주변에서 이 관계를 제한적으로 확장한다.

| 신호 | 의미 |
|---|---|
| 추적 관계 | `implemented_by`, `verified_by`, `related_doc`, 검증 명령처럼 사람이 명시한 관계 |
| 근접성 | Markdown 링크, README 경로, 패키지와 리소스 연결 |
| 탐색 단서 | 경로, 파일명, 제목, README, 메모리 영역과 패키지 메타데이터의 일치 |
| 메모리 정책 | 현재 스펙이나 테스트처럼 프로젝트에서 우선하는 영역 |
| 최신성 | 현재 메모리는 높이고 오래된 기록의 과도한 노출은 줄이는 신호 |

사람이 기록한 추적 관계는 경로나 이름으로 추론한 탐색 단서보다 신뢰도가 높다. 명시적인 연결이 부족할 때는 README와 문서 구조가 대체 탐색 경로가 된다.

## 연결 수가 아니라 검토 가치로 순위를 정한다

관련 파일을 모두 첫 화면에 보여주면 영향 분석도 또 다른 전체 검색이 된다. 기본 `balanced` 순위 정책은 변경 파일에서 시작한 Personalized PageRank와 프로젝트 정책을 결합한다.

```text
변경 파일
  → 후보 범위 제한
  → Personalized PageRank
  → 추적 관계와 정책 반영
  → 검토 목록 구성
```

점수에는 그래프 중심성뿐 아니라 추적 관계, 테스트와 검증 신호, README 거리, 탐색 단서, 메모리 우선순위, 최신성과 아카이브 감점이 반영된다. 현재 스펙과 실행 가능한 테스트를 우선하고, 오래된 아카이브 본문이 기본 결과를 차지하지 않게 한다.

프로젝트는 `dotdotgod.config.json`의 `impactRanking`에서 프리셋, 가중치, PPR과 탐색 설정을 조정할 수 있다.

```json
{
  "impactRanking": {
    "preset": "balanced",
    "routing": {
      "enabled": true,
      "topKPerFile": 5,
      "includeArchiveBodies": false
    }
  }
}
```

설정이 없으면 내장 `balanced` 정책을 사용한다. `dotdotgod validate`는 잘못된 설정을 오류로 보고하고, 실행 중인 명령은 내장 기본값을 사용한다.

## 결과는 이유가 있는 검토 목록이다

`--yml`은 에이전트가 바로 읽을 수 있는 제한된 구조를 반환한다.

```yaml
impact:
  ok: true
  changed_files:
    - packages/cli/src/commands/query.mjs
  groups:
    docs:
      items:
        - path: docs/spec/LOAD_PROJECT.md
          score: 65.4
          reasons: [implemented_by, routes_to]
    tests:
      items:
        - path: packages/cli/test/e2e.test.mjs
          score: 58.1
          reasons: [verified_by]
  recommended_actions:
    - review_related_docs
    - run_related_tests
    - run_dotdotgod_validate
```

결과는 문서, 동작 계약, 테스트, 파일, 명령과 패키지 리소스처럼 검토 목적에 맞는 그룹으로 나뉜다. 각 항목의 `score`와 `reasons`는 결과에 포함된 이유를 설명하고, 생략 항목 수는 출력 범위 밖에도 관련 항목이 있음을 알려준다.

사람이 빠르게 검토할 때는 기본 출력이나 `--compact`를 사용한다. 에이전트 작업 흐름에는 `--yml`, 순위 진단과 자동화에는 전체 정보를 담은 `--json`이 적합하다.

## 임팩트 점수는 변경 위험의 확정값이 아니다

높은 점수는 먼저 검토할 가치가 있다는 뜻이지, 해당 파일이 반드시 깨졌다는 뜻은 아니다. 반대로 결과에 없는 파일이 영향을 받지 않는다고 보장할 수도 없다. 그래프에 등록된 링크와 추적 정보가 부족하면 중요한 관계를 놓칠 수 있다.

원본 스펙, 코드와 테스트가 프로젝트의 진실이다. `graph impact`는 이를 대신하지 않고, 변경 이후 함께 읽고 갱신할 후보를 우선순위에 따라 제안한다. 결과를 검토해 관련 문서를 수정하고, 추천된 테스트와 `dotdotgod validate`를 실행해야 영향 확인이 끝난다.

```text
파일 변경
  → graph impact
  → 관련 스펙과 테스트 검토
  → 필요한 문서와 코드 갱신
  → 테스트와 문서 검증
```

이 한계를 고려해 `graph impact`의 품질은 실제 사례로 측정한다. `Precision@5/10`은 상위 결과에서 반드시 또는 가급적 검토해야 할 항목의 비율을 계산한다. `Recall@10`과 MRR은 반드시 검토해야 할 항목을 얼마나 잘 찾는지 측정하고, `nDCG@10`은 두 등급을 반영해 전체 순위의 품질을 평가한다.

## 변경 검토는 역방향 목차에서 시작한다

문서 목차가 질문에서 필요한 장으로 이동하는 정방향 지도라면, `graph impact`는 변경 파일에서 함께 확인할 장으로 이동하는 역방향 지도다. 두 방향이 연결되어야 스펙, 구현과 테스트가 변경 이후에도 같은 프로젝트 상태를 설명할 수 있다.

좋은 영향 분석은 가능한 모든 파일을 나열하지 않는다. 현재 변경과 관계가 강하고 검토 행동으로 이어질 항목을 이유와 함께 제한적으로 보여준다.

> `graph impact`의 목적은 변경 영향을 대신 판단하는 것이 아니라, 사람이 놓치기 쉬운 다음 검토 경로를 프로젝트 그래프에서 찾는 것이다.

## 함께 읽기

- [AI 에이전트의 메모리는 문서 목차에서 시작된다](../document-directory-as-table-of-contents/README.md)
- [닷닷갓 킷은 문서 목차를 어떻게 유지하는가](../how-dotdotgod-maintains-document-toc/README.md)
- [AI에게 모든 문서를 읽히지 않고 최신 프로젝트 컨텍스트를 유지하는 방법](../how-load-keeps-ai-context-fresh/README.md)
- [graph impact 명령 스펙](../../spec/cli/GRAPH_IMPACT.md)
- [임팩트 랭킹 설정](../../spec/IMPACT_RANKING_CONFIG.md)
- [임팩트 랭킹 아키텍처](../../arch/IMPACT_RANKING_CONFIG.md)
- [graph impact 품질 테스트](../../test/GRAPH_IMPACT_QUALITY.md)
