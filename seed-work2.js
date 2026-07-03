// Flux work2 시드 데이터 — 브라우저 콘솔(localhost:8081)에서 실행
(async () => {
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtyc3RiaW1iZGp6eGdubHprdGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTAxNTcsImV4cCI6MjA4OTAyNjE1N30.Ue0wHCh68FTNm6UBXA4pGDmNOD8bDu2PF4BMSBw2KRA';
  const BASE = 'https://krstbimbdjzxgnlzktjm.supabase.co/rest/v1/tasks';
  const H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'return=representation' };

  async function ins(title, status, parentId, milestone, dueDate) {
    const r = await fetch(BASE, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        title, status, type: 'task', mode: 'work2', product: '라이더앱',
        milestone, parent_id: parentId || null, due_date: dueDate || null, checklist: []
      })
    });
    const d = await r.json();
    if (!d[0]?.id) { console.error('❌ 실패:', title, d); return null; }
    console.log('✅', title.slice(0, 40));
    return d[0].id;
  }

  // ── 라이더앱 v4.11 ──────────────────────────────
  const g1 = await ins('bts f.u.', 'todo', null, 'v4.11', null);

  const t1 = await ins("[D2D] 이용현황 > '기사님' 노출 구현 (택시도)", 'done', g1, 'v4.11', null);
  await ins('택시 포함 클라에서 구현 예정 > 로컬라이즈 키 추가', 'done', t1, 'v4.11', null);

  const t2 = await ins('[D2D] 가호출 > 도착예정시각 도보 시간 포함 여부 확인', 'done', g1, 'v4.11', null);
  await ins('기존 기획 유지 전달 - 도보 시간 미포함 (택시의 멘탈 모달을 따름)', 'done', t2, 'v4.11', null);

  const t3 = await ins('[D2D] 탑승권 > 탑승일자 규격 확인', 'done', g1, 'v4.11', null);
  await ins('기존 형상 유지 > md 현행화', 'done', t3, 'v4.11', null);

  const t4 = await ins('[D2D] 지도 > 경로 endpoint 노출 여부 및 최소 줌배율 확인 @태원님', 'done', g1, 'v4.11', null);
  await ins('경로 endpoint 미노출 > md 현행화', 'done', t4, 'v4.11', null);

  const t5 = await ins('[D2D] 지도 > 직전 stoppoint 출발 여부에 따른 분기 항목 확인', 'todo', g1, 'v4.11', null);
  await ins('탑승 방향 아이콘 = 차량방면마커로 확인 > md 현행화', 'done', t5, 'v4.11', null);

  const g2 = await ins('Amplitude 검수', 'todo', null, 'v4.11', null);
  const t6 = await ins('[iOS] 업데이트 항목 검수(Key, property)', 'done', g2, 'v4.11', null);
  await ins('(d2d/택시) 연락 받을 번호 관련 값 추가 확인 필요', 'todo', t6, 'v4.11', null);
  const t7 = await ins('[AOS] 업데이트 항목 검수(Key, property)', 'todo', g2, 'v4.11', null);
  await ins('AOS 단말 확인 및 앱 다운로드', 'todo', t7, 'v4.11', null);

  const g3 = await ins('실내 스펙 공유', 'todo', null, 'v4.11', null);
  await ins('[D2D] 공유 내용 정리', 'todo', g3, 'v4.11', null);
  await ins('[이응패스] 공유 내용 정리', 'todo', g3, 'v4.11', null);

  // ── 라이더앱 v4.12 ──────────────────────────────
  const g4 = await ins('인터뷰 결과 공유 (feat. 개선의견 검증)', 'todo', null, 'v4.12', null);
  await ins('네트워크 오류 볼륨 확인 - @경은님께 공유', 'todo', g4, 'v4.12', '2026-06-08');
  const t8 = await ins('경로 관련 언급 확인 및 전달 (w/ 엔진, 맵)', 'done', g4, 'v4.12', '2026-06-05');
  const s1 = await ins('개선의견 내 경로 관련 언급 필터링 및 문서화', 'done', t8, 'v4.12', null);
  await ins('좌석, 정류장 배정 관련 언급 전달 및 논의 (w/ 엔진)', 'done', s1, 'v4.12', '2026-06-05');
  await ins('ETA 관련 언급 확인', 'done', s1, 'v4.12', null);

  const g5 = await ins('상세 기획 및 논의', 'todo', null, 'v4.12', null);

  const t9 = await ins('[D2D] 카카오라우팅 유고 옵션 논의 (w/엔진, 맵, 서버)', 'todo', g5, 'v4.12', null);
  const s2 = await ins('사전 준비', 'done', t9, 'v4.12', null);
  await ins('일정 어레인지', 'done', s2, 'v4.12', '2026-06-08');
  await ins('논의 전 경은님 과외 필요', 'done', s2, 'v4.12', '2026-06-04');
  await ins('유저 시나리오 정리 (화면별로 한판 정리 필요) 및 싱크업', 'done', s2, 'v4.12', '2026-06-08');

  const s3 = await ins('논의 진행 (w/엔진, 맵, 서버)', 'done', t9, 'v4.12', '2026-06-08');
  await ins('회의록 작성 및 로깅', 'done', s3, 'v4.12', '2026-06-08');
  await ins('동작구 일 예상 호출 건수 및 주요 POI 요청(@우석님, 대표님)', 'done', s3, 'v4.12', '2026-06-09');
  await ins('주요 POI 간 이동 시나리오 작성 및 전달', 'todo', s3, 'v4.12', null);
  await ins('카카오/셔클 라우팅 세팅 협의 및 시나리오별 비교', 'todo', s3, 'v4.12', null);

  const t10 = await ins('[D2D] ETA 개선', 'todo', g5, 'v4.12', null);
  await ins('1. ETA 관련 언급 분류 및 방향성 검토', 'done', t10, 'v4.12', null);
  await ins('2. 가호출 > 경로 노출 검토', 'todo', t10, 'v4.12', null);

  // ── 라이더앱 v4.14 ──────────────────────────────
  const g6 = await ins('상세 기획 및 논의', 'todo', null, 'v4.14', null);
  await ins('기사님 요청 사항 입력 시점', 'todo', g6, 'v4.14', null);

  console.log('🎉 전체 완료!');
})();
