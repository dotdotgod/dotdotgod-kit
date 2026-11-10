# 스킬 목록

독립 스킬과 관련 자료다.

- [document-clarify](document-clarify/SKILL.md): 의미·요구사항·추적성을 보존하는 문서 정리. 기존 어댑터 제공본에서 독립 배포로 이전한다. 스킬 검토는 `SKILL.md`에서 시작하고, 역할별 책임은 역할 목록에서 확인한다.

- [ddg-planning](ddg-planning/SKILL.md): 요구사항 구체화, 역할별 설계·리뷰, 사용자 확정, 페이즈·태스크 작성 절차를 안내하는 한국어 초안.
  - [역할 정의](ddg-planning/roles/README.md): 17개 역할의 책임과 공통 규칙.
  - [역할 공통 규칙](ddg-planning/references/COMMON.md): 역할 배정·결과 수집·결정 기록 지침.
  - [리뷰 기준](ddg-planning/references/REVIEW.md): AI slop과 불필요한 방어적 설계 검토.
  - [모델 설정](ddg-planning/references/MODELS.md): 역할별 모델 지정 제안과 실행 제약.
  - [문서 양식](ddg-planning/references/TEMPLATES.md): 계획서와 실행 태스크 양식.

역할 정의는 위임 시 전달할 지침이며 자동 등록되는 에이전트 설정이 아니다. 역할별 모델 자동 선택·전환, 설정 자동 로딩, 에이전트 자동 실행 기능은 구현되어 있지 않다. 실제 모델 지정과 역할 위임은 실행 환경의 도구·권한에 따르며, 구현 세션은 자동으로 시작하지 않는다.
