# 역할별 모델 설정 초안

## 모델 설정 제안

실행 도구가 제공하는 모델 목록을 확인하고 요청 모델·실제 모델·추론 강도 지원·사용 불가 항목을 배정표에 기록한다. 강도는 지원할 때만 지정한다. 모든 단계에서 요청 모델을 사용할 수 없으면 추가 확인 없이 설정된 기본 모델로 전환한다. 기본 모델이 없거나 사용할 수 없으면 실행 환경의 기본 모델을 사용한다. 요청 모델·실제 모델과 전환 이유를 기록하고 알린다. 실행 환경의 기본 모델도 사용할 수 없으면 해당 위임을 차단하고 독립 작업은 계속한다.

역할 정의에 특정 모델을 고정하지 않고, 사용자 설정으로 역할별 모델을 지정하는 방식을 제안한다. 아래 JSON은 제안한 설정 형식의 예시이며 기존 도구의 내장 설정이 아니다. 설정 파일의 이름과 탐색 위치는 아직 정하지 않았고, 자동 설정 로더도 제공하지 않는다.

```json
{
  "defaultModel": "provider/model-a",
  "roleModels": {
    "user-requirements": "provider/model-b",
    "data-requirements": "provider/model-a",
    "validation-requirements": "provider/model-b",
    "design-conductor": "provider/model-b",
    "ux-designer": "provider/model-a",
    "presentation-layer-designer": "provider/model-a",
    "data-network-layer-designer": "provider/model-b",
    "test-designer": "provider/model-a",
    "ux-reviewer": "provider/model-b",
    "presentation-layer-reviewer": "provider/model-b",
    "data-network-layer-reviewer": "provider/model-b",
    "test-reviewer": "provider/model-b",
    "review-conductor": "provider/model-b",

    "security-reviewer": "provider/model-b",
    "task-planner": "provider/model-b",
    "completion-reporter": "provider/model-b",
    "implementer": "provider/model-a"
  }
}
```

제안하는 모델 선택 우선순위는 다음과 같다.

1. 이번 호출에서 명시적으로 지정한 모델
2. 역할별 설정의 모델
3. 기본 모델

기본 모델이 지정되지 않았다면 실행 환경의 기본 모델을 사용하고 이를 명시한다. 실제 모델 선택은 실행 도구가 지원할 때만 가능하다. Markdown 변수나 `model:` 필드를 적는 것만으로 모델 변경이 보장되지는 않는다.

설정 파일 경로는 사용자에게 받는다. 사용자가 지정하지 않은 파일을 임의로 탐색하거나, 이 제안을 도구의 내장 설정으로 안내하지 않는다.
