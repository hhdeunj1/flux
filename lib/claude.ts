import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Task } from './supabase';

const CLAUDE_KEY = 'hchat_auth_token';
const PROXY_HOST_KEY = 'proxy_host';
const DEFAULT_CLAUDE_KEY = 'f4e84398888e51591c2264d54c1c7024aa2638472f2e695a46f2dcd7240be19e';

// Mac mDNS 호스트명 — IP 변경 무관하게 같은 WiFi에서 항상 연결됨
const MAC_LOCAL_HOST = 'eunj1-MacBook-Pro.local';

// Expo 개발서버 IP 자동 감지 (fallback용)
function detectHost(): string {
  const hostUri: string =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest?.debuggerHost ??
    '';
  return hostUri.split(':')[0] || '';
}

export const getClaudeKey  = async () => (await AsyncStorage.getItem(CLAUDE_KEY)) || DEFAULT_CLAUDE_KEY;
export const saveClaudeKey = (k: string) => AsyncStorage.setItem(CLAUDE_KEY, k.trim());

// 저장된 IP → Expo 감지 IP → Mac .local 호스트명 순으로 시도
export const getProxyHost  = async () => (await AsyncStorage.getItem(PROXY_HOST_KEY)) || detectHost() || MAC_LOCAL_HOST;
export const saveProxyHost = (h: string) => AsyncStorage.setItem(PROXY_HOST_KEY, h.trim());

function buildPrompt(task: Partial<Task>, repo: string): string {
  const typeLabel: Record<string, string> = {
    feature:   'Feature (새 기능 추가)',
    task:      'Task (기존 기능 개선/작업)',
    milestone: 'Milestone (마일스톤 단위 묶음)',
    research:  'Research (리서치/조사)',
  };
  const tl = typeLabel[task.type ?? ''] ?? 'Task';

  const productLabel: Record<string, string> = {
    '라이더앱':   'Shucle 라이더앱 (DRT·택시 호출, 사용자용)',
    '택시기사앱': 'Shucle 택시기사용 앱 (모바일)',
    '드라이버앱': 'Shucle DRT 기사용 앱 (태블릿 중심)',
  };
  const product = productLabel[task.product ?? ''] ?? task.product ?? 'Shucle 앱';

  const prompt = `당신은 한국어로 GitHub 이슈를 작성하는 UX기획 전문가입니다.
제품: ${product}
아래 태스크 정보를 기반으로 GitHub 이슈를 JSON 형식으로 작성해주세요.

## 태스크 정보
- 제목: ${task.title}
- 타입: ${tl}
- 노트: ${task.note || '없음'}
- 프로덕트: ${task.product || '미지정'}
- 마일스톤: ${task.milestone || '미지정'}
- 사업단위: ${task.business || '미지정'}
- 레포: ${repo}

## 이슈 작성 규칙

### 제목
- 반드시 [자동생성🤖] 로 시작할 것

### 진입 경로
- 앱 화면 기준으로 작성 (예: 온보딩 > 개인/법인 선택 > 회원정보 입력)

### 연관 화면 / 연관 MD
- 실제 Figma 프레임 URL이나 MD 앵커 링크를 알 수 없으면 해당 줄 전체를 생략할 것
- 절대 추측하거나 placeholder URL을 넣지 말 것

### AS-IS / TO-BE
- 각 섹션 첫 줄: 핵심 변경 단어를 **볼드** 처리한 한 줄 요약 문장 (AS-IS와 TO-BE가 대응되게)
  - 예) AS-IS: "개인 심사 등록 항목에 나이 **없음**"
  - 예) TO-BE: "개인 심사 등록 항목에 나이 **추가**"
- AS-IS 상세: 현재 상태를 구체적으로 작성하고 출처 MD를 아래 형식으로 첨부
  - > [참고] [MD파일명 > 섹션 경로](앵커 링크)
- TO-BE 상세: 기존 항목 전체를 일반 텍스트로 나열하고, 변경 항목 뒤에 레이블 표기
  - 변경 항목 예: 나이 \`추가\`, 이름 \`변경\`, 주소 \`삭제\`
  - 버튼 동작 등 하위 불렛은 **새로 추가된 항목에만** 작성 (기존 항목은 단순 나열)

### AI Comments
- 중요도 높은 순(필수 > 권장 > 참고)으로 정렬
- 레이블은 반드시 백틱(코드 스타일)으로 표기
  - \`필수\`: 미정의 시 개발 불가 또는 버그 확실
  - \`권장\`: 엣지케이스 발생 가능
  - \`참고\`: 추후 이슈화 고려
- 연관 MD는 섹션 앵커 직링크로 표기

### 구조화
- 케이스가 복잡하거나 화면/항목 간 매핑이 필요하면 처음부터 테이블로 작성

## 이슈 형식 (본문, 이 형식을 정확히 따를 것)

## 배경
(이 태스크가 생긴 배경과 필요성)

## 개요
(변경 내용 한 줄 요약 — blockquote 없이 일반 텍스트로)

> [진입 경로] (앱 화면 기준 경로)
(연관 화면 URL을 알 수 있으면: > [연관 화면] [프레임명](Figma URL) — 모르면 이 줄 생략)
(연관 MD 앵커를 알 수 있으면: > [연관 MD] [MD파일명 > 섹션 경로](앵커 URL) — 모르면 이 줄 생략)

## Spec [Figma>](프레임 생성 시 자동 연결)

### AS-IS
(핵심 변경 단어 **볼드** 처리한 한 줄 요약)

> [참고] [MD파일명 > 섹션 경로](앵커링크)

(현재 상태 상세. 신규면 "해당 없음 (신규)")

### TO-BE
(핵심 변경 단어 **볼드** 처리한 한 줄 요약)

(기존 항목 전체 나열, 변경 항목 뒤에 \`추가\`/\`변경\`/\`삭제\` 레이블)

---

<details>
<summary>🤖 AI Comments</summary>

- \`필수\`: ...
- \`권장\`: ...
- \`참고\`: ...
</details>

---
JSON만 응답하세요 (다른 텍스트 없이):
{"title": "...", "body": "..."}`;

  return prompt;
}

export async function generateIssue(
  apiKey: string,
  task: Partial<Task>,
  repo: string,
): Promise<{ title: string; body: string }> {
  const host = await getProxyHost();
  const res = await fetch(`http://${host}:3001`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(task, repo) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`);
  const data = await res.json();

  // Anthropic format: content[0].text  /  OpenAI-compat: choices[0].message.content
  const text: string =
    data?.content?.[0]?.text ??
    data?.choices?.[0]?.message?.content ??
    '';

  if (!text) {
    const reason = data?.stop_reason ?? data?.error?.message ?? JSON.stringify(data).slice(0, 120);
    throw new Error(`이슈 생성 응답이 비어있어요 (${reason})`);
  }

  const trimmed = text.trim();
  let jsonStr: string | null = null;

  // 1. 응답이 { 로 시작하면 바로 JSON
  if (trimmed.startsWith('{')) {
    jsonStr = trimmed;
  }
  // 2. ```json 코드블록 안에 있는 경우
  if (!jsonStr) {
    const codeMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeMatch) jsonStr = codeMatch[1];
  }
  // 3. 텍스트 어딘가에 { } 가 있는 경우 (최후 수단)
  if (!jsonStr) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) jsonStr = match[0];
  }

  if (!jsonStr) throw new Error('이슈 내용을 파싱할 수 없어요');

  try {
    return JSON.parse(jsonStr) as { title: string; body: string };
  } catch {
    throw new Error('이슈 JSON 파싱 실패 — Claude가 올바른 JSON을 반환하지 않았어요');
  }
}
