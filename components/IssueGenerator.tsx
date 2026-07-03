import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { PINNED_REPOS, createIssue, issueUrl, getToken, fetchAllMDFiles } from '../lib/github';
import { getClaudeKey, generateIssue } from '../lib/claude';
import { ThemeColors, TASK_TYPES, REPO_META } from '../lib/constants';
import { TaskType } from '../lib/supabase';
import { styles, markdownStyles } from '../lib/styles';
import { AutoInput, IssueSection, IssueLinkField, AICommentsList } from './IssuePreviewPanel';

// ─── 타입 ──────────────────────────────────────────────────
type Preview = { title: string; body: string };
type EditState = {
  title: string; type: TaskType;
  bg: string; overview: string; entryPath: string;
  screenLabel: string; screenUrl: string; mdLabel: string; mdUrl: string;
  spec: string; specHeading: string; todo: string; ai: string;
};

// ─── 파서 (IssuePreviewPanel과 동일 로직) ──────────────────
function parseOverview(raw: string) {
  const entryM  = raw.match(/>\s*\[진입[^\]]*\]\s*(.+)/);
  const screenM = raw.match(/>\s*\[연관\s*화면\]\s*(?:\[([^\]]+)\]\(([^)]+)\)|(.+))/);
  const mdM     = raw.match(/>\s*\[연관\s*MD\]\s*(?:\[([^\]]+)\]\(([^)]+)\)|(.+))/);
  const text    = raw.split('\n').filter(l => !l.trimStart().startsWith('>')).join('\n').trim();
  return {
    text,
    entryPath:   entryM  ? entryM[1].trim()                 : '',
    screenLabel: screenM ? (screenM[1] || screenM[3] || '') : '',
    screenUrl:   screenM ? (screenM[2] || '')               : '',
    mdLabel:     mdM     ? (mdM[1] || mdM[3] || '')         : '',
    mdUrl:       mdM     ? (mdM[2] || '')                   : '',
  };
}

function parseBody(body: string, type?: TaskType): Omit<EditState, 'title' | 'type'> {
  const detailsMatch = body.match(/<details>[\s\S]*?<\/details>/);
  const aiBlock      = detailsMatch ? detailsMatch[0] : '';
  const bodyNoAI     = body.replace(aiBlock, '').trim();
  const aiCM  = aiBlock.match(/<summary>[^\n]*<\/summary>([\s\S]*?)<\/details>/);
  const extract = (label: string) => {
    const re = new RegExp(`## ${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`);
    const m = bodyNoAI.match(re);
    return m ? m[1].trim() : '';
  };
  if (type === 'task') {
    return {
      bg: extract('배경'), overview: '', entryPath: '', screenLabel: '', screenUrl: '',
      mdLabel: '', mdUrl: '', specHeading: '## Spec', spec: '',
      todo: extract('TO-DO'),
      ai: aiCM ? aiCM[1].trim() : '',
    };
  }
  const specHeadingMatch = bodyNoAI.match(/^## Spec[^\n]*/m);
  const specHeading = specHeadingMatch ? specHeadingMatch[0] : '## Spec';
  const specM = bodyNoAI.match(/## Spec[^\n]*\n([\s\S]*?)(?=\n---|$)/);
  const ov    = parseOverview(extract('개요'));
  return {
    bg: extract('배경'), overview: ov.text,
    entryPath: ov.entryPath, screenLabel: ov.screenLabel, screenUrl: ov.screenUrl,
    mdLabel: ov.mdLabel, mdUrl: ov.mdUrl,
    specHeading, spec: specM ? specM[1].trim() : '',
    todo: '',
    ai: aiCM ? aiCM[1].trim() : '',
  };
}

function assembleBody(e: EditState): string {
  const parts: string[] = [];
  if (e.type === 'task') {
    if (e.bg)   parts.push(`## 배경\n${e.bg}`);
    if (e.todo) parts.push(`## TO-DO\n${e.todo}`);
    if (e.ai)   parts.push(`---\n\n<details>\n<summary>🤖 AI Comments</summary>\n${e.ai}\n</details>`);
  } else {
    const meta: string[] = [];
    if (e.entryPath)   meta.push(`> [진입 경로] ${e.entryPath}`);
    if (e.screenLabel || e.screenUrl) meta.push(e.screenUrl ? `> [연관 화면] [${e.screenLabel}](${e.screenUrl})` : `> [연관 화면] ${e.screenLabel}`);
    if (e.mdLabel || e.mdUrl) meta.push(e.mdUrl ? `> [연관 MD] [${e.mdLabel}](${e.mdUrl})` : `> [연관 MD] ${e.mdLabel}`);
    if (e.bg)       parts.push(`## 배경\n${e.bg}`);
    const ov = [e.overview, ...meta].filter(Boolean).join('\n');
    if (ov)         parts.push(`## 개요\n${ov}`);
    if (e.spec)     parts.push(`${e.specHeading}\n${e.spec}`);
    if (e.ai)       parts.push(`---\n\n<details>\n<summary>🤖 AI Comments</summary>\n${e.ai}\n</details>`);
  }
  return parts.join('\n\n');
}

function SectionLabel({ label, C }: { label: string; C: ThemeColors }) {
  return <Text style={{ fontSize: 11, fontWeight: '600', color: C.text3, marginBottom: 6, letterSpacing: 0.3 }}>{label}</Text>;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────
export function IssueGenerator({ C, onClose }: { C: ThemeColors; onClose: () => void }) {
  // 입력 폼
  const [repo,  setRepo]  = useState(PINNED_REPOS[0]);
  const [type,  setType]  = useState<TaskType>('feature');
  const [title, setTitle] = useState('');
  const [note,  setNote]  = useState('');

  // MD 캐시 (레포 선택 시 미리 로드)
  const [mdCache, setMdCache] = useState<{ path: string; content: string }[]>([]);
  const [mdLoading, setMdLoading] = useState(false);
  const mdRepoRef = useRef('');

  useEffect(() => {
    if (mdRepoRef.current === repo) return;
    mdRepoRef.current = repo;
    setMdCache([]);
    setMdLoading(true);
    fetchAllMDFiles(repo)
      .then(files => { setMdCache(files); setMdLoading(false); })
      .catch(() => setMdLoading(false));
  }, [repo]);

  // 생성 상태
  const [status,  setStatus]  = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [genMsg,  setGenMsg]  = useState('');
  const [errMsg,  setErrMsg]  = useState('');

  // 편집 상태 (생성 결과)
  const [edit,    setEdit]    = useState<EditState | null>(null);
  const [tab,     setTab]     = useState<'edit' | 'preview'>('edit');
  const [aiOpen,  setAiOpen]  = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postedUrl, setPostedUrl] = useState<string | null>(null);

  const fullBody = useMemo(() => edit ? assembleBody(edit) : '', [edit]);

  const canGenerate = title.trim().length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setStatus('generating');
    setPostedUrl(null);
    try {
      const [apiKey, mdFiles] = await Promise.all([
        getClaudeKey(),
        mdCache.length > 0 ? Promise.resolve(mdCache) : fetchAllMDFiles(repo),
      ]);
      const totalChars = mdFiles.reduce((s, f) => s + f.content.length, 0);
      setGenMsg(`MD ${mdFiles.length}개 (${Math.round(totalChars / 1000)}K자) → 이슈 생성 중...`);
      const result = await generateIssue(apiKey, { title, type, note }, repo, mdFiles);
      const parsed = parseBody(result.body, type);
      setEdit({ title: result.title, type, ...parsed });
      setTab('edit');
      setStatus('done');
    } catch (e: any) {
      setErrMsg(e?.message ?? '생성 실패');
      setStatus('error');
    }
  };

  const handlePost = async (bodyOverride?: string | null) => {
    if (!edit) return;
    setIsPosting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('GitHub 토큰이 없어요');
      const num = await createIssue(repo, edit.title, bodyOverride === null ? '' : (bodyOverride ?? fullBody));
      const url = issueUrl(repo, num);
      setPostedUrl(url);
      Linking.openURL(url).catch(() => {});
    } catch (e: any) {
      setErrMsg(e?.message ?? '업로드 실패');
    } finally {
      setIsPosting(false);
    }
  };

  const upd = (key: keyof EditState) => (val: string) =>
    setEdit(prev => prev ? { ...prev, [key]: val } : prev);

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg, zIndex: 100 }]}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.bg2 }]}>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Ionicons name="close" size={20} color={C.text3} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>이슈 생성기</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ── 바디 (좌: 폼 / 우: 결과) ── */}
      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* ────────── 왼쪽: 입력 폼 ────────── */}
        <View style={[s.formPanel, { borderRightColor: C.border }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 10, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 레포 */}
          <View>
            <SectionLabel label="레포" C={C} />
            <View style={{ gap: 5 }}>
              {PINNED_REPOS.map(r => {
                const meta = REPO_META[r];
                const isActive = repo === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRepo(r)}
                    style={[s.repoRow, { borderColor: isActive ? '#007AFF' : C.border, backgroundColor: isActive ? 'rgba(0,122,255,0.08)' : C.bg3 }]}
                  >
                    <Ionicons name="git-branch-outline" size={12} color={isActive ? '#007AFF' : C.text3} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: isActive ? '#007AFF' : C.text }} numberOfLines={1}>
                        {meta?.short ?? r.split('/')[1]}
                      </Text>
                      <Text style={{ fontSize: 9, color: isActive ? 'rgba(0,122,255,0.7)' : C.text3 }} numberOfLines={1}>{r}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark" size={12} color="#007AFF" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 타입 */}
          <View>
            <SectionLabel label="타입" C={C} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {TASK_TYPES.filter(t => ['feature', 'task', 'research', 'milestone'].includes(t.value)).map(t => (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setType(t.value)}
                  style={[s.typeChip, { borderColor: type === t.value ? t.color : C.border, backgroundColor: type === t.value ? `${t.color}22` : C.bg3 }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '500', color: type === t.value ? t.color : C.text3 }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 제목 */}
          <View>
            <SectionLabel label="제목" C={C} />
            <TextInput
              style={[s.input, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
              value={title} onChangeText={setTitle}
              placeholder="이슈 제목 (기획 태스크명)" placeholderTextColor={C.text4}
            />
          </View>

          {/* 노트 */}
          <View>
            <SectionLabel label="노트 (컨텍스트)" C={C} />
            <TextInput
              style={[s.input, s.noteInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
              value={note} onChangeText={setNote}
              placeholder={'AS-IS / TO-BE, 배경, 주의사항 등\n자유롭게 적어두세요'}
              placeholderTextColor={C.text4}
              multiline textAlignVertical="top"
            />
          </View>

          {/* 생성 버튼 */}
          <TouchableOpacity
            onPress={handleGenerate}
            disabled={!canGenerate || status === 'generating'}
            style={[s.genBtn, (!canGenerate || status === 'generating') && { opacity: 0.4 }]}
          >
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={s.genBtnText}>이슈 생성</Text>
          </TouchableOpacity>
        </ScrollView>
        </View>

        {/* ────────── 오른쪽: 결과 ────────── */}
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {status === 'idle' && (
            <View style={s.emptyState}>
              <Ionicons name="document-text-outline" size={40} color={C.text4} />
              <Text style={[s.emptyText, { color: C.text3 }]}>왼쪽에서 정보를 입력하고</Text>
              <Text style={[s.emptyText, { color: C.text3 }]}>이슈 생성 버튼을 눌러주세요</Text>
            </View>
          )}

          {status === 'generating' && (
            <View style={s.emptyState}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={[s.emptyText, { color: C.text3, marginTop: 12 }]}>{genMsg || '이슈 초안 생성 중...'}</Text>
            </View>
          )}

          {status === 'error' && (
            <View style={s.emptyState}>
              <Ionicons name="alert-circle-outline" size={36} color="#FF3B30" />
              <Text style={[s.emptyText, { color: '#FF3B30', marginTop: 8 }]}>{errMsg}</Text>
              <TouchableOpacity onPress={handleGenerate} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,59,48,0.12)', borderRadius: 8 }}>
                <Text style={{ color: '#FF3B30', fontSize: 13 }}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === 'done' && edit && (
            <View style={{ flex: 1 }}>
              {/* 결과 헤더 */}
              <View style={[s.resultHeader, { borderBottomColor: C.border, backgroundColor: C.bg2 }]}>
                <View style={[s.tabRow, { backgroundColor: C.bg3 }]}>
                  {(['edit', 'preview'] as const).map(t => (
                    <TouchableOpacity key={t} onPress={() => setTab(t)}
                      style={[s.tab, tab === t && [s.tabActive, { backgroundColor: C.bg }]]}>
                      <Text style={[s.tabText, { color: C.text3 }, tab === t && { color: C.text, fontWeight: '600' }]}>
                        {t === 'edit' ? '편집' : '미리보기'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {postedUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(postedUrl).catch(() => {})} style={s.postedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#30D158" />
                    <Text style={{ color: '#30D158', fontSize: 12, fontWeight: '500' }}>업로드 완료</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 제목 */}
              <TextInput
                style={[s.titleInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                value={edit.title} onChangeText={upd('title')}
                placeholder="이슈 제목" placeholderTextColor={C.text4}
              />

              {tab === 'edit' ? (
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  {/* 편집: 왼쪽 본문 */}
                  <ScrollView style={{ flex: edit.type === 'task' ? 1 : 3 }}
                    contentContainerStyle={{ padding: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <IssueSection label="배경" C={C}>
                      <AutoInput style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                        value={edit.bg} onChangeText={upd('bg')} placeholderTextColor={C.text3} placeholder="배경 내용" />
                    </IssueSection>
                    {edit.type === 'task' ? (
                      <IssueSection label="TO-DO" C={C}>
                        <AutoInput minH={200} style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                          value={edit.todo} onChangeText={upd('todo')} placeholderTextColor={C.text3} placeholder="- 작업 항목 1&#10;- 작업 항목 2" />
                      </IssueSection>
                    ) : (
                      <>
                        <IssueSection label="개요" C={C}>
                          <AutoInput style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                            value={edit.overview} onChangeText={upd('overview')} placeholderTextColor={C.text3} placeholder="한 줄 요약" />
                        </IssueSection>
                        <IssueSection label="Spec" C={C}>
                          <AutoInput minH={200} style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                            value={edit.spec} onChangeText={upd('spec')} placeholderTextColor={C.text3} placeholder="AS-IS / TO-BE" />
                        </IssueSection>
                      </>
                    )}
                    <View style={[styles.issueSectionBlock, { borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg3, overflow: 'hidden' }]}>
                      <TouchableOpacity onPress={() => setAiOpen(o => !o)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 }}>
                        <Text style={[styles.issueSectionLabel, { color: C.labelColor, flex: 1, marginBottom: 0 }]}>🤖 AI Comments</Text>
                        <Ionicons name={aiOpen ? 'chevron-up' : 'chevron-down'} size={13} color={C.text3} />
                      </TouchableOpacity>
                      {aiOpen && (
                        <View style={{ paddingHorizontal: 10, paddingBottom: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                          <AICommentsList content={edit.ai} C={C} />
                        </View>
                      )}
                    </View>
                  </ScrollView>

                  {/* 편집: 오른쪽 메타 (task 타입이면 숨김, 값이 모두 비어있으면 숨김) */}
                  {edit.type !== 'task' && (edit.entryPath || edit.screenLabel || edit.screenUrl || edit.mdLabel || edit.mdUrl) && (
                    <ScrollView style={{ flex: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border }} contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
                      showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      {!!edit.entryPath && (
                        <IssueSection label="진입 경로" C={C}>
                          <AutoInput style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                            value={edit.entryPath} onChangeText={upd('entryPath')} placeholderTextColor={C.text3} placeholder="온보딩 > ..." />
                        </IssueSection>
                      )}
                      {(edit.screenLabel || edit.screenUrl) && (
                        <IssueLinkField sectionLabel="연관 화면" nameValue={edit.screenLabel} onNameChange={upd('screenLabel')}
                          namePlaceholder="프레임명" urlValue={edit.screenUrl} C={C} />
                      )}
                      {(edit.mdLabel || edit.mdUrl) && (
                        <IssueLinkField sectionLabel="연관 MD" nameValue={edit.mdLabel} onNameChange={upd('mdLabel')}
                          namePlaceholder="MD파일명 > 섹션" urlValue={edit.mdUrl} C={C} />
                      )}
                    </ScrollView>
                  )}
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                  <Markdown style={markdownStyles}>{fullBody.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')}</Markdown>
                </ScrollView>
              )}

              {/* 하단 버튼 */}
              <View style={[s.postRow, { borderTopColor: C.border }]}>
                <TouchableOpacity onPress={() => handlePost(null)} disabled={isPosting}
                  style={[s.postBtnGhost, { borderColor: C.border2 }, isPosting && { opacity: 0.4 }]}>
                  <Text style={[s.postBtnGhostText, { color: C.text3 }]}>제목만 업로드</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handlePost()} disabled={isPosting}
                  style={[s.postBtnFill, isPosting && { opacity: 0.4 }]}>
                  <Text style={s.postBtnFillText}>{isPosting ? '업로드 중...' : '업로드'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── 스타일 ────────────────────────────────────────────────
const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  closeBtn:     { padding: 4, width: 32 },
  formPanel:    { width: 400, borderRightWidth: StyleSheet.hairlineWidth },
  repoRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, borderWidth: 1 },
  typeChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  input:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  noteInput:    { minHeight: 120, textAlignVertical: 'top' },
  genBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 12 },
  genBtnText:   { color: '#fff', fontSize: 14, fontWeight: '600' },
  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText:    { fontSize: 13 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabRow:       { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 0 },
  tab:          { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 6 },
  tabActive:    { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  tabText:      { fontSize: 13 },
  titleInput:   { marginHorizontal: 12, marginVertical: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  postedBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postRow:      { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth },
  postBtnGhost: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  postBtnGhostText: { fontSize: 13, fontWeight: '500' },
  postBtnFill:  { flex: 2, backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  postBtnFillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
