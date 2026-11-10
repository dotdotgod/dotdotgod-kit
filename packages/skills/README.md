# @dotdotgod/skills

dotdotgod의 독립형 에이전트 스킬 패키지다. 역할 기반 플래닝과 독립 문서 정리 스킬을 제공한다. `document-clarify`는 기존 5개 어댑터에서 이 패키지로 이전한다. [전환 안내](MIGRATION.md)를 확인한다.

## 제공 스킬과 검토 진입점

- [document-clarify](skills/document-clarify/SKILL.md): 의미·요구사항·추적성을 보존하는 문서 정리 지침. 플래닝과 별도로 설치한다.

- [ddg-planning 스킬](skills/ddg-planning/SKILL.md): 역할 배정, 설계·리뷰, 사용자 확정, 태스크 작성 지침.
- [역할 목록](skills/ddg-planning/roles/README.md): 17개 역할의 책임과 공통 규칙. 역할은 자동 등록되는 에이전트 설정이 아니라 위임 시 전달할 지침이다.

현재 스킬은 계획 작성 절차를 안내한다. 이 패키지에는 역할별 모델 자동 선택·전환, 설정 자동 로딩, 에이전트 자동 실행 기능이 구현되어 있지 않다. 실제 모델 지정과 역할 위임은 실행 환경의 도구·권한에 따른다. 구현 세션도 자동으로 시작하지 않는다. 자세한 제안과 제약은 [모델 설정 초안](skills/ddg-planning/references/MODELS.md)을 참고한다.

## 설치: 플러그인 없이 Skills CLI 사용

저장소 체크아웃의 루트에서 원하는 에이전트 하나를 선택한다. 아래 명령은 Skills CLI 1.7.6으로 검증한 프로젝트 범위 복사 설치다. Node.js 22.23.2에서 확인했다.

```bash
# Codex
npx skills@1.7.6 add ./packages/skills --skill ddg-planning --agent codex --copy
# Claude Code
npx skills@1.7.6 add ./packages/skills --skill ddg-planning --agent claude-code --copy
# Pi
npx skills@1.7.6 add ./packages/skills --skill ddg-planning --agent pi --copy
# Hermes Agent
npx skills@1.7.6 add ./packages/skills --skill ddg-planning --agent hermes-agent --copy
# OpenCode
npx skills@1.7.6 add ./packages/skills --skill ddg-planning --agent opencode --copy
```

다른 프로젝트에 설치하려면 해당 프로젝트에서 `./packages/skills` 대신 체크아웃의 절대 경로를 사용한다. 여러 대상을 한 번에 선택할 수도 있다.

```bash
npx skills@1.7.6 add /absolute/path/to/dotdotgod-kit/packages/skills \
  --skill ddg-planning --agent codex claude-code pi hermes-agent opencode --copy
```

문서 정리만 설치하려면 위 명령의 `--skill ddg-planning`을 `--skill document-clarify`로 바꾼다. 두 스킬이 필요하면 `--skill ddg-planning document-clarify`로 명시한다.

기본값은 현재 프로젝트에 설치하며 `--global`을 추가하면 사용자 범위다. 전역 설치는 모든 프로젝트에 영향을 주므로 적용 범위와 기존 파일을 확인한다. 이번 검증은 프로젝트 복사 설치만 대상으로 했으며, 전역 설치와 기본 symlink 방식은 미검증이다.

CLI 1.7.6의 다중 대상 복사 설치에서는 Codex·Pi·OpenCode가 `.agents/skills/ddg-planning`을 공유하고 Claude Code는 `.claude/skills/ddg-planning`, Hermes는 `.hermes/skills/ddg-planning`에도 설치된다. 설치 결과의 실제 경로를 확인한다. `SKILL.md`뿐 아니라 `references/`와 `roles/` 전체가 필요하다.

### 로딩과 유지 관리

- 설치 후 호스트를 다시 시작하거나 지원하는 reload 기능을 사용한다. Pi에서는 `/reload` 후 `/skill:ddg-planning`으로 명시적 로딩할 수 있다.
- 다른 호스트는 해당 버전의 스킬 목록·명시적 로딩 기능으로 확인한다. Hermes 프로젝트 스킬은 신뢰 설정의 영향을 받을 수 있다. 정상적인 호스트 신뢰 절차를 따르고 이를 우회하지 않는다.
- `npx skills@1.7.6 list --json`은 설치 파일을 보여줄 뿐, 호스트가 실제 로딩했다는 증거는 아니다. 다섯 대상의 자산 설치는 확인했지만 네이티브 발견·로딩은 아직 미검증이다.
- 로컬 소스 갱신은 같은 설치 명령을 다시 실행한다. 기존 설치를 덮어쓸 수 있으므로 로컬 수정은 먼저 보존한다.
- 제거는 같은 프로젝트에서 `npx skills@1.7.6 remove ddg-planning`을 사용한다. 전역 설치 제거는 `--global`을 추가한다. 대상 필터를 붙인 제거는 공유 `.agents/skills` 복사본을 남길 수 있으므로 결과를 확인한다. 공유 설치 제거는 다른 에이전트에도 영향을 준다.
- 원격 소스에 설치 가능한 버전이 공개되기 전에는 로컬 체크아웃을 사용한다. 원격 설치·`skills update`는 아직 검증하지 않았다. `npm install @dotdotgod/skills`만으로 호스트에 등록되지는 않는다.
- 이 스킬을 어댑터나 다른 경로에서도 설치했다면 중복 발견되지 않도록 한 경로만 유지한다. 역할 문서는 자동 등록되는 서브에이전트가 아니다.

상세 절차와 호스트별 미검증 항목은 [설치 스모크 기록](../../docs/test/SKILL_INSTALLATION.md)을 참고한다. 이 링크는 소스 체크아웃용이며 npm 패키지에는 저장소 `docs/`가 포함되지 않는다.

## 디렉터리 구성

각 스킬은 `skills/<skill-name>/SKILL.md`에 두고, 관련 자료는 같은 스킬 디렉터리에 둔다. 전체 목록은 [스킬 목록](skills/README.md)에서 확인한다.

## 패키지 구성 미리 확인하기

저장소 루트에서 다음 명령을 실행한다.

```bash
pnpm --filter @dotdotgod/skills run pack:dry-run
```

런타임 의존성과 빌드 단계는 필요하지 않다.
