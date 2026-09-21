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

## 컨텍스트 가드

플러그인 훅이 프롬프트 제출과 도구 호출마다 transcript 의 마지막 usage 로 현재 컨텍스트 크기를 잰다.

- **400k 이상** — 프롬프트를 낼 때 경고한다 (사용자와 모델 모두에게).
- **600k 이상** — 프롬프트와 도구 호출을 막는다. `/compact` 나 `/clear` 로 시작하는 프롬프트만 통과한다.
- `node` 가 PATH 에 있어야 한다.
- 한계: transcript 를 읽지 못하거나 형식이 바뀌면 가드는 조용히 통과한다 (fail-open). 턴 중간에는 400k 경고가
  없고 600k 차단만 있다.

## 단계별 모델

- 설계·계획·디버깅·인라인 실행은 Opus 5, 구현·태스크 리뷰·재리뷰는 Sonnet 5 서브에이전트
  (`rs-power:implementer`, `rs-power:reviewer`, `rs-power:re-reviewer`), 최종 리뷰는 Opus 5
  (`rs-power:final-reviewer`), 마무리는 Haiku 4.5.
- 스킬 frontmatter 의 모델은 그 스킬을 부른 턴에만 적용된다. brainstorming·systematic-debugging 처럼 여러 턴
  가는 단계는 세션 모델이 다르면 `/model`·`/effort` 전환을 한 줄로 권한다.
- 정확한 effort 값, 승급 규칙, Fable 을 쓰는 두 지점: [model-policy.md](skills/using-rs-power/references/model-policy.md)

**Codex 교차 검토 (선택)** — `codex` CLI 가 설치돼 있으면 계획 완성 후 1회(GPT-6-Astra medium), 최종 리뷰
1회(high) 교차 검토한다. 없으면 건너뛴다.

## upstream 과의 차이

- SessionStart 훅 제거 — `using-rs-power` 가 세션 시작 때 자동 주입되지 않는다.
- Claude Code 외 하네스 어댑터(Codex, Cursor, Gemini, OpenCode, Pi, Hermes, Kimi, Muse, Devin,
  Antigravity)와 관련 스크립트·테스트 제거.
- `diagnosing-superpowers` 스킬(upstream 이슈 제보용) 제거.
- brainstorming visual companion 의 원격 로고(primeradiant.com) 로딩 제거 — 외부 요청 없음.
- 스킬 네임스페이스 `superpowers:` → `rs-power:`.
- 컨텍스트 가드 훅(UserPromptSubmit·PreToolUse) 추가.
- 단계별 모델·effort 지정: 스킬 frontmatter 와 플러그인 에이전트 4개(`agents/`). 디스패치 템플릿은
  `general-purpose` 대신 `rs-power:` 에이전트를 쓴다.

## upstream 동기화

```
git fetch upstream
git merge upstream/main   # 이름 치환 때문에 충돌이 나면 rs-power 쪽 명칭으로 해소
```

## 테스트

```
cd tests/brainstorm-server && npm install && npm test
bash tests/claude-code/test-sdd-workspace.sh
node tests/context-guard/context-guard.test.js
bash tests/claude-code/test-model-policy.sh
```

## License

MIT — upstream 저작권 표시는 [LICENSE](LICENSE) 에 그대로 둔다.
