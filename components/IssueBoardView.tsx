import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking, FlatList, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../lib/constants';
import { supabase, IssueBoardConfig, Task, TaskIssue } from '../lib/supabase';
import { PRODUCT_REPO_MAP, fetchIssuesByMilestone, GitHubIssueDetail } from '../lib/github';

type Props = {
  C: ThemeColors;
  config: IssueBoardConfig;
  userId: string;
  myUsername?: string;
};

type Section = { product: string; issues: GitHubIssueDetail[] };
type ViewMode = 'list' | 'board';
type TaskStatus = 'todo' | 'in_progress' | 'in_confirm' | 'done';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: '진행중',
  in_confirm: '검토중',
  done: '완료',
};
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_confirm', 'done'];
const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#636366',
  in_progress: '#0A84FF',
  in_confirm: '#FF9F0A',
  done: '#30D158',
};

type BoardTask = Task & { linkedIssue?: GitHubIssueDetail };

export function IssueBoardView({ C, config, userId, myUsername }: Props) {
  const { products, milestones } = config;
  const [selMilestone, setSelMilestone] = useState(milestones[0] ?? '');
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // 보드 뷰용 태스크
  const [boardTasks, setBoardTasks] = useState<BoardTask[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  // 태스크 연결용
  const [tasks, setTasks] = useState<Task[]>([]);
  const [linkingIssue, setLinkingIssue] = useState<GitHubIssueDetail | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // 태스크 로드 (연결 모달용)
  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setTasks(data ?? []));
  }, [userId]);

  const loadIssues = useCallback(async (milestone: string) => {
    if (!milestone || products.length === 0) return;
    setLoading(true);
    setFetched(false);
    const results = await Promise.all(
      products.map(async (product) => {
        const repo = PRODUCT_REPO_MAP[product];
        if (!repo) return { product, issues: [] };
        const issues = await fetchIssuesByMilestone(repo, milestone);
        return { product, issues };
      })
    );
    setSections(results.filter((s) => s.issues.length > 0));
    setLoading(false);
    setFetched(true);
  }, [products]);

  useEffect(() => {
    if (selMilestone) loadIssues(selMilestone);
  }, [selMilestone, loadIssues]);

  // 보드 뷰용 태스크 로드 (이슈와 연결된 것만)
  const loadBoardTasks = useCallback(async () => {
    if (!sections.length) return;
    setBoardLoading(true);

    // 현재 마일스톤 이슈들의 repo+number 목록
    const allIssues = sections.flatMap((s) => s.issues);
    const issueNumbers = allIssues.map((i) => i.number);
    if (!issueNumbers.length) { setBoardTasks([]); setBoardLoading(false); return; }

    // task_issues에서 연결된 task_id 찾기
    const { data: taskIssues } = await supabase
      .from('task_issues')
      .select('task_id, github_issue_number, github_repo')
      .in('github_issue_number', issueNumbers);

    if (!taskIssues?.length) { setBoardTasks([]); setBoardLoading(false); return; }

    const taskIds = [...new Set(taskIssues.map((ti) => ti.task_id))];

    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .in('id', taskIds)
      .eq('user_id', userId);

    // 연결된 이슈 정보 붙이기
    const enriched: BoardTask[] = (taskData ?? []).map((t) => {
      const link = taskIssues.find((ti) => ti.task_id === t.id);
      const issue = link ? allIssues.find(
        (i) => i.number === link.github_issue_number && i.repo === link.github_repo
      ) : undefined;
      return { ...t, linkedIssue: issue };
    });

    setBoardTasks(enriched);
    setBoardLoading(false);
  }, [sections, userId]);

  useEffect(() => {
    if (viewMode === 'board' && fetched) loadBoardTasks();
  }, [viewMode, fetched, loadBoardTasks]);

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    setBoardTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t));
    await supabase.from('tasks').update({ status }).eq('id', taskId);
  };

  const handleLinkToTask = async (task: Task) => {
    if (!linkingIssue) return;
    setLinkLoading(true);
    await supabase.from('task_issues').insert({
      task_id: task.id,
      github_repo: linkingIssue.repo,
      github_issue_number: linkingIssue.number,
    });
    setLinkLoading(false);
    setLinkingIssue(null);
    setTaskSearch('');
  };

  const handleCreateTask = async () => {
    if (!linkingIssue) return;
    setLinkLoading(true);
    const { data: newTask } = await supabase
      .from('tasks')
      .insert({
        title: linkingIssue.title,
        status: 'todo',
        type: 'task',
        mode: 'work2',
        user_id: userId,
        milestone: selMilestone,
      })
      .select('*')
      .single();
    if (newTask) {
      await supabase.from('task_issues').insert({
        task_id: newTask.id,
        github_repo: linkingIssue.repo,
        github_issue_number: linkingIssue.number,
      });
      setTasks((prev) => [newTask, ...prev]);
      // 보드 뷰에도 즉시 반영
      const enriched: BoardTask = { ...newTask, linkedIssue: linkingIssue };
      setBoardTasks((prev) => [enriched, ...prev]);
    }
    setLinkLoading(false);
    setLinkingIssue(null);
    setTaskSearch('');
  };

  const [bulkLoading, setBulkLoading] = useState<string | null>(null);

  const handleBulkImport = async (product: string, issues: GitHubIssueDetail[]) => {
    if (!myUsername) return;
    const mine = issues.filter((i) => i.assignees.includes(myUsername));
    if (mine.length === 0) return;
    setBulkLoading(product);
    for (const issue of mine) {
      const { data: newTask } = await supabase
        .from('tasks')
        .insert({
          title: issue.title,
          status: 'todo',
          type: 'task',
          mode: 'work2',
          user_id: userId,
          milestone: selMilestone,
        })
        .select('*')
        .single();
      if (newTask) {
        await supabase.from('task_issues').insert({
          task_id: newTask.id,
          github_repo: issue.repo,
          github_issue_number: issue.number,
        });
        setTasks((prev) => [newTask, ...prev]);
        setBoardTasks((prev) => [{ ...newTask, linkedIssue: issue }, ...prev]);
      }
    }
    setBulkLoading(null);
  };

  const handleBulkImportAll = async () => {
    if (!myUsername) return;
    const allMyIssues = sections.flatMap((s) =>
      s.issues.filter((i) => i.assignees.includes(myUsername))
    );
    if (allMyIssues.length === 0) return;
    setBulkLoading('ALL');
    for (const issue of allMyIssues) {
      const { data: newTask } = await supabase
        .from('tasks')
        .insert({
          title: issue.title,
          status: 'todo',
          type: 'task',
          mode: 'work2',
          user_id: userId,
          milestone: selMilestone,
        })
        .select('*')
        .single();
      if (newTask) {
        await supabase.from('task_issues').insert({
          task_id: newTask.id,
          github_repo: issue.repo,
          github_issue_number: issue.number,
        });
        setTasks((prev) => [newTask, ...prev]);
        setBoardTasks((prev) => [{ ...newTask, linkedIssue: issue }, ...prev]);
      }
    }
    setBulkLoading(null);
  };

  const filteredTasks = tasks.filter(
    (t) => !taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const s = styles(C);
  const totalCount = sections.reduce((n, sec) => n + sec.issues.length, 0);

  return (
    <View style={s.root}>
      {/* 마일스톤 탭 + 뷰 전환 */}
      <View style={s.milestoneBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {milestones.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setSelMilestone(m)}
              style={[s.msTab, selMilestone === m && s.msTabActive]}
            >
              <Text style={[s.msTabText, selMilestone === m && s.msTabTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 12 }}>
          {loading
            ? <ActivityIndicator size="small" color={C.text3} />
            : fetched && <Text style={s.totalBadge}>{totalCount}개</Text>
          }
          {/* 뷰 전환 */}
          <View style={s.viewToggle}>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
            >
              <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? '#0A84FF' : C.text3} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setViewMode('board'); if (fetched) loadBoardTasks(); }}
              style={[s.toggleBtn, viewMode === 'board' && s.toggleBtnActive]}
            >
              <Ionicons name="grid-outline" size={15} color={viewMode === 'board' ? '#0A84FF' : C.text3} />
            </TouchableOpacity>
          </View>
          {viewMode === 'list' && myUsername && fetched && (() => {
            const myTotal = sections.reduce(
              (n, s) => n + s.issues.filter((i) => i.assignees.includes(myUsername)).length, 0
            );
            if (myTotal === 0) return null;
            const isLoading = bulkLoading === 'ALL';
            return (
              <TouchableOpacity style={s.bulkAllBtn} onPress={handleBulkImportAll} disabled={!!bulkLoading}>
                {isLoading
                  ? <ActivityIndicator size="small" color="#30D158" />
                  : <>
                      <Ionicons name="person-circle" size={13} color="#30D158" />
                      <Text style={s.bulkAllBtnText}>내 이슈 {myTotal}개</Text>
                    </>
                }
              </TouchableOpacity>
            );
          })()}
        </View>
      </View>

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {fetched && totalCount === 0 && (
            <Text style={{ color: C.text3, textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              {selMilestone} 마일스톤에 이슈가 없습니다
            </Text>
          )}
          {sections.map((sec) => (
            <View key={sec.product} style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{sec.product}</Text>
                <Text style={s.sectionCount}>{sec.issues.length}</Text>
                {myUsername && (() => {
                  const myCount = sec.issues.filter((i) => i.assignees.includes(myUsername)).length;
                  if (myCount === 0) return null;
                  const isLoading = bulkLoading === sec.product;
                  return (
                    <TouchableOpacity style={s.bulkBtn} onPress={() => handleBulkImport(sec.product, sec.issues)} disabled={!!bulkLoading}>
                      {isLoading
                        ? <ActivityIndicator size="small" color="#30D158" />
                        : <>
                            <Ionicons name="person-circle" size={12} color="#30D158" />
                            <Text style={s.bulkBtnText}>내 이슈 {myCount}개 가져오기</Text>
                          </>
                      }
                    </TouchableOpacity>
                  );
                })()}
              </View>
              {sec.issues.map((issue) => (
                <View key={issue.number} style={s.row}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={s.issueNum}>#{issue.number}</Text>
                      <TouchableOpacity onPress={() => Linking.openURL(issue.html_url)}>
                        <Ionicons name="open-outline" size={11} color={C.text4} />
                      </TouchableOpacity>
                    </View>
                    <Text style={s.issueTitle} numberOfLines={2}>{issue.title}</Text>
                    {issue.assignees.length > 0
                      ? <View style={s.assigneeRow}>
                          <Ionicons name="person-circle-outline" size={14} color={C.text3} />
                          <Text style={s.assigneeText}>{issue.assignees.join(', ')}</Text>
                        </View>
                      : <View style={s.assigneeRow}>
                          <Ionicons name="person-circle-outline" size={14} color={C.text4} />
                          <Text style={[s.assigneeText, { color: C.text4 }]}>미배정</Text>
                        </View>
                    }
                  </View>
                  <TouchableOpacity
                    style={s.importBtn}
                    onPress={() => { setLinkingIssue(issue); setTaskSearch(''); }}
                  >
                    <Ionicons name="add-circle-outline" size={13} color="#0A84FF" />
                    <Text style={s.importBtnText}>가져오기</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* 보드 뷰 */}
      {viewMode === 'board' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.boardContainer}>
          {boardLoading
            ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                <ActivityIndicator color={C.text3} />
              </View>
            : STATUS_ORDER.map((status) => {
                const colTasks = boardTasks.filter((t) => t.status === status);
                return (
                  <View key={status} style={s.column}>
                    <View style={s.colHeader}>
                      <View style={[s.colDot, { backgroundColor: STATUS_COLORS[status] }]} />
                      <Text style={s.colTitle}>{STATUS_LABELS[status]}</Text>
                      <Text style={s.colCount}>{colTasks.length}</Text>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {colTasks.map((task) => (
                        <View key={task.id} style={[s.card, { backgroundColor: C.card }]}>
                          {task.linkedIssue && (
                            <View style={s.cardIssueLine}>
                              <Text style={s.cardIssueNum}>#{task.linkedIssue.number}</Text>
                              <TouchableOpacity onPress={() => Linking.openURL(task.linkedIssue!.html_url)}>
                                <Ionicons name="open-outline" size={10} color={C.text4} />
                              </TouchableOpacity>
                            </View>
                          )}
                          <Text style={[s.cardTitle, { color: C.text }]} numberOfLines={3}>{task.title}</Text>
                          {task.linkedIssue?.assignees && task.linkedIssue.assignees.length > 0 && (
                            <Text style={[s.cardAssignee, { color: C.text3 }]} numberOfLines={1}>
                              {task.linkedIssue.assignees.join(', ')}
                            </Text>
                          )}
                          {/* status 변경 버튼 */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                              {STATUS_ORDER.filter((s) => s !== status).map((next) => (
                                <TouchableOpacity
                                  key={next}
                                  style={[s.statusBtn, { borderColor: STATUS_COLORS[next] + '66' }]}
                                  onPress={() => updateTaskStatus(task.id, next)}
                                >
                                  <Text style={[s.statusBtnText, { color: STATUS_COLORS[next] }]}>{STATUS_LABELS[next]}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      ))}
                      {colTasks.length === 0 && (
                        <View style={s.emptyCol}>
                          <Text style={{ color: C.text4, fontSize: 12 }}>없음</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                );
              })
          }
        </ScrollView>
      )}

      {/* 태스크 연결 모달 */}
      <Modal visible={!!linkingIssue} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={[s.picker, { backgroundColor: C.card }]}>
            <Text style={[s.pickerTitle, { color: C.text }]} numberOfLines={2}>
              #{linkingIssue?.number} {linkingIssue?.title}
            </Text>
            {linkingIssue?.assignees && linkingIssue.assignees.length > 0 && (
              <Text style={[s.pickerAssignee, { color: C.text3 }]}>
                👤 {linkingIssue.assignees.join(', ')}
              </Text>
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
            <FlatList
              data={filteredTasks.slice(0, 30)}
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
              <TouchableOpacity
                style={[s.createBtn, { borderColor: C.border }]}
                onPress={handleCreateTask}
                disabled={linkLoading}
              >
                <Text style={[s.createBtnText, { color: C.text2 }]}>+ 새 태스크로 생성</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setLinkingIssue(null); setTaskSearch(''); }}
              >
                <Text style={s.cancelBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
            {linkLoading && (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center', borderRadius: 12 }]}>
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
  root: { flex: 1, backgroundColor: C.bg },
  milestoneBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    backgroundColor: C.bg2,
  },
  msTab: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  msTabActive: { backgroundColor: '#0A84FF22', borderColor: '#0A84FF88' },
  msTabText: { fontSize: 13, color: C.text3, fontWeight: '500' },
  msTabTextActive: { color: '#0A84FF' },
  totalBadge: { fontSize: 12, color: C.text3 },
  viewToggle: {
    flexDirection: 'row', borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    overflow: 'hidden',
  },
  toggleBtn: { paddingHorizontal: 8, paddingVertical: 5 },
  toggleBtnActive: { backgroundColor: '#0A84FF22' },
  bulkAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#30D15820', borderWidth: StyleSheet.hairlineWidth, borderColor: '#30D15866',
  },
  bulkAllBtnText: { fontSize: 12, color: '#30D158', fontWeight: '600' },
  section: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.bg2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.text2, flex: 1 },
  sectionCount: {
    fontSize: 11, color: C.text3,
    backgroundColor: C.bg3, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    fontVariant: ['tabular-nums'],
  },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
    backgroundColor: '#30D15820', borderWidth: StyleSheet.hairlineWidth, borderColor: '#30D15866',
  },
  bulkBtnText: { fontSize: 11, color: '#30D158', fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  issueNum: { fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] },
  issueTitle: { fontSize: 14, color: C.text, lineHeight: 19 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  assigneeText: { fontSize: 12, color: C.text3 },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#0A84FF15', borderWidth: StyleSheet.hairlineWidth, borderColor: '#0A84FF55',
    alignSelf: 'flex-start', marginTop: 2,
  },
  importBtnText: { fontSize: 12, color: '#0A84FF', fontWeight: '500' },

  // 보드 뷰
  boardContainer: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 12, gap: 10,
  },
  column: {
    width: 220,
    backgroundColor: C.bg2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { fontSize: 13, fontWeight: '600', color: C.text2, flex: 1 },
  colCount: {
    fontSize: 11, color: C.text3,
    backgroundColor: C.bg3, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 8, fontVariant: ['tabular-nums'],
  },
  card: {
    margin: 8, marginBottom: 4,
    borderRadius: 8, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  cardIssueLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  cardIssueNum: { fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] },
  cardTitle: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  cardAssignee: { fontSize: 11, marginTop: 4 },
  statusBtn: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusBtnText: { fontSize: 10, fontWeight: '500' },
  emptyCol: {
    margin: 12, padding: 16, alignItems: 'center',
    borderRadius: 6, borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border, borderStyle: 'dashed',
  },

  // 모달
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  picker: { borderRadius: 12, padding: 16, maxHeight: 520 },
  pickerTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  pickerAssignee: { fontSize: 12, marginBottom: 6 },
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
});
