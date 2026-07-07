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

export function IssueBoardView({ C, config, userId, myUsername }: Props) {
  const { products, milestones } = config;
  const [selMilestone, setSelMilestone] = useState(milestones[0] ?? '');
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // 태스크 연결용
  const [tasks, setTasks] = useState<Task[]>([]);
  const [linkingIssue, setLinkingIssue] = useState<GitHubIssueDetail | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // 태스크 로드
  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('mode', 'work2')
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
    }
    setLinkLoading(false);
    setLinkingIssue(null);
    setTaskSearch('');
  };

  const [bulkLoading, setBulkLoading] = useState<string | null>(null); // product key

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
      {/* 마일스톤 탭 */}
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
        <View style={{ marginRight: 16, minWidth: 40, alignItems: 'flex-end' }}>
          {loading
            ? <ActivityIndicator size="small" color={C.text3} />
            : fetched && <Text style={s.totalBadge}>{totalCount}개</Text>
          }
        </View>
      </View>

      {/* 이슈 리스트 */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {fetched && totalCount === 0 && (
          <Text style={{ color: C.text3, textAlign: 'center', marginTop: 40, fontSize: 13 }}>
            {selMilestone} 마일스톤에 이슈가 없습니다
          </Text>
        )}
        {sections.map((sec) => (
          <View key={sec.product} style={s.section}>
            {/* 프로덕트 섹션 헤더 */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{sec.product}</Text>
              <Text style={s.sectionCount}>{sec.issues.length}</Text>
              {myUsername && (() => {
                const myCount = sec.issues.filter((i) => i.assignees.includes(myUsername)).length;
                if (myCount === 0) return null;
                const isLoading = bulkLoading === sec.product;
                return (
                  <TouchableOpacity
                    style={s.bulkBtn}
                    onPress={() => handleBulkImport(sec.product, sec.issues)}
                    disabled={isLoading}
                  >
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

            {/* 이슈 행 */}
            {sec.issues.map((issue) => (
              <View key={issue.number} style={s.row}>
                {/* 이슈 번호 + 제목 */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={s.issueNum}>#{issue.number}</Text>
                    <TouchableOpacity onPress={() => Linking.openURL(issue.html_url)}>
                      <Ionicons name="open-outline" size={11} color={C.text4} />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.issueTitle} numberOfLines={2}>{issue.title}</Text>
                  {/* 어싸이니 */}
                  {issue.assignees.length > 0 && (
                    <View style={s.assigneeRow}>
                      <Ionicons name="person-circle-outline" size={14} color={C.text3} />
                      <Text style={s.assigneeText}>{issue.assignees.join(', ')}</Text>
                    </View>
                  )}
                  {issue.assignees.length === 0 && (
                    <View style={s.assigneeRow}>
                      <Ionicons name="person-circle-outline" size={14} color={C.text4} />
                      <Text style={[s.assigneeText, { color: C.text4 }]}>미배정</Text>
                    </View>
                  )}
                </View>
                {/* 가져오기 버튼 */}
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
  section: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.bg2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.text2, flex: 1 },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
    backgroundColor: '#30D15820', borderWidth: StyleSheet.hairlineWidth, borderColor: '#30D15866',
    minWidth: 32, justifyContent: 'center',
  },
  bulkBtnText: { fontSize: 11, color: '#30D158', fontWeight: '600' },
  sectionCount: {
    fontSize: 11, color: C.text3,
    backgroundColor: C.bg3, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    fontVariant: ['tabular-nums'],
  },
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
