import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../lib/constants';
import { Task } from '../lib/supabase';
import { PRODUCT_REPO_MAP, fetchIssuesByMilestone, GitHubIssueDetail } from '../lib/github';

const BROWSER_PRODUCTS = ['라이더앱', '택시기사앱', '드라이버앱', '키오스크', '서비스UX'];
const REPO_SHORT: Record<string, string> = {
  'hkmc-airlab/shucle-rider': '라이더앱',
  'hkmc-airlab/shucle-taxidriver-product': '택시기사앱',
  'hkmc-airlab/shucle-DriverVehicle-product': '드라이버앱',
  'hkmc-airlab/shucle-kiosk-product': '키오스크',
  'hkmc-airlab/shucle-ux': '서비스UX',
  'hhdeunj1/2026': '기준',
};

type FolderIssue = { title: string; product: string; repo: string; issueNum: number };

type Props = {
  C: ThemeColors;
  milestones: string[];
  defaultMilestone?: string | null;
  tasks: Task[];
  myUsername?: string;
  onLinkIssue: (taskId: string, repo: string, num: number) => Promise<void>;
  onCreateTask: (title: string, product: string, milestone: string, repo: string, issueNum: number) => Promise<void>;
  onCreateFolder: (folderTitle: string, issues: FolderIssue[], milestone: string) => Promise<void>;
  onClose: () => void;
};

type IssueGroup = { repo: string; product: string; issues: GitHubIssueDetail[] };

function issueKey(repo: string, num: number) { return `${repo}:${num}`; }

export function IssueBrowser({ C, milestones, defaultMilestone, tasks, myUsername, onLinkIssue, onCreateTask, onCreateFolder, onClose }: Props) {
  const [selMilestone, setSelMilestone] = useState(defaultMilestone ?? milestones[0] ?? '');
  const [selProducts, setSelProducts] = useState<string[]>(BROWSER_PRODUCTS);
  const [groups, setGroups] = useState<IssueGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 단일 이슈 연결 모달
  const [linkingIssue, setLinkingIssue] = useState<GitHubIssueDetail | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // 다중 선택
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // 폴더 묶기
  const [folderMode, setFolderMode] = useState(false);
  const [folderName, setFolderName] = useState('');

  const toggleProduct = (p: string) =>
    setSelProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const toggleSelect = (issue: GitHubIssueDetail) => {
    const k = issueKey(issue.repo, issue.number);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const fetchIssues = useCallback(async () => {
    if (!selMilestone || selProducts.length === 0) return;
    setLoading(true);
    setFetched(false);
    setFetchError(null);
    setSelected(new Set());
    const repos = selProducts.map((p) => PRODUCT_REPO_MAP[p]).filter(Boolean);
    try {
      const results = await Promise.all(
        repos.map(async (repo) => {
          const issues = await fetchIssuesByMilestone(repo, selMilestone);
          // 내 이슈 먼저 정렬
          const sorted = [...issues].sort((a, b) => {
            const aMe = myUsername ? a.assignees.includes(myUsername) : false;
            const bMe = myUsername ? b.assignees.includes(myUsername) : false;
            if (aMe !== bMe) return aMe ? -1 : 1;
            const aAssigned = a.assignees.length > 0;
            const bAssigned = b.assignees.length > 0;
            if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
            return 0;
          });
          return { repo, product: REPO_SHORT[repo] ?? repo, issues: sorted };
        })
      );
      setGroups(results.filter((g) => g.issues.length > 0));
      setFetched(true);
    } catch (e: any) {
      setFetchError(e?.message ?? 'GitHub API 오류');
    } finally {
      setLoading(false);
    }
  }, [selMilestone, selProducts, myUsername]);

  const totalCount = groups.reduce((s, g) => s + g.issues.length, 0);
  const allIssues = groups.flatMap((g) => g.issues);

  const filteredTasks = tasks.filter((t) =>
    !taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const handleLinkToTask = async (task: Task) => {
    if (!linkingIssue) return;
    setLinkLoading(true);
    try {
      await onLinkIssue(task.id, linkingIssue.repo, linkingIssue.number);
      setLinkingIssue(null);
      setTaskSearch('');
    } catch {
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCreateSingle = async (issue: GitHubIssueDetail) => {
    setLinkLoading(true);
    try {
      const product = REPO_SHORT[issue.repo] ?? '기타';
      await onCreateTask(issue.title, product, selMilestone, issue.repo, issue.number);
      setLinkingIssue(null);
      setTaskSearch('');
    } catch {
    } finally {
      setLinkLoading(false);
    }
  };

  const enterFolderMode = () => {
    const targets = allIssues.filter((i) => selected.has(issueKey(i.repo, i.number)));
    const products = [...new Set(targets.map((i) => REPO_SHORT[i.repo] ?? i.repo))];
    const defaultName = products.length === 1
      ? `${products[0]} ${selMilestone} 기획`
      : `${selMilestone} 기획`;
    setFolderName(defaultName);
    setFolderMode(true);
  };

  const handleBulkCreateFolder = async () => {
    const targets = allIssues.filter((i) => selected.has(issueKey(i.repo, i.number)));
    if (targets.length === 0 || !folderName.trim()) return;
    setBulkProgress({ done: 0, total: targets.length });
    const issues: FolderIssue[] = targets.map((i) => ({
      title: i.title,
      product: REPO_SHORT[i.repo] ?? '기타',
      repo: i.repo,
      issueNum: i.number,
    }));
    try {
      await onCreateFolder(folderName.trim(), issues, selMilestone);
    } catch {}
    setBulkProgress(null);
    setSelected(new Set());
    setFolderMode(false);
    setFolderName('');
  };

  const handleBulkCreate = async () => {
    const targets = allIssues.filter((i) => selected.has(issueKey(i.repo, i.number)));
    if (targets.length === 0) return;
    setBulkProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const issue = targets[i];
      const product = REPO_SHORT[issue.repo] ?? '기타';
      try {
        await onCreateTask(issue.title, product, selMilestone, issue.repo, issue.number);
      } catch {}
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    setSelected(new Set());
    setBulkProgress(null);
  };

  const s = styles(C);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>GitHub 이슈 브라우저</Text>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Ionicons name="close" size={20} color={C.text3} />
        </TouchableOpacity>
      </View>

      {/* Milestone */}
      <View style={s.section}>
        <Text style={s.label}>마일스톤</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {milestones.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setSelMilestone(m)}
                style={[s.chip, selMilestone === m && s.chipActive]}
              >
                <Text style={[s.chipText, selMilestone === m && s.chipTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Product */}
      <View style={s.section}>
        <Text style={s.label}>프로덕트</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {BROWSER_PRODUCTS.map((p) => {
            const on = selProducts.includes(p);
            return (
              <TouchableOpacity key={p} onPress={() => toggleProduct(p)} style={[s.chip, on && s.chipActive]}>
                <Text style={[s.chipText, on && s.chipTextActive]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Fetch */}
      <TouchableOpacity
        style={[s.fetchBtn, (loading || !selMilestone) && { opacity: 0.5 }]}
        onPress={fetchIssues}
        disabled={loading || !selMilestone}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.fetchBtnText}>불러오기</Text>
        }
      </TouchableOpacity>

      {/* Results */}
      <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ paddingBottom: selected.size > 0 ? 80 : 16 }}>
        {fetchError && (
          <Text style={{ color: '#FF3B30', textAlign: 'center', marginTop: 24, fontSize: 13 }}>{fetchError}</Text>
        )}
        {!fetchError && fetched && totalCount === 0 && (
          <Text style={{ color: C.text3, textAlign: 'center', marginTop: 24, fontSize: 13 }}>
            {selMilestone} 마일스톤 이슈가 없습니다
          </Text>
        )}

        {groups.map((g) => (
          <View key={g.repo} style={{ marginBottom: 16 }}>
            {/* Group header */}
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>{g.product}</Text>
              <Text style={s.groupCount}>{g.issues.length}개</Text>
              {myUsername && (() => {
                const myCount = g.issues.filter((i) => i.assignees.includes(myUsername)).length;
                if (!myCount) return null;
                return <Text style={s.myCount}>내 이슈 {myCount}개</Text>;
              })()}
            </View>

            {/* Issues */}
            {g.issues.map((issue) => {
              const k = issueKey(issue.repo, issue.number);
              const isSelected = selected.has(k);
              const isMe = !!myUsername && issue.assignees.includes(myUsername);
              const isUnassigned = issue.assignees.length === 0;

              return (
                <TouchableOpacity
                  key={issue.number}
                  activeOpacity={0.7}
                  onPress={() => toggleSelect(issue)}
                  style={[s.issueRow, isSelected && s.issueRowSelected, isMe && s.issueRowMine]}
                >
                  {/* Checkbox */}
                  <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>

                  {/* Content */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <Text style={s.issueNum}>#{issue.number}</Text>
                      {isMe && <View style={s.meBadge}><Text style={s.meBadgeText}>나</Text></View>}
                    </View>
                    <Text style={[s.issueTitle, isMe && { fontWeight: '600' }]} numberOfLines={2}>{issue.title}</Text>

                    {/* Assignees */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {isUnassigned ? (
                        <View style={s.assigneeChip}>
                          <Ionicons name="person-outline" size={10} color="#FF9500" />
                          <Text style={[s.assigneeChipText, { color: '#FF9500' }]}>미배정</Text>
                        </View>
                      ) : (
                        issue.assignees.map((a) => {
                          const isMyName = myUsername && a === myUsername;
                          return (
                            <View key={a} style={[s.assigneeChip, isMyName && s.assigneeChipMe]}>
                              <Ionicons name="person-circle" size={11} color={isMyName ? '#0A84FF' : C.text3} />
                              <Text style={[s.assigneeChipText, isMyName && { color: '#0A84FF', fontWeight: '600' }]}>
                                {isMyName ? `${a} (나)` : a}
                              </Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>

                  {/* 연결 버튼 (기존 태스크에 연결) */}
                  <TouchableOpacity
                    style={s.linkBtn}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setLinkingIssue(issue);
                      setTaskSearch('');
                    }}
                  >
                    <Text style={s.linkBtnText}>연결</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* 다중 선택 하단 바 */}
      {selected.size > 0 && (
        <View style={s.bulkBar}>
          {folderMode ? (
            // 폴더 모드: 이름 입력 + 생성
            <>
              <TextInput
                style={[s.folderNameInput, { backgroundColor: C.input, color: C.text, borderColor: '#0A84FF88' }]}
                value={folderName}
                onChangeText={setFolderName}
                placeholder="폴더명 입력..."
                placeholderTextColor={C.text3}
                autoFocus
              />
              <TouchableOpacity
                style={s.bulkClearBtn}
                onPress={() => setFolderMode(false)}
                disabled={!!bulkProgress}
              >
                <Text style={{ fontSize: 13, color: C.text3 }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.bulkFolderBtn, (!folderName.trim() || !!bulkProgress) && { opacity: 0.5 }]}
                onPress={handleBulkCreateFolder}
                disabled={!folderName.trim() || !!bulkProgress}
              >
                {bulkProgress
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.bulkCreateBtnText}>폴더 생성</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            // 기본 모드: 선택 개수 + 두 버튼
            <>
              <View style={{ flex: 1 }}>
                {bulkProgress ? (
                  <Text style={s.bulkBarText}>생성 중 {bulkProgress.done}/{bulkProgress.total}...</Text>
                ) : (
                  <Text style={s.bulkBarText}>{selected.size}개 선택됨</Text>
                )}
              </View>
              <TouchableOpacity
                style={s.bulkClearBtn}
                onPress={() => setSelected(new Set())}
                disabled={!!bulkProgress}
              >
                <Text style={{ fontSize: 13, color: C.text3 }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.bulkFolderBtn, !!bulkProgress && { opacity: 0.5 }]}
                onPress={enterFolderMode}
                disabled={!!bulkProgress}
              >
                <Text style={s.bulkCreateBtnText}>📁 폴더로 묶기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.bulkCreateBtn, !!bulkProgress && { opacity: 0.5 }]}
                onPress={handleBulkCreate}
                disabled={!!bulkProgress}
              >
                {bulkProgress
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.bulkCreateBtnText}>개별 생성</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* 단일 이슈 연결 모달 */}
      <Modal visible={!!linkingIssue} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={[s.picker, { backgroundColor: C.card }]}>
            <Text style={[s.pickerTitle, { color: C.text }]} numberOfLines={2}>
              #{linkingIssue?.number} {linkingIssue?.title}
            </Text>
            {linkingIssue && linkingIssue.assignees.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {linkingIssue.assignees.map((a) => {
                  const isMyName = myUsername && a === myUsername;
                  return (
                    <View key={a} style={[s.assigneeChip, isMyName && s.assigneeChipMe]}>
                      <Ionicons name="person-circle" size={11} color={isMyName ? '#0A84FF' : C.text3} />
                      <Text style={[s.assigneeChipText, isMyName && { color: '#0A84FF', fontWeight: '600' }]}>
                        {isMyName ? `${a} (나)` : a}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <Text style={[s.pickerSub, { color: C.text3 }]}>어느 태스크에 연결할까요?</Text>

            <TextInput
              style={[s.search, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
              placeholder="태스크 검색..."
              placeholderTextColor={C.text3}
              value={taskSearch}
              onChangeText={setTaskSearch}
              autoFocus
            />

            {filteredTasks.length > 50 && (
              <Text style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>
                {filteredTasks.length}개 중 50개 표시 — 검색어로 필터하세요
              </Text>
            )}
            <FlatList
              data={filteredTasks.slice(0, 50)}
              keyExtractor={(t) => t.id}
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.taskItem}
                  onPress={() => handleLinkToTask(item)}
                  disabled={linkLoading}
                >
                  <Text style={[s.taskItemTitle, { color: C.text }]} numberOfLines={1}>{item.title}</Text>
                  {item.milestone && (
                    <Text style={[s.taskItemMeta, { color: C.text3 }]}>{item.milestone}</Text>
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />}
            />

            <View style={s.pickerActions}>
              {linkingIssue && (
                <TouchableOpacity
                  style={[s.createBtn, { borderColor: C.border }]}
                  onPress={() => linkingIssue && handleCreateSingle(linkingIssue)}
                  disabled={linkLoading}
                >
                  <Text style={[s.createBtnText, { color: C.text2 }]}>+ 새 태스크로 생성</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setLinkingIssue(null); setTaskSearch(''); }}
              >
                <Text style={s.cancelBtnText}>취소</Text>
              </TouchableOpacity>
            </View>

            {linkLoading && (
              <View style={s.loadingOverlay}>
                <ActivityIndicator color="#0A84FF" />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.text },
  closeBtn: { padding: 4 },
  section: { marginBottom: 12 },
  label: { fontSize: 12, color: C.text3, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.bg3,
  },
  chipActive: { backgroundColor: '#0A84FF22', borderColor: '#0A84FF88' },
  chipText: { fontSize: 12, color: C.text3 },
  chipTextActive: { color: '#0A84FF' },
  fetchBtn: {
    backgroundColor: '#0A84FF', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  fetchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  groupTitle: { fontSize: 13, fontWeight: '600', color: C.text2 },
  groupCount: { fontSize: 11, color: C.text3 },
  myCount: { fontSize: 11, color: '#30D158', fontWeight: '600' },
  issueRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    backgroundColor: C.bg2, borderRadius: 8, marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent',
  },
  issueRowSelected: {
    backgroundColor: '#0A84FF12',
    borderColor: '#0A84FF55',
  },
  issueRowMine: {
    borderLeftWidth: 3, borderLeftColor: '#0A84FF',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.border2,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: '#0A84FF', borderColor: '#0A84FF',
  },
  issueNum: { fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] },
  meBadge: {
    backgroundColor: '#0A84FF22', paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: '#0A84FF55',
  },
  meBadgeText: { fontSize: 10, color: '#0A84FF', fontWeight: '700' },
  issueTitle: { fontSize: 13, color: C.text, lineHeight: 18 },
  assigneeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: C.bg3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  assigneeChipMe: {
    backgroundColor: '#0A84FF12', borderColor: '#0A84FF44',
  },
  assigneeChipText: { fontSize: 11, color: C.text3 },
  linkBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: C.bg3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    alignSelf: 'flex-start',
  },
  linkBtnText: { fontSize: 12, color: C.text2, fontWeight: '500' },
  // Bulk bar
  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  bulkBarText: { fontSize: 14, color: C.text, fontWeight: '600' },
  bulkClearBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  bulkCreateBtn: {
    backgroundColor: '#0A84FF', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  bulkFolderBtn: {
    backgroundColor: '#5E5CE6', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  bulkCreateBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  folderNameInput: {
    flex: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 13, borderWidth: 1.5, marginRight: 4,
  },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  picker: { borderRadius: 12, padding: 16, maxHeight: 520 },
  pickerTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  pickerSub: { fontSize: 12, marginBottom: 10 },
  search: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  taskItem: { paddingVertical: 10, paddingHorizontal: 4 },
  taskItemTitle: { fontSize: 13 },
  taskItemMeta: { fontSize: 11, marginTop: 1 },
  pickerActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  createBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 7,
    alignItems: 'center', borderWidth: StyleSheet.hairlineWidth,
  },
  createBtnText: { fontSize: 13 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 7, backgroundColor: '#FF3B3022' },
  cancelBtnText: { fontSize: 13, color: '#FF3B30' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center', alignItems: 'center', borderRadius: 12,
  },
});
