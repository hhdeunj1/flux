import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../lib/constants';
import { Task, TaskIssue } from '../lib/supabase';
import {
  PRODUCT_REPO_MAP, fetchIssuesByMilestone, GitHubIssueDetail,
} from '../lib/github';
import { uid } from '../lib/constants';

const BROWSER_PRODUCTS = ['라이더앱', '택시기사앱', '드라이버앱', '키오스크'];
const REPO_SHORT: Record<string, string> = {
  'hkmc-airlab/shucle-rider': '라이더앱',
  'hkmc-airlab/shucle-taxidriver-product': '택시기사앱',
  'hkmc-airlab/shucle-DriverVehicle-product': '드라이버앱',
  'hkmc-airlab/shucle-kiosk-product': '키오스크',
  'hhdeunj1/2026': '기준',
};

type Props = {
  C: ThemeColors;
  milestones: string[];
  defaultMilestone?: string | null;
  tasks: Task[];
  onLinkIssue: (taskId: string, repo: string, num: number) => Promise<void>;
  onCreateTask: (title: string, product: string, milestone: string, repo: string, issueNum: number) => Promise<void>;
  onClose: () => void;
};

type IssueGroup = { repo: string; product: string; issues: GitHubIssueDetail[] };

export function IssueBrowser({ C, milestones, defaultMilestone, tasks, onLinkIssue, onCreateTask, onClose }: Props) {
  const [selMilestone, setSelMilestone] = useState(defaultMilestone ?? milestones[0] ?? '');
  const [selProducts, setSelProducts] = useState<string[]>(BROWSER_PRODUCTS);
  const [groups, setGroups] = useState<IssueGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [linkingIssue, setLinkingIssue] = useState<GitHubIssueDetail | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  const toggleProduct = (p: string) => {
    setSelProducts((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    if (!selMilestone || selProducts.length === 0) return;
    setLoading(true);
    setFetched(false);
    setFetchError(null);
    const repos = selProducts.map((p) => PRODUCT_REPO_MAP[p]).filter(Boolean);
    try {
      const results = await Promise.all(
        repos.map(async (repo) => {
          const issues = await fetchIssuesByMilestone(repo, selMilestone);
          return { repo, product: REPO_SHORT[repo] ?? repo, issues };
        })
      );
      setGroups(results.filter((g) => g.issues.length > 0));
      setFetched(true);
    } catch (e: any) {
      setFetchError(e?.message ?? 'GitHub API 오류');
    } finally {
      setLoading(false);
    }
  }, [selMilestone, selProducts]);

  const totalCount = groups.reduce((s, g) => s + g.issues.length, 0);

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
      // silent — parent already handles errors
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCreateTask = async (issue: GitHubIssueDetail, product: string) => {
    setLinkLoading(true);
    try {
      await onCreateTask(issue.title, product, selMilestone, issue.repo, issue.number);
      setLinkingIssue(null);
      setTaskSearch('');
    } catch {
      // silent — parent already handles errors
    } finally {
      setLinkLoading(false);
    }
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

      {/* Milestone selector */}
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

      {/* Product selector */}
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

      {/* Fetch button */}
      <TouchableOpacity
        style={[s.fetchBtn, (loading || !selMilestone) && { opacity: 0.5 }]}
        onPress={fetchIssues}
        disabled={loading || !selMilestone}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.fetchBtnText}>가져오기</Text>
        }
      </TouchableOpacity>

      {/* Results */}
      <ScrollView style={{ flex: 1, marginTop: 12 }}>
        {fetchError && (
          <Text style={{ color: '#FF3B30', textAlign: 'center', marginTop: 24, fontSize: 13 }}>
            {fetchError}
          </Text>
        )}
        {!fetchError && fetched && totalCount === 0 && (
          <Text style={{ color: C.text3, textAlign: 'center', marginTop: 24, fontSize: 13 }}>
            {selMilestone} 마일스톤 이슈가 없습니다
          </Text>
        )}
        {groups.map((g) => (
          <View key={g.repo} style={{ marginBottom: 16 }}>
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>{g.product}</Text>
              <Text style={s.groupCount}>{g.issues.length}개</Text>
            </View>
            {g.issues.map((issue) => (
              <View key={issue.number} style={s.issueRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.issueNum}>#{issue.number}</Text>
                  <Text style={s.issueTitle} numberOfLines={2}>{issue.title}</Text>
                  {issue.assignees.length > 0 && (
                    <Text style={s.issueAssignees} numberOfLines={1}>
                      👤 {issue.assignees.join(', ')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={s.linkBtn}
                  onPress={() => { setLinkingIssue(issue); setTaskSearch(''); }}
                >
                  <Text style={s.linkBtnText}>연결</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Task picker modal */}
      <Modal visible={!!linkingIssue} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={[s.picker, { backgroundColor: C.card }]}>
            <Text style={[s.pickerTitle, { color: C.text }]} numberOfLines={2}>
              #{linkingIssue?.number} {linkingIssue?.title}
            </Text>
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
              style={{ maxHeight: 260 }}
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
                  onPress={() => {
                    const product = REPO_SHORT[linkingIssue.repo] ?? '기타';
                    handleCreateTask(linkingIssue, product);
                  }}
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
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    backgroundColor: C.bg3,
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
  issueRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: C.bg2, borderRadius: 6, marginBottom: 4,
  },
  issueNum: { fontSize: 10, color: C.text3, fontVariant: ['tabular-nums'], marginBottom: 2 },
  issueTitle: { fontSize: 13, color: C.text, lineHeight: 17 },
  issueAssignees: { fontSize: 11, color: C.text3, marginTop: 3 },
  linkBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5,
    backgroundColor: '#0A84FF22', borderWidth: StyleSheet.hairlineWidth, borderColor: '#0A84FF55',
  },
  linkBtnText: { fontSize: 12, color: '#0A84FF', fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  picker: { borderRadius: 12, padding: 16, maxHeight: 520 },
  pickerTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  pickerSub: { fontSize: 12, marginBottom: 12 },
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
