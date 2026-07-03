import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Pressable,
  StyleSheet, SafeAreaView, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Linking, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { supabase, Task, TaskType, TaskLink } from '../lib/supabase';
import { fetchAllRepos, getToken, saveToken, issueUrl, PINNED_REPOS } from '../lib/github';
import { getClaudeKey, saveClaudeKey, getProxyHost, saveProxyHost } from '../lib/claude';
import { Ionicons } from '@expo/vector-icons';
import {
  AppMode, TimeView, SortKey, SortDir, FilterMap, DraftIssue, ThemeColors,
  DARK_C, LIGHT_C, PRODUCTS, MILESTONES, BUSINESSES, STATUSES, TASK_TYPES, SELECTABLE_TYPES,
  STATUS_META, COL, TIME_VIEWS, PRODUCT_DOT, PRODUCT_EMOJI, PRODUCT_SHORT, MILESTONE_DOT, BUSINESS_DOT,
  today, todayKST, addWorkingDays, fmtDisplay, isInTimeView,
} from '../lib/constants';
import { styles } from '../lib/styles';
import { MonthCalendar, WeekView, DayView } from '../components/CalendarViews';
import { SettingsModal } from '../components/SettingsModal';
import { ColFilter, DetailPanel } from '../components/DetailPanel';
import { WorkspaceView } from '../components/WorkspaceView';

// ─── GitHub 로그인 ─────────────────────────────────────────
function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const handleLogin = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: 'https://hhdeunj1.github.io/flux/' },
    });
    setLoading(false);
  };
  return (
    <SafeAreaView style={[styles.modeContainer, { gap: 32 }]}>
      <View style={styles.modeTitleBlock}>
        <Text style={styles.modeLogo}>Flux</Text>
        <Text style={styles.modeTagline}>기획자의 워크스페이스</Text>
      </View>
      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#24292e', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}
      >
        <Ionicons name="logo-github" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {loading ? '연결 중...' : 'GitHub로 로그인'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── 모드 선택 ─────────────────────────────────────────────
function ModeSelectScreen({ onSelect }: { onSelect: (mode: AppMode) => void }) {
  return (
    <SafeAreaView style={styles.modeContainer}>
      <View style={styles.modeTitleBlock}>
        <Text style={styles.modeLogo}>Flux</Text>
        <Text style={styles.modeTagline}>어떤 모드로 시작할까요?</Text>
      </View>
      <View style={styles.modeCardRow}>
        <TouchableOpacity style={styles.modeCard} onPress={() => onSelect('work')}>
          <Text style={styles.modeCardEmoji}>💼</Text>
          <Text style={styles.modeCardLabel}>업무</Text>
          <Text style={styles.modeCardDesc}>GitHub 이슈 연동{'\n'}프로젝트 관리</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modeCard} onPress={() => onSelect('work2')}>
          <Text style={styles.modeCardEmoji}>📊</Text>
          <Text style={styles.modeCardLabel}>업무(board)</Text>
          <Text style={styles.modeCardDesc}>보드 뷰{'\n'}마일스톤 관리</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modeCard} onPress={() => onSelect('personal')}>
          <Text style={styles.modeCardEmoji}>🌱</Text>
          <Text style={styles.modeCardLabel}>개인</Text>
          <Text style={styles.modeCardDesc}>개인 할 일{'\n'}일상 태스크</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── 추가 모달 ─────────────────────────────────────────────
function AddModal({ onQuickAdd, onDetailAdd, onClose, defaultDueDate }: {
  onQuickAdd: (title: string, type: TaskType, dueDate?: string) => void;
  onDetailAdd: (title: string, type: TaskType, dueDate?: string) => void;
  onClose: () => void;
  defaultDueDate?: string;
}) {
  const [text, setText] = useState('');
  const [type, setType] = useState<TaskType | null>(null);
  const canSubmit = !!text.trim();
  const handleQuick  = () => { if (!canSubmit) return; onQuickAdd(text.trim(), type ?? 'etc', defaultDueDate);  onClose(); };
  const handleDetail = () => { if (!canSubmit) return; onDetailAdd(text.trim(), type ?? 'etc', defaultDueDate); onClose(); };
  return (
    <Modal visible animationType="fade" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addModalOverlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={styles.addModalSheet}>
          <View style={styles.addModalHeader}>
            <View>
              <Text style={styles.addModalTitle}>새 항목</Text>
              {defaultDueDate && <Text style={styles.addModalDueDate}>📅 {fmtDisplay(defaultDueDate)} 마감</Text>}
            </View>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={18} color="#8E8E93" /></TouchableOpacity>
          </View>
          <View style={styles.addTypeRow}>
            {SELECTABLE_TYPES.map((t) => (
              <TouchableOpacity key={t.value} onPress={() => setType(t.value)}
                style={[styles.addTypeChip, type === t.value && { backgroundColor: t.bg, borderColor: t.color }]}>
                <Text style={[styles.addTypeChipText, type === t.value && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.addModalInput}
            placeholder="지금 머릿속에 있는 거 그냥 적어요" placeholderTextColor="#636366"
            value={text} onChangeText={setText} multiline autoFocus textAlignVertical="top"
            onKeyPress={(e) => { if ((e.nativeEvent as any).key === 'Enter') { e.preventDefault?.(); handleQuick(); } }} />
          <View style={styles.addModalBtnRow}>
            <TouchableOpacity style={[styles.addModalBtnShell, !canSubmit && { opacity: 0.35 }]} onPress={handleQuick}>
              <Text style={styles.addModalBtnShellText}>간단 등록</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addModalBtnDetail, !canSubmit && { opacity: 0.35 }]} onPress={handleDetail}>
              <Text style={styles.addModalBtnDetailText}>상세 등록 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 메인 ─────────────────────────────────────────────────
export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const [mode, setMode] = useState<AppMode | null>(null);
  const [modeLoading, setModeLoading] = useState(true);
  const [timeView, setTimeView] = useState<TimeView>('all');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const prevMonth = () => setCalendarMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextMonth = () => setCalendarMonth(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return mon.toISOString().split('T')[0];
  });
  const shiftWeek = (dir: 1 | -1) => setCalendarWeekStart((s) => {
    const d = new Date(s); d.setDate(d.getDate() + dir * 7);
    return d.toISOString().split('T')[0];
  });

  const [calendarDay, setCalendarDay] = useState(today);
  const shiftDay = (dir: 1 | -1) => setCalendarDay((s) => {
    const d = new Date(s); d.setDate(d.getDate() + dir);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    (async () => {
      const m = await AsyncStorage.getItem('flux_mode') as AppMode | null;
      setMode('work2');
      if (m) {
        const tv = await AsyncStorage.getItem(`flux_timeview_${m}`);
        setTimeView((tv as TimeView) || 'all');
      }
      setModeLoading(false);
    })();
  }, []);

  const selectMode = async (m: AppMode) => {
    await AsyncStorage.setItem('flux_mode', m);
    const saved = await AsyncStorage.getItem(`flux_timeview_${m}`);
    setTimeView((saved as TimeView) || 'all');
    setMode(m);
  };
  const switchMode = async () => {
    await AsyncStorage.removeItem('flux_mode');
    setMode(null);
  };
  const changeTimeView = async (v: TimeView) => {
    setTimeView(v);
    if (mode) await AsyncStorage.setItem(`flux_timeview_${mode}`, v);
  };

  const [isLight, setIsLight] = useState(false);
  useEffect(() => { AsyncStorage.getItem('flux_light').then((v) => { if (v === '1') setIsLight(true); }); }, []);
  const toggleLight = async () => { const next = !isLight; setIsLight(next); await AsyncStorage.setItem('flux_light', next ? '1' : '0'); };

  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  useEffect(() => { AsyncStorage.getItem('flux_flagged').then((v) => { if (v) setFlagged(new Set(JSON.parse(v))); }); }, []);
  const toggleFlag = async (id: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem('flux_flagged', JSON.stringify([...next]));
      return next;
    });
  };

  const [allLinks, setAllLinks] = useState<Record<string, TaskLink[]>>({});
  useEffect(() => { AsyncStorage.getItem('flux_links').then((v) => { if (v) setAllLinks(JSON.parse(v)); }); }, []);
  const updateTaskLinks = async (taskId: string, links: TaskLink[]) => {
    const next = { ...allLinks, [taskId]: links };
    setAllLinks(next);
    await AsyncStorage.setItem('flux_links', JSON.stringify(next));
  };

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandedParents((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const [checklistPopup, setChecklistPopup] = useState<{ taskId: string; pageX: number; pageY: number } | null>(null);
  const toggleCheckItem = async (taskId: string, itemIdx: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newChecklist = task.checklist.map((c, i) => i === itemIdx ? { ...c, done: !c.done } : c);
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, checklist: newChecklist } : t));
    if (selectedTask?.id === taskId) setSelectedTask((prev) => prev ? { ...prev, checklist: newChecklist } : prev);
    await supabase.from('tasks').update({ checklist: newChecklist, updated_at: new Date().toISOString() }).eq('id', taskId);
  };
  const C = isLight ? LIGHT_C : DARK_C;

  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<FilterMap>({});
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingDueDate, setPendingDueDate] = useState<string | undefined>(undefined);
  const openAddWithDate = (date: string) => { setPendingDueDate(date); setShowAddModal(true); };
  const openAdd = () => { setPendingDueDate(undefined); setShowAddModal(true); };
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [repos, setRepos] = useState<string[]>(PINNED_REPOS);
  const [claudeKeyInput, setClaudeKeyInput] = useState('');
  const [proxyHostInput, setProxyHostInput] = useState('');

  const fetchTasks = useCallback(async () => {
    if (!mode || !session) return;
    const [{ data: taskData }, { data: issueData }] = await Promise.all([
      supabase.from('tasks').select('*').eq('mode', mode).eq('user_id', session.user.id).order('created_at', { ascending: false }),
      supabase.from('task_issues').select('*'),
    ]);
    const merged = (taskData ?? []).map((t) => ({
      ...t,
      task_issues: (issueData ?? []).filter((i) => i.task_id === t.id),
    }));
    setTasks(merged);
  }, [mode, session]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { fetchAllRepos().then(setRepos); getToken().then((t) => { if (t) setTokenInput(t); }); getClaudeKey().then((k) => { if (k) setClaudeKeyInput(k); }); getProxyHost().then((h) => { if (h) setProxyHostInput(h); }); }, []);

  const handleSort = (key: SortKey, dir?: SortDir) => {
    if (dir) { setSortKey(key); setSortDir(dir); }
    else if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // 자식 태스크 맵 (parent_id → children)
  const childrenMap = new Map<string, Task[]>();
  tasks.forEach((t) => {
    if (t.parent_id) {
      const arr = childrenMap.get(t.parent_id) ?? [];
      arr.push(t);
      childrenMap.set(t.parent_id, arr);
    }
  });

  const processedTasks = [...tasks]
    .filter((t) => {
      if (t.parent_id) return false; // 자식 태스크는 부모 행에서 렌더링
      if (!isInTimeView(t, timeView)) return false;
      if (filters.product   && t.product   !== filters.product)  return false;
      if (filters.milestone && t.milestone !== filters.milestone) return false;
      if (filters.type      && TASK_TYPES.find((tt) => tt.value === t.type)?.label !== filters.type) return false;
      if (filters.status    && STATUS_META[t.status]?.label !== filters.status) return false;
      if (filters.business  && t.business  !== filters.business)  return false;
      if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = sortKey === 'title' ? a.title : (a as any)[sortKey] ?? '';
      const bv = sortKey === 'title' ? b.title : (b as any)[sortKey] ?? '';
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const rowNums = new Map<string, number>();
  let _n = 0;
  processedTasks.forEach((t) => { rowNums.set(t.id, ++_n); });

  const quickAdd = async (title: string, type: TaskType, dueDate?: string) => {
    const payload: any = { title, status: 'todo', type, mode, user_id: session.user.id };
    if (dueDate) payload.due_date = dueDate;
    const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
    if (error) { Alert.alert('생성 오류', error.message); return; }
    await fetchTasks();
    if (data) setSelectedTask({ ...data, task_issues: [] });
  };
  const detailAdd = async (title: string, type: TaskType, dueDate?: string) => {
    const payload: any = { title, status: 'todo', type, mode, user_id: session.user.id };
    if (dueDate) payload.due_date = dueDate;
    const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
    if (error) { Alert.alert('생성 오류', error.message); return; }
    if (data) { await fetchTasks(); setSelectedTask({ ...data, task_issues: [] }); }
  };
  const saveEdit = async (data: Partial<Task>, draftIssues: DraftIssue[]): Promise<string | null> => {
    if (!selectedTask) return '선택된 태스크 없음';
    try {
      const { error } = await supabase.from('tasks').update({ ...data, updated_at: new Date().toISOString() }).eq('id', selectedTask.id);
      if (error) { console.error('save error:', error); return error.message; }
      const { error: delError } = await supabase.from('task_issues').delete().eq('task_id', selectedTask.id);
      if (delError) { console.error('task_issues delete error:', delError); return delError.message; }
      const valid = draftIssues.filter((d) => d.repo && d.number);
      if (valid.length > 0) {
        const { error: insError } = await supabase.from('task_issues').insert(valid.map((d) => ({
          task_id: selectedTask.id, github_repo: d.repo, github_issue_number: parseInt(d.number, 10),
        })));
        if (insError) { console.error('task_issues insert error:', insError); return insError.message; }
      }
      await fetchTasks();
      setSelectedTask((prev) => prev ? { ...prev, ...data } : null);
      return null;
    } catch (e: any) {
      console.error('saveEdit exception:', e);
      return e?.message ?? '저장 중 오류 발생';
    }
  };
  const addSubTask = async (parentId: string, title: string) => {
    const { error } = await supabase.from('tasks').insert({ title, status: 'todo', type: 'task', mode, parent_id: parentId, user_id: session.user.id });
    if (!error) {
      await fetchTasks();
      setExpandedParents((prev) => new Set([...prev, parentId]));
    }
  };

  const deleteTask = async (id: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('이 항목을 삭제할까요?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('삭제', '이 항목을 삭제할까요?', [
            { text: '취소', style: 'cancel', onPress: () => resolve(false) },
            { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;
    await supabase.from('tasks').delete().eq('parent_id', id); // 자식 먼저 삭제
    await supabase.from('tasks').delete().eq('id', id);
    setSelectedTask(null);
    fetchTasks();
  };
  const handleSaveToken = async () => {
    await saveToken(tokenInput);
    if (claudeKeyInput.trim()) await saveClaudeKey(claudeKeyInput);
    if (proxyHostInput.trim()) await saveProxyHost(proxyHostInput);
    setShowTokenModal(false);
    fetchAllRepos().then(setRepos);
  };

  if (authLoading || modeLoading) return null;
  if (!session) return <LoginScreen />;
  if (!mode) return null;

  if (mode === 'work2') return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isLight ? '#F2F2F7' : '#161618' }}>
      <WorkspaceView
        isLight={isLight}
        onSwitchMode={switchMode}
        onToggleLight={toggleLight}
        userId={session.user.user_metadata?.preferred_username ?? session.user.user_metadata?.user_name ?? session.user.id.slice(0, 8)}
      />
    </SafeAreaView>
  );

  const hasFilters = Object.values(filters).some(Boolean) || !!searchText;

  const renderRow = ({ item, index }: { item: Task; index: number }) => {
    const issues = item.task_issues ?? [];
    const sm = STATUS_META[item.status] ?? STATUS_META['todo'];
    const isSelected = selectedTask?.id === item.id;
    const isDone = item.status === 'done';
    const isDimmed = isDone || item.type === 'schedule';
    const dimColor = isDimmed ? C.text3 : C.text;
    const productLabel = (p: string) => (PRODUCT_EMOJI[p] ?? '') + ' ' + (PRODUCT_SHORT[p] ?? p);
    const enabledChecklist = item.checklist
      .map((ci, i) => ({ ...ci, originalIndex: i }))
      .filter((ci) => ci.enabled);
    const hasChecklist = enabledChecklist.length > 0;
    const doneCount = enabledChecklist.filter((ci) => ci.done).length;
    const openChecklist = (e: any) => { e.stopPropagation?.(); setChecklistPopup({ taskId: item.id, pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY }); };
    const itemChildren = childrenMap.get(item.id) ?? [];
    const isExpanded = expandedParents.has(item.id);
    const hasChildren = itemChildren.length > 0;

    if (isMobile) {
      const productDot = item.product ? (PRODUCT_DOT[item.product] ?? '#8E8E93') : null;
      const milestoneDot = item.milestone ? (MILESTONE_DOT[item.milestone] ?? '#8E8E93') : null;
      return (
        <View>
          <TouchableOpacity
            style={[
              { paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder },
              isSelected && { backgroundColor: 'rgba(0,122,255,0.10)' },
            ]}
            onPress={() => setSelectedTask(isSelected ? null : item)}
          >
            {/* Line 1: title + issue badge + status */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Text style={{ fontSize: 12, color: C.text4, minWidth: 20, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{rowNums.get(item.id)}</Text>
              {item.type === 'schedule' && <Ionicons name="calendar-outline" size={13} color={C.text3} />}
              <Text style={{ flex: 1, fontSize: 15, letterSpacing: -0.3, color: dimColor, textDecorationLine: isDone ? 'line-through' : 'none' }} numberOfLines={1}>{item.title}</Text>
              {hasChildren && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); toggleExpand(item.id); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.bg3, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
                    <Text style={{ fontSize: 10, color: C.text3, fontVariant: ['tabular-nums'] }}>{itemChildren.length}</Text>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={9} color={C.text3} />
                  </View>
                </TouchableOpacity>
              )}
              {hasChecklist && (
                <TouchableOpacity onPress={openChecklist} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ fontSize: 11, color: doneCount === enabledChecklist.length ? '#30D158' : C.text4, fontVariant: ['tabular-nums'] }}>{doneCount}/{enabledChecklist.length}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); toggleFlag(item.id); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name={flagged.has(item.id) ? 'star' : 'star-outline'} size={13} color={flagged.has(item.id) ? '#FF9F0A' : C.text4} />
              </TouchableOpacity>
              {mode === 'work' && issues.map((issue) => (
                <TouchableOpacity key={issue.id} onPress={() => Linking.openURL(issueUrl(issue.github_repo, issue.github_issue_number))}
                  style={{ backgroundColor: C.chipBg, borderWidth: 1, borderColor: C.chipBorder, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] }}>#{issue.github_issue_number}</Text>
                </TouchableOpacity>
              ))}
              {item.type !== 'schedule' ? (
                <View style={[styles.statusPill, { backgroundColor: sm.bg, borderColor: sm.border }]}>
                  <Text style={[styles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, { backgroundColor: 'rgba(90,200,250,0.10)', borderColor: 'rgba(90,200,250,0.28)' }]}>
                  <Text style={[styles.statusPillText, { color: '#5AC8FA' }]}>일정</Text>
                </View>
              )}
            </View>
            {/* Line 2: product chip + milestone chip */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {productDot ? (
                <View style={{ backgroundColor: C.chipBg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: productDot + '55' }}>
                  <Text style={{ fontSize: 11, color: C.text3, letterSpacing: -0.2 }} numberOfLines={1}>{productLabel(item.product!)}</Text>
                </View>
              ) : null}
              {milestoneDot ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.chipBg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: milestoneDot + '55' }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: milestoneDot }} />
                  <Text style={{ fontSize: 11, color: milestoneDot, letterSpacing: -0.2 }}>{item.milestone}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          {/* 자식 태스크 (모바일) */}
          {isExpanded && itemChildren.map((child) => {
            const csm = STATUS_META[child.status] ?? STATUS_META['todo'];
            const cIsSelected = selectedTask?.id === child.id;
            const cIsDone = child.status === 'done';
            return (
              <TouchableOpacity
                key={child.id}
                style={[
                  { paddingVertical: 9, paddingHorizontal: 16, paddingLeft: 36, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder, backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' },
                  cIsSelected && { backgroundColor: 'rgba(0,122,255,0.10)' },
                ]}
                onPress={() => setSelectedTask(cIsSelected ? null : child)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: C.text4 }}>└</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: cIsDone ? C.text3 : C.text2, textDecorationLine: cIsDone ? 'line-through' : 'none' }} numberOfLines={1}>{child.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: csm.bg, borderColor: csm.border }]}>
                    <Text style={[styles.statusPillText, { color: csm.color }]}>{csm.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    return (
      <View>
        <TouchableOpacity
          style={[styles.tableRow, { borderBottomColor: C.rowBorder }, isSelected && styles.tableRowSelected, item.type === 'schedule' && styles.tableRowSchedule]}
          onPress={() => setSelectedTask(isSelected ? null : item)}
        >
          {/* 번호 */}
          <View style={[styles.tableCell, { width: COL.num, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 12, color: C.text3, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{rowNums.get(item.id)}</Text>
          </View>
          {/* 프로덕트 */}
          <View style={[styles.tableCell, { width: COL.product }]}>
            {item.product
              ? <Text style={{ fontSize: 11, color: C.text3, letterSpacing: -0.2 }} numberOfLines={1}>{productLabel(item.product)}</Text>
              : <Text style={{ fontSize: 11, color: C.text4 }}>—</Text>}
          </View>
          {/* 마일스톤 */}
          <View style={[styles.tableCell, { width: COL.milestone }]}>
            {item.milestone ? (() => {
                const dot = MILESTONE_DOT[item.milestone] ?? '#8E8E93';
                return (
                  <View style={[styles.tagMilestone, { backgroundColor: dot + '22', borderColor: dot + '66' }]}>
                    <Text style={[styles.tagMilestoneText, { color: dot }]}>{item.milestone}</Text>
                  </View>
                );
              })() : <Text style={[styles.cellEmpty, { color: C.text4 }]}>—</Text>}
          </View>
          {/* 사업 */}
          <View style={[styles.tableCell, { width: COL.business }]}>
            {item.business ? (() => {
              const dot = BUSINESS_DOT[item.business] ?? '#8E8E93';
              return (
                <View style={[styles.tagMilestone, { backgroundColor: dot + '22', borderColor: dot + '66' }]}>
                  <Text style={[styles.tagMilestoneText, { color: dot }]} numberOfLines={1}>{item.business}</Text>
                </View>
              );
            })() : <Text style={[styles.cellEmpty, { color: C.text4 }]}>—</Text>}
          </View>
          {/* 제목 + 연관 이슈 인라인 */}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, overflow: 'hidden' }}>
            {item.type === 'schedule' && <Ionicons name="calendar-outline" size={12} color={C.text3} />}
            {hasChildren && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); toggleExpand(item.id); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={12} color={C.text4} />
              </TouchableOpacity>
            )}
            <Text style={{ flexShrink: 1, fontSize: 14, letterSpacing: -0.2, color: dimColor, textDecorationLine: isDone ? 'line-through' : 'none' }} numberOfLines={1}>{item.title}</Text>
            {hasChildren && (
              <Text style={{ fontSize: 10, color: C.text4, fontVariant: ['tabular-nums'] }}>
                {itemChildren.filter((c) => c.status === 'done').length}/{itemChildren.length}
              </Text>
            )}
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); toggleFlag(item.id); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name={flagged.has(item.id) ? 'star' : 'star-outline'} size={12} color={flagged.has(item.id) ? '#FF9F0A' : C.text4} />
            </TouchableOpacity>
            {hasChecklist && (
              <TouchableOpacity onPress={openChecklist} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ fontSize: 11, color: doneCount === enabledChecklist.length ? '#30D158' : C.text4, fontVariant: ['tabular-nums'] }}>{doneCount}/{enabledChecklist.length}</Text>
              </TouchableOpacity>
            )}
            {(allLinks[item.id]?.length ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Ionicons name="link-outline" size={11} color={C.text4} />
                <Text style={{ fontSize: 10, color: C.text4 }}>{allLinks[item.id].length}</Text>
              </View>
            )}
            {mode === 'work' && issues.map((issue) => (
              <TouchableOpacity key={issue.id} onPress={() => Linking.openURL(issueUrl(issue.github_repo, issue.github_issue_number))}
                style={{ backgroundColor: C.chipBg, borderWidth: 1, borderColor: C.chipBorder, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] }}>#{issue.github_issue_number}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* 목표일정 */}
          <View style={[styles.tableCell, { width: COL.due }]}>
            {(() => {
              const raw = item.due_date ?? item.start_date;
              if (!raw) return <Text style={{ fontSize: 12, color: C.text4 }}>—</Text>;
              const d = raw.split('T')[0];
              const [, m, dd] = d.split('-');
              const t = todayKST();
              const isPast     = item.status !== 'done' && d < t;
              const isImminent = !isPast && item.status !== 'done' && d <= addWorkingDays(t, 2);
              const dateColor  = isPast ? '#D07070' : isImminent ? '#E89B55' : C.text3;
              return (
                <Text style={{ fontSize: 12, color: dateColor, fontVariant: ['tabular-nums'], letterSpacing: -0.2, fontWeight: (isPast || isImminent) ? '500' : '400' }}>
                  {`${m}.${dd}`}
                </Text>
              );
            })()}
          </View>
          {/* 상태 */}
          {item.type !== 'schedule' && (
            <View style={[styles.tableCell, { width: COL.status }]}>
              <View style={[styles.tagProduct, { backgroundColor: sm.bg, borderColor: sm.border }]}>
                <Text style={[styles.tagProductText, { color: sm.color }]}>{sm.label}</Text>
              </View>
            </View>
          )}
          {item.type === 'schedule' && (
            <View style={[styles.tableCell, { width: COL.status }]}>
              <Text style={[styles.cellEmpty, { color: C.text4 }]}>—</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 자식 태스크 (데스크톱) */}
        {isExpanded && itemChildren.map((child) => {
          const csm = STATUS_META[child.status] ?? STATUS_META['todo'];
          const cIsSelected = selectedTask?.id === child.id;
          const cIsDone = child.status === 'done';
          return (
            <TouchableOpacity
              key={child.id}
              style={[styles.tableRow, { borderBottomColor: C.rowBorder, backgroundColor: isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)' }, cIsSelected && styles.tableRowSelected]}
              onPress={() => setSelectedTask(cIsSelected ? null : child)}
            >
              <View style={[styles.tableCell, { width: COL.num, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 12, color: C.text4 }}>└</Text>
              </View>
              <View style={[styles.tableCell, { width: COL.product }]} />
              <View style={[styles.tableCell, { width: COL.milestone }]} />
              <View style={[styles.tableCell, { width: COL.business }]} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingLeft: 22, overflow: 'hidden' }}>
                <Text style={{ flexShrink: 1, fontSize: 13, letterSpacing: -0.2, color: cIsDone ? C.text3 : C.text2, textDecorationLine: cIsDone ? 'line-through' : 'none' }} numberOfLines={1}>{child.title}</Text>
              </View>
              <View style={[styles.tableCell, { width: COL.due }]}>
                {(() => {
                  const raw = child.due_date ?? child.start_date;
                  if (!raw) return <Text style={{ fontSize: 12, color: C.text4 }}>—</Text>;
                  const [, m, dd] = raw.split('T')[0].split('-');
                  return <Text style={{ fontSize: 12, color: C.text4, fontVariant: ['tabular-nums'] }}>{`${m}.${dd}`}</Text>;
                })()}
              </View>
              <View style={[styles.tableCell, { width: COL.status }]}>
                <View style={[styles.tagProduct, { backgroundColor: csm.bg, borderColor: csm.border }]}>
                  <Text style={[styles.tagProductText, { color: csm.color }]}>{csm.label}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]}>
      <View style={[styles.splitLayout, { backgroundColor: C.bg }]}>
        {/* ── 테이블 영역 ── */}
        <View style={[styles.tableSection, { backgroundColor: C.bg }]}>
          {/* 탑바 */}
          <View style={[styles.tableTopBar, { backgroundColor: C.bg, borderBottomColor: C.border, borderBottomWidth: timeView === 'all' ? StyleSheet.hairlineWidth : 0 }]}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerLeft}>
                <Text style={[styles.headerTitle, { color: C.text }]}>Flux</Text>
                <Text style={[styles.headerUser, { color: C.text3 }]}>@{session.user.user_metadata?.preferred_username ?? session.user.user_metadata?.user_name ?? session.user.email?.split('@')[0]}</Text>
                <TouchableOpacity onPress={switchMode} style={[styles.modePill, { backgroundColor: C.bg3, borderColor: C.border2 }]}>
                  <Text style={[styles.modePillText, { color: C.text3 }]}>{mode === 'work' ? '💼 업무' : '🌱 개인'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.searchBox, { backgroundColor: C.searchBg, borderColor: C.border }]}>
                  <Ionicons name="search" size={13} color={C.text3} />
                  <TextInput style={[styles.searchInput, { color: C.text }]} placeholder="검색" placeholderTextColor={C.text3}
                    value={searchText} onChangeText={setSearchText} />
                  {searchText ? <TouchableOpacity onPress={() => setSearchText('')}>
                    <Ionicons name="close-circle" size={13} color={C.text3} />
                  </TouchableOpacity> : null}
                </View>
                {hasFilters && (
                  <TouchableOpacity onPress={() => { setFilters({}); setSearchText(''); }} style={styles.clearAllBtn}>
                    <Text style={styles.clearAllText}>초기화</Text>
                  </TouchableOpacity>
                )}
                <View style={[styles.timeViewTabs, { backgroundColor: C.bg3, borderColor: C.border2 }]}>
                  {TIME_VIEWS.map((tv) => (
                    <TouchableOpacity
                      key={tv.value}
                      style={[styles.timeViewTab, timeView === tv.value && [styles.timeViewTabActive, { backgroundColor: C.bg2 }]]}
                      onPress={() => changeTimeView(tv.value)}
                    >
                      <Text style={[styles.timeViewTabText, { color: C.text3 }, timeView === tv.value && [styles.timeViewTabTextActive, { color: C.text }]]}>
                        {tv.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setShowTokenModal(true)} style={styles.iconBtn}>
                  <Ionicons name="settings-outline" size={17} color={C.text3} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.iconBtn}>
                  <Ionicons name="log-out-outline" size={17} color={C.text3} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {timeView === 'monthly' ? (
            <MonthCalendar
              tasks={tasks}
              year={calendarMonth.year}
              month={calendarMonth.month}
              onPrev={prevMonth}
              onNext={nextMonth}
              onSelectTask={setSelectedTask}
              mode={mode}
              onAdd={openAdd}
              onDatePress={openAddWithDate}
            />
          ) : timeView === 'weekly' ? (
            <WeekView
              tasks={tasks}
              weekStart={calendarWeekStart}
              onPrev={() => shiftWeek(-1)}
              onNext={() => shiftWeek(1)}
              onSelectTask={setSelectedTask}
              mode={mode}
              onAdd={openAdd}
              onDatePress={openAddWithDate}
            />
          ) : timeView === 'daily' ? (
            <DayView
              tasks={tasks}
              day={calendarDay}
              onPrev={() => shiftDay(-1)}
              onNext={() => shiftDay(1)}
              onSelectTask={setSelectedTask}
              mode={mode}
              onAdd={openAdd}
            />
          ) : (
            <>
              {/* 컬럼 헤더 (필터+정렬 통합) */}
              {!isMobile && <View style={[styles.colHeaderRow, { borderColor: C.rowBorder }]}>
                <View style={{ width: COL.num }} />
                <View style={{ width: COL.product }}>
                  <ColFilter asHeader C={C} label="Product" options={PRODUCTS}
                    displayOptions={PRODUCTS.map((p) => (PRODUCT_EMOJI[p] ? PRODUCT_EMOJI[p] + ' ' + p : p))}
                    value={filters.product} onSelect={(v) => setFilters((f) => ({ ...f, product: v }))}
                    sortKey="product" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                <View style={{ width: COL.milestone }}>
                  <ColFilter asHeader C={C} label="Milestone" options={MILESTONES}
                    value={filters.milestone} onSelect={(v) => setFilters((f) => ({ ...f, milestone: v }))}
                    sortKey="milestone" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                <View style={{ width: COL.business }}>
                  <ColFilter asHeader C={C} label="Initiative" options={BUSINESSES}
                    value={filters.business} onSelect={(v) => setFilters((f) => ({ ...f, business: v }))}
                    sortKey="business" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                <TouchableOpacity style={[styles.colHeaderCell, styles.colHeaderCellFlex]} onPress={() => handleSort('title')}>
                  <Text style={[styles.colHeaderLabel, { color: C.text3 }, sortKey === 'title' && { color: '#007AFF' }]}>Item</Text>
                  {sortKey === 'title' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color="#007AFF" />}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.colHeaderCell, { width: COL.due }]} onPress={() => handleSort('due_date')}>
                  <Text style={[styles.colHeaderLabel, { color: C.text3 }, sortKey === 'due_date' && { color: '#007AFF' }]}>Due date</Text>
                  {sortKey === 'due_date' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color="#007AFF" />}
                </TouchableOpacity>
                <View style={{ width: COL.status }}>
                  <ColFilter asHeader C={C} label="Status" options={STATUSES.map((s) => s.label)}
                    value={filters.status} onSelect={(v) => setFilters((f) => ({ ...f, status: v }))}
                    sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
              </View>}

              <FlatList
                data={processedTasks}
                renderItem={renderRow}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 80 }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.text4} style={{ marginBottom: 14 }} />
                    <Text style={styles.emptyText}>항목이 없어요</Text>
                    <Text style={styles.emptySubText}>오른쪽 아래 + 버튼으로{'\n'}새 항목을 추가해보세요</Text>
                  </View>
                }
              />
            </>
          )}
          <TouchableOpacity
            onPress={openAdd}
            style={[styles.addBtn, { position: 'absolute', bottom: 24, right: 16 }, isLight && { backgroundColor: '#333' }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── 상세 패널 ── */}
        {selectedTask && (
          <DetailPanel
            task={selectedTask}
            repos={repos}
            mode={mode}
            isLight={isLight}
            onSave={saveEdit}
            onDelete={deleteTask}
            onClose={() => setSelectedTask(null)}
            onOpenSettings={() => setShowTokenModal(true)}
            links={allLinks[selectedTask.id] ?? []}
            onLinksChange={(links) => updateTaskLinks(selectedTask.id, links)}
            subTasks={childrenMap.get(selectedTask.id) ?? []}
            onAddSubTask={(title) => addSubTask(selectedTask.id, title)}
            onSelectChild={(child) => setSelectedTask(child)}
          />
        )}
      </View>

      {/* ── 항목 추가 모달 ── */}
      {showAddModal && (
        <AddModal
          onQuickAdd={quickAdd}
          onDetailAdd={detailAdd}
          onClose={() => { setShowAddModal(false); setPendingDueDate(undefined); }}
          defaultDueDate={pendingDueDate}
        />
      )}

      {/* ── 체크리스트 팝업 ── */}
      {checklistPopup && (() => {
        const popTask = tasks.find((t) => t.id === checklistPopup.taskId);
        if (!popTask) return null;
        const popItems = popTask.checklist.map((ci, i) => ({ ...ci, originalIndex: i })).filter((ci) => ci.enabled);
        const popX = Math.max(8, Math.min(checklistPopup.pageX - 120, (typeof window !== 'undefined' ? window.innerWidth : 400) - 256));
        const popY = checklistPopup.pageY + 10;
        return (
          <Modal transparent animationType="fade" visible onRequestClose={() => setChecklistPopup(null)}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setChecklistPopup(null)}>
              <Pressable
                style={{ position: 'absolute', top: popY, left: popX, width: 240, backgroundColor: C.bg2, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 }}
                onPress={() => {}}
              >
                <Text style={{ fontSize: 11, color: C.text3, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, letterSpacing: -0.1 }} numberOfLines={1}>{popTask.title}</Text>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
                {popItems.map((ci) => (
                  <TouchableOpacity
                    key={ci.originalIndex}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder }}
                    onPress={() => toggleCheckItem(checklistPopup.taskId, ci.originalIndex)}
                  >
                    <Ionicons name={ci.done ? 'checkmark' : 'ellipse-outline'} size={16} color={C.text4} />
                    <Text style={{ fontSize: 13, color: ci.done ? C.text4 : C.text2, flex: 1 }}>{ci.label}</Text>
                  </TouchableOpacity>
                ))}
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}

      {/* ── 설정 모달 ── */}
      <SettingsModal
        visible={showTokenModal}
        isLight={isLight}
        onToggleLight={toggleLight}
        tokenInput={tokenInput}
        onTokenChange={setTokenInput}
        claudeKeyInput={claudeKeyInput}
        onClaudeKeyChange={setClaudeKeyInput}
        proxyHostInput={proxyHostInput}
        onProxyHostChange={setProxyHostInput}
        onSave={handleSaveToken}
        onClose={() => setShowTokenModal(false)}
      />
    </SafeAreaView>
  );
}
