# rs-power

RS Team 사내 커스텀용 Claude Code 스킬 하네스. [obra/superpowers](https://github.com/obra/superpowers)
v6.4.1 을 fork 해서 Claude Code 에 필요한 스킬만 남겼다.

## 설치

```
/plugin marketplace add rstful/rs-power
/plugin install rs-power@rs-power
```

upstream `superpowers` 플러그인과 스킬 이름이 겹치므로 함께 켜 두지 않는다.

## 스킬

**테스트·디버깅**
- **test-driven-development** — RED-GREEN-REFACTOR 사이클
- **systematic-debugging** — 4단계 근본 원인 분석
- **verification-before-completion** — 완료 선언 전 검증

**협업 흐름**
- **brainstorming** — 설계 정제 (선택: 브라우저 visual companion)
- **writing-plans** — 구현 계획 작성
- **executing-plans** — 한 컨텍스트에서 계획 실행
- **subagent-driven-development** — 태스크별 서브에이전트 실행 + 리뷰
- **dispatching-parallel-agents** — 병렬 서브에이전트
- **requesting-code-review** / **receiving-code-review** — 코드 리뷰 요청·반영
- **using-git-worktrees** / **finishing-a-development-branch** — 워크트리, 머지/PR 마무리

**메타**
- **writing-skills** — 스킬 작성법
- **using-rs-power** — 스킬 사용 규칙

산출물 경로: 스펙 `docs/rs-power/specs/`, 계획 `docs/rs-power/plans/`, 작업 공간 `.rs-power/`.

## upstream 과의 차이

- SessionStart 훅 제거 — `using-rs-power` 가 세션 시작 때 자동 주입되지 않는다.
- Claude Code 외 하네스 어댑터(Codex, Cursor, Gemini, OpenCode, Pi, Hermes, Kimi, Muse, Devin,
  Antigravity)와 관련 스크립트·테스트 제거.
- `diagnosing-superpowers` 스킬(upstream 이슈 제보용) 제거.
- brainstorming visual companion 의 원격 로고(primeradiant.com) 로딩 제거 — 외부 요청 없음.
- 스킬 네임스페이스 `superpowers:` → `rs-power:`.

## upstream 동기화

```
git fetch upstream
git merge upstream/main   # 이름 치환 때문에 충돌이 나면 rs-power 쪽 명칭으로 해소
```

## 테스트

```
cd tests/brainstorm-server && npm install && npm test
bash tests/claude-code/test-sdd-workspace.sh
```

## License

MIT — upstream 저작권 표시는 [LICENSE](LICENSE) 에 그대로 둔다.
