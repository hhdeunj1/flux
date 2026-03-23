import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Linking, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, Task, TaskType } from '../lib/supabase';
import { fetchAllRepos, getToken, saveToken, issueUrl, PINNED_REPOS } from '../lib/github';
import { getClaudeKey, saveClaudeKey, getProxyHost, saveProxyHost } from '../lib/claude';
import { Ionicons } from '@expo/vector-icons';
import {
  AppMode, TimeView, SortKey, SortDir, FilterMap, DraftIssue, ThemeColors,
  DARK_C, LIGHT_C, PRODUCTS, MILESTONES, STATUSES, TASK_TYPES, SELECTABLE_TYPES,
  STATUS_META, COL, TIME_VIEWS, PRODUCT_DOT, MILESTONE_DOT,
  today, fmtDisplay, isInTimeView,
} from '../lib/constants';
import { styles } from '../lib/styles';
import { MonthCalendar, WeekView, DayView } from '../components/CalendarViews';
import { SettingsModal } from '../components/SettingsModal';
import { ColFilter, DetailPanel } from '../components/DetailPanel';

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
      setMode(m || null);
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
    if (!mode) return;
    const [{ data: taskData }, { data: issueData }] = await Promise.all([
      supabase.from('tasks').select('*').eq('mode', mode).order('created_at', { ascending: false }),
      supabase.from('task_issues').select('*'),
    ]);
    const merged = (taskData ?? []).map((t) => ({
      ...t,
      task_issues: (issueData ?? []).filter((i) => i.task_id === t.id),
    }));
    setTasks(merged);
  }, [mode]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { fetchAllRepos().then(setRepos); getToken().then((t) => { if (t) setTokenInput(t); }); getClaudeKey().then((k) => { if (k) setClaudeKeyInput(k); }); getProxyHost().then((h) => { if (h) setProxyHostInput(h); }); }, []);

  const handleSort = (key: SortKey, dir?: SortDir) => {
    if (dir) { setSortKey(key); setSortDir(dir); }
    else if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const processedTasks = [...tasks]
    .filter((t) => {
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

  const quickAdd = async (title: string, type: TaskType, dueDate?: string) => {
    const payload: any = { title, status: 'todo', type, mode };
    if (dueDate) payload.due_date = dueDate;
    const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
    if (error) { Alert.alert('생성 오류', error.message); return; }
    await fetchTasks();
    if (data) setSelectedTask({ ...data, task_issues: [] });
  };
  const detailAdd = async (title: string, type: TaskType, dueDate?: string) => {
    const payload: any = { title, status: 'todo', type, mode };
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
      await supabase.from('task_issues').delete().eq('task_id', selectedTask.id);
      const valid = draftIssues.filter((d) => d.repo && d.number);
      if (valid.length > 0) {
        const { error: issueError } = await supabase.from('task_issues').insert(valid.map((d) => ({
          task_id: selectedTask.id, github_repo: d.repo, github_issue_number: parseInt(d.number),
        })));
        if (issueError) return issueError.message;
      }
      await fetchTasks();
      setSelectedTask((prev) => prev ? { ...prev, ...data } : null);
      return null;
    } catch (e: any) {
      console.error('saveEdit exception:', e);
      return e?.message ?? '저장 중 오류 발생';
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

  if (modeLoading) return null;
  if (!mode) return <ModeSelectScreen onSelect={selectMode} />;

  const hasFilters = Object.values(filters).some(Boolean) || !!searchText;

  const renderRow = ({ item }: { item: Task }) => {
    const issues = item.task_issues ?? [];
    const sm = STATUS_META[item.status] ?? STATUS_META['todo'];
    const isSelected = selectedTask?.id === item.id;

    if (isMobile) {
      const productDot = item.product ? (PRODUCT_DOT[item.product] ?? '#8E8E93') : null;
      const milestoneDot = item.milestone ? (MILESTONE_DOT[item.milestone] ?? '#8E8E93') : null;
      const issueNums = issues.map((i) => `#${i.github_issue_number}`).join(' ');
      return (
        <TouchableOpacity
          style={[
            { paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder },
            item.type === 'schedule' && { borderLeftWidth: 3, borderLeftColor: '#5AC8FA' },
            isSelected && { backgroundColor: 'rgba(0,122,255,0.10)' },
          ]}
          onPress={() => setSelectedTask(isSelected ? null : item)}
        >
          {/* Line 1: title + issue badge + status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Text style={{ flex: 1, fontSize: 15, letterSpacing: -0.3, color: C.text }} numberOfLines={1}>{item.title}</Text>
            {issueNums ? (
              <Text style={{ fontSize: 11, color: C.text3, letterSpacing: -0.2 }}>{issueNums}</Text>
            ) : null}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.chipBg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: productDot + '55' }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: productDot }} />
                <Text style={{ fontSize: 11, color: productDot, letterSpacing: -0.2 }} numberOfLines={1}>{item.product}</Text>
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
      );
    }

    return (
      <TouchableOpacity
        style={[styles.tableRow, { borderBottomColor: C.rowBorder }, isSelected && styles.tableRowSelected, item.type === 'schedule' && styles.tableRowSchedule]}
        onPress={() => setSelectedTask(isSelected ? null : item)}
      >
        {/* 프로덕트 */}
        <View style={[styles.tableCell, { width: COL.product }]}>
          {item.product ? (() => {
              const dot = PRODUCT_DOT[item.product] ?? '#8E8E93';
              return (
                <View style={[styles.tagProduct, { backgroundColor: C.chipBg, borderColor: dot + '55', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: dot }} />
                  <Text style={[styles.tagProductText, { color: dot }]} numberOfLines={1}>{item.product}</Text>
                </View>
              );
            })() : <Text style={[styles.cellEmpty, { color: C.text4 }]}>—</Text>}
        </View>
        {/* 마일스톤 */}
        <View style={[styles.tableCell, { width: COL.milestone }]}>
          {item.milestone ? (() => {
              const dot = MILESTONE_DOT[item.milestone] ?? '#8E8E93';
              return (
                <View style={[styles.tagMilestone, { backgroundColor: C.chipBg, borderColor: dot + '55', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: dot }} />
                  <Text style={[styles.tagMilestoneText, { color: dot }]}>{item.milestone}</Text>
                </View>
              );
            })() : <Text style={[styles.cellEmpty, { color: C.text4 }]}>—</Text>}
        </View>
        {/* 구분 (타입) */}
        <View style={[styles.tableCell, { width: COL.type }]}>
          {(() => {
            const tm = TASK_TYPES.find((t) => t.value === item.type);
            return tm ? (
              <View style={[styles.typeTag, { backgroundColor: C.chipBg, borderColor: C.chipBorder }]}>
                <Text style={[styles.typeTagText, { color: C.text3 }]}>{tm.label}</Text>
              </View>
            ) : null;
          })()}
        </View>
        {/* 아이템 제목 */}
        <View style={[styles.tableCell, styles.tableCellFlex]}>
          <Text style={[styles.cellTitle, { color: C.text }]} numberOfLines={1}>{item.title}</Text>
        </View>
        {/* 상태 */}
        {item.type !== 'schedule' && (
          <View style={[styles.tableCell, { width: COL.status }]}>
            <View style={[styles.statusPill, { backgroundColor: sm.bg, borderColor: sm.border }]}>
              <Text style={[styles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>
        )}
        {item.type === 'schedule' && <View style={[styles.tableCell, { width: COL.status }]} />}
        {/* 연관 이슈 */}
        {mode === 'work' && (
          <View style={[styles.tableCell, { width: COL.issue, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }]}>
            {issues.map((issue) => (
              <TouchableOpacity key={issue.id} onPress={() => Linking.openURL(issueUrl(issue.github_repo, issue.github_issue_number))}>
                <View style={styles.tagIssueInline}>
                  <Ionicons name="logo-github" size={9} color="#007AFF" />
                  <Text style={styles.tagIssueText}>#{issue.github_issue_number}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
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
                <Text style={[styles.headerUser, { color: C.text3 }]}>@eunj1</Text>
                <TouchableOpacity onPress={switchMode} style={[styles.modePill, { backgroundColor: C.bg3, borderColor: C.border2 }]}>
                  <Text style={[styles.modePillText, { color: C.text3 }]}>{mode === 'work' ? '💼 업무' : '🌱 개인'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
              </View>
            </View>
            {timeView === 'all' && (
              <View style={styles.headerRight}>
                <View style={[styles.searchBox, { backgroundColor: C.searchBg, borderColor: C.border }]}>
                  <Ionicons name="search" size={13} color={C.text3} />
                  <TextInput style={[styles.searchInput, { color: C.text }]} placeholder="아이템 검색" placeholderTextColor={C.text3}
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
                <TouchableOpacity onPress={openAdd} style={[styles.addBtn, isLight && { backgroundColor: '#333' }]}>
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
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
              <Text style={[styles.rowCount, { color: C.text3 }]}>{processedTasks.length}개 항목</Text>

              {/* 컬럼 헤더 (필터+정렬 통합) */}
              {!isMobile && <View style={[styles.colHeaderRow, { borderColor: C.rowBorder }]}>
                <View style={{ width: COL.product }}>
                  <ColFilter asHeader C={C} label="프로덕트" options={PRODUCTS}
                    value={filters.product} onSelect={(v) => setFilters((f) => ({ ...f, product: v }))}
                    sortKey="product" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                <View style={{ width: COL.milestone }}>
                  <ColFilter asHeader C={C} label="마일스톤" options={MILESTONES}
                    value={filters.milestone} onSelect={(v) => setFilters((f) => ({ ...f, milestone: v }))}
                    sortKey="milestone" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                <View style={{ width: COL.type }}>
                  <ColFilter asHeader C={C} label="구분" options={TASK_TYPES.map((t) => t.label)}
                    value={filters.type} onSelect={(v) => setFilters((f) => ({ ...f, type: v }))}
                    sortKey="type" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                <TouchableOpacity style={[styles.colHeaderCell, styles.colHeaderCellFlex]} onPress={() => handleSort('title')}>
                  <Text style={[styles.colHeaderLabel, { color: C.text3 }, sortKey === 'title' && { color: '#007AFF' }]}>아이템</Text>
                  {sortKey === 'title' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color="#007AFF" />}
                </TouchableOpacity>
                <View style={{ width: COL.status }}>
                  <ColFilter asHeader C={C} label="상태" options={STATUSES.map((s) => s.label)}
                    value={filters.status} onSelect={(v) => setFilters((f) => ({ ...f, status: v }))}
                    sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </View>
                {mode === 'work' && (
                  <View style={[styles.colHeaderCell, { width: COL.issue }]}>
                    <Text style={[styles.colHeaderLabel, { color: C.text3 }]}>이슈</Text>
                  </View>
                )}
              </View>}

              <FlatList
                data={processedTasks}
                renderItem={renderRow}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.text4} style={{ marginBottom: 14 }} />
                    <Text style={styles.emptyText}>항목이 없어요</Text>
                    <Text style={styles.emptySubText}>오른쪽 위 + 버튼으로{'\n'}새 항목을 추가해보세요</Text>
                  </View>
                }
              />
            </>
          )}
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
