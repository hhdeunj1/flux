import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView,
  Pressable, KeyboardAvoidingView, Platform, StyleSheet, Dimensions, Linking, useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, Task, ChecklistItem, TaskType, TaskLink } from '../lib/supabase';
import { issueUrl, PINNED_REPOS, createIssue, fetchRepoIssues, GitHubIssue } from '../lib/github';
import { getClaudeKey, generateIssue } from '../lib/claude';
import {
  ThemeColors, DARK_C, LIGHT_C, AppMode, SortKey, SortDir, DraftIssue,
  PRODUCTS, MILESTONES, BUSINESSES, PRIORITIES, STATUSES, SELECTABLE_TYPES, PRODUCT_EMOJI,
  ALL_DEFAULT_CHECKLIST_ITEMS, CHECKLIST_BY_TYPE, STATUS_META,
  fmtDate, fmtDisplay, today, uid, initChecklist,
} from '../lib/constants';
import { styles } from '../lib/styles';
import { IssuePreviewPanel } from './IssuePreviewPanel';

// ─── 칩 ───────────────────────────────────────────────────
export function Chip({ label, active, onPress, C }: { label: string; active: boolean; onPress: () => void; C?: ThemeColors }) {
  const colors = C ?? DARK_C;
  return (
    <TouchableOpacity
      style={[styles.chip, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }, active && styles.chipActive]}
      onPress={onPress}>
      <Text style={[styles.chipText, { color: colors.chipText }, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── 컬럼 필터 드롭다운 ────────────────────────────────────
export function ColFilter({ label, options, displayOptions, value, onSelect, sortKey, currentSort, currentDir, onSort, asHeader, C }: {
  label: string; options: string[]; displayOptions?: string[]; value: string | undefined;
  onSelect: (v: string | undefined) => void;
  sortKey: SortKey; currentSort: SortKey; currentDir: SortDir; onSort: (key: SortKey, dir?: SortDir) => void;
  asHeader?: boolean;
  C?: ThemeColors;
}) {
  const colors = C ?? DARK_C;
  const [open, setOpen] = useState(false);
  const isFiltered = !!value;
  const isSorted = currentSort === sortKey;
  return (
    <View>
      {asHeader ? (
        <TouchableOpacity style={styles.colHeaderCell} onPress={() => setOpen(true)}>
          <Text style={[styles.colHeaderLabel, { color: colors.text3 }, (isFiltered || isSorted) && { color: '#007AFF' }]} numberOfLines={1}>
            {value ? (displayOptions?.[options.indexOf(value)] ?? value) : label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {isSorted && <Ionicons name={currentDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color="#007AFF" />}
            <Ionicons name="funnel-outline" size={9} color={isFiltered ? '#007AFF' : colors.text4} />
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.colHeader, { backgroundColor: isFiltered ? 'rgba(0,122,255,0.12)' : colors.bg3, borderColor: isFiltered ? 'rgba(0,122,255,0.28)' : colors.border }]}
          onPress={() => setOpen(true)}>
          <Text style={[styles.colHeaderText, { color: isFiltered ? '#007AFF' : colors.text3 }]} numberOfLines={1}>{value ? (displayOptions?.[options.indexOf(value)] ?? value) : label}</Text>
          <View style={styles.colHeaderIcons}>
            {isSorted && <Ionicons name={currentDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color="#007AFF" />}
            <Ionicons name="chevron-down" size={10} color={isFiltered ? '#007AFF' : colors.text4} />
          </View>
        </TouchableOpacity>
      )}
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.dropOverlay} onPress={() => setOpen(false)} activeOpacity={1}>
          <View style={styles.dropSheet}>
            <Text style={styles.dropTitle}>{label}</Text>
            <View style={styles.dropSortRow}>
              <TouchableOpacity style={[styles.dropSortBtn, isSorted && currentDir === 'asc' && styles.dropSortActive]}
                onPress={() => { onSort(sortKey, 'asc'); setOpen(false); }}>
                <Ionicons name="arrow-up" size={12} color={isSorted && currentDir === 'asc' ? '#007AFF' : '#666'} />
                <Text style={[styles.dropSortText, isSorted && currentDir === 'asc' && { color: '#007AFF' }]}>오름차순</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dropSortBtn, isSorted && currentDir === 'desc' && styles.dropSortActive]}
                onPress={() => { onSort(sortKey, 'desc'); setOpen(false); }}>
                <Ionicons name="arrow-down" size={12} color={isSorted && currentDir === 'desc' ? '#007AFF' : '#666'} />
                <Text style={[styles.dropSortText, isSorted && currentDir === 'desc' && { color: '#007AFF' }]}>내림차순</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dropDivider} />
            <TouchableOpacity style={[styles.dropOption, !value && styles.dropOptionActive]}
              onPress={() => { onSelect(undefined); setOpen(false); }}>
              <Text style={[styles.dropOptionText, !value && { color: '#007AFF' }]}>전체</Text>
            </TouchableOpacity>
            {options.map((o, i) => (
              <TouchableOpacity key={o} style={[styles.dropOption, value === o && styles.dropOptionActive]}
                onPress={() => { onSelect(o); setOpen(false); }}>
                <Text style={[styles.dropOptionText, value === o && { color: '#007AFF' }]}>{displayOptions?.[i] ?? o}</Text>
                {value === o && <Ionicons name="checkmark" size={14} color="#007AFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── 레포 피커 ─────────────────────────────────────────────
function RepoPicker({ visible, repos, onSelect, onClose }: {
  visible: boolean; repos: string[]; onSelect: (repo: string) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = repos.filter((r) => r.toLowerCase().includes(search.toLowerCase()));
  const pinned = filtered.filter((r) => PINNED_REPOS.includes(r));
  const others = filtered.filter((r) => !PINNED_REPOS.includes(r));
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.repoPickerOverlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.repoPickerSheet}>
          <Text style={styles.repoPickerTitle}>레포지토리 선택</Text>
          <TextInput style={styles.repoSearchInput} placeholder="검색..." placeholderTextColor="#444"
            value={search} onChangeText={setSearch} autoFocus />
          <ScrollView>
            {pinned.length > 0 && (<><Text style={styles.repoGroupLabel}>📌 고정</Text>
              {pinned.map((r) => <TouchableOpacity key={r} style={styles.repoItem} onPress={() => { onSelect(r); onClose(); setSearch(''); }}><Text style={styles.repoItemText}>{r}</Text></TouchableOpacity>)}</>)}
            {others.length > 0 && (<><Text style={styles.repoGroupLabel}>전체</Text>
              {others.map((r) => <TouchableOpacity key={r} style={styles.repoItem} onPress={() => { onSelect(r); onClose(); setSearch(''); }}><Text style={styles.repoItemText}>{r}</Text></TouchableOpacity>)}</>)}
            {filtered.length === 0 && <Text style={styles.repoEmptyText}>검색 결과 없음</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── 이슈 행 ───────────────────────────────────────────────
function IssueInputRow({ draft, repos, onChange, onRemove, C }: {
  draft: DraftIssue; repos: string[]; onChange: (d: DraftIssue) => void; onRemove: () => void; C?: ThemeColors;
}) {
  const colors = C ?? DARK_C;
  const [showPicker, setShowPicker] = useState(false);
  const issueListUrl = draft.repo ? `https://github.com/${draft.repo}/issues` : null;
  const issueLink    = draft.repo && draft.number ? issueUrl(draft.repo, parseInt(draft.number)) : null;
  return (
    <View style={styles.issueInputRow}>
      <TouchableOpacity style={[styles.issueRepoBtn, { backgroundColor: colors.bg3 }]} onPress={() => setShowPicker(true)}>
        <Ionicons name="logo-github" size={12} color={colors.text3} />
        <Text style={[styles.issueRepoBtnText, { color: draft.repo ? colors.text : colors.text3 }]} numberOfLines={1}>
          {draft.repo || '레포 선택'}
        </Text>
        <Ionicons name="chevron-down" size={11} color={colors.text3} />
      </TouchableOpacity>
      {issueListUrl && (
        <TouchableOpacity onPress={() => Linking.openURL(issueListUrl)} style={styles.issueLinkBtn}>
          <Ionicons name="list-outline" size={14} color={colors.text3} />
        </TouchableOpacity>
      )}
      <Text style={[styles.issueHash, { color: colors.text3 }]}>#</Text>
      <TextInput style={[styles.issueNumberInput, { backgroundColor: colors.bg3, color: colors.text }]}
        placeholder="번호" placeholderTextColor={colors.text4}
        value={draft.number} onChangeText={(t) => onChange({ ...draft, number: t.replace(/[^0-9]/g, '') })}
        keyboardType="number-pad" />
      {issueLink && (
        <TouchableOpacity onPress={() => Linking.openURL(issueLink)} style={styles.issueLinkBtn}>
          <Ionicons name="open-outline" size={14} color="#007AFF" />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onRemove} style={styles.issueRemoveBtn}>
        <Ionicons name="close" size={14} color={colors.text3} />
      </TouchableOpacity>
      <RepoPicker visible={showPicker} repos={repos}
        onSelect={(r) => onChange({ ...draft, repo: r })} onClose={() => setShowPicker(false)} />
    </View>
  );
}

// ─── 날짜 행 ───────────────────────────────────────────────
function DateRow({ label, value, onOpen, readOnly, C }: {
  label: string; value: string; onOpen?: (y: number) => void; readOnly?: boolean; C?: ThemeColors;
}) {
  const colors = C ?? DARK_C;
  const display = value ? value.replace(/-/g, '.') : null;
  return (
    <TouchableOpacity style={[styles.dateRow, { borderBottomColor: colors.border }]}
      onPress={(e) => !readOnly && onOpen?.(e.nativeEvent.pageY)}
      disabled={readOnly} activeOpacity={0.6}>
      <Text style={[styles.dateLabel, { color: colors.labelColor }]}>{label}</Text>
      <Text style={[styles.dateValue, { color: colors.text }, !display && { color: colors.text4 }]}>
        {display ?? '—'}
      </Text>
      {!readOnly && <Ionicons name="calendar-outline" size={11} color={value ? colors.text3 : colors.text4} />}
    </TouchableOpacity>
  );
}

// ─── 미니 캘린더 ────────────────────────────────────────────
const CAL_CELL = 26;

function MiniCalendar({ value, onChange, onClose, anchorY }: {
  value: string; onChange: (v: string) => void; onClose: () => void; anchorY: number;
}) {
  const now = new Date();
  const screenH = Dimensions.get('window').height;
  const CAL_H = 290;
  const top = Math.min(Math.max(anchorY - 10, 8), screenH - CAL_H - 8);
  const base = value ? new Date(value + 'T00:00:00') : now;
  const [year,  setYear]  = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth());

  const prevMonth = () => month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selY = value ? parseInt(value.split('-')[0]) : null;
  const selM = value ? parseInt(value.split('-')[1]) - 1 : null;
  const selD = value ? parseInt(value.split('-')[2]) : null;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const handleDay = (day: number) => {
    onChange(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.calBackdrop} onPress={onClose}>
        <Pressable style={[styles.calCard, { position: 'absolute', top, right: 10 }]} onPress={() => {}}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
              <Text style={styles.calNav}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calTitle}>{year}. {String(month + 1).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <Text style={styles.calNav}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekRow}>
            {['일','월','화','수','목','금','토'].map((d) => (
              <View key={d} style={{ width: CAL_CELL, alignItems: 'center' }}>
                <Text style={styles.calWeekLabel}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={styles.calGrid}>
            {cells.map((day, i) => {
              if (!day) return <View key={`b${i}`} style={{ width: CAL_CELL, height: CAL_CELL }} />;
              const isSel     = day === selD && month === selM && year === selY;
              const isToday   = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
              const isWeekend = i % 7 === 0 || i % 7 === 6;
              return (
                <TouchableOpacity key={day} onPress={() => handleDay(day)}
                  style={{ width: CAL_CELL, height: CAL_CELL, justifyContent: 'center', alignItems: 'center' }}>
                  <View style={[styles.calDayInner, isSel && styles.calDaySel, isToday && !isSel && styles.calDayToday]}>
                    <Text style={[styles.calDayText, isWeekend && !isSel && styles.calDayTextWeekend, isSel && styles.calDayTextSel, isToday && !isSel && styles.calDayTextToday]}>
                      {day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {!!value && (
            <TouchableOpacity onPress={() => { onChange(''); onClose(); }} style={styles.calClearBtn}>
              <Text style={styles.calClearText}>날짜 삭제</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── 이슈 레포 피커 (인라인 드롭다운) ──────────────────────
function IssueRepoPicker({ repos, value, onChange, C, noMargin }: { repos: string[]; value: string; onChange: (v: string) => void; C?: ThemeColors; noMargin?: boolean }) {
  const colors = C ?? DARK_C;
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: noMargin ? 0 : 8 }}>
      <TouchableOpacity style={[styles.issueRepoBtn, { backgroundColor: colors.bg3 }]} onPress={() => setOpen((o) => !o)}>
        <Ionicons name="logo-github" size={11} color={colors.text3} />
        <Text style={[styles.issueRepoBtnText, { flex: 1, color: value ? colors.text : colors.text3 }]} numberOfLines={1}>{value || '레포 선택'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={11} color={colors.text3} />
      </TouchableOpacity>
      {open && (
        <View style={[styles.repoDropdown, { backgroundColor: colors.bg3, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
            {repos.map((r) => (
              <TouchableOpacity key={r} style={[styles.repoDropdownItem, { borderBottomColor: colors.border }]} onPress={() => { onChange(r); setOpen(false); }}>
                <Text style={[styles.repoDropdownText, { color: colors.text2 }, r === value && { color: '#007AFF' }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── 날짜 포맷 헬퍼 ──────────────────────────────────────────
function relDate(isoStr: string): string {
  const d = new Date(isoStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 30) return `${diff}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── GitHub 이슈 패널 (DetailPanel 내부 오버레이) ────────────
function GitHubIssuePanel({ repos, issueRepo, onRepoChange, allIssues, isGenerating, generateMsg, isLight, C, onClose, onLink, onUnlink, onGenerate }: {
  repos: string[];
  issueRepo: string;
  onRepoChange: (v: string) => void;
  allIssues: DraftIssue[];
  isGenerating: boolean;
  generateMsg: string;
  isLight: boolean;
  C: ThemeColors;
  onClose: () => void;
  onLink: (repo: string, num: number) => void;
  onUnlink: (id: string) => void;
  onGenerate: () => void;
}) {
  const canCallClaudeApi = Platform.OS !== 'web' || (typeof window !== 'undefined' && window.location.hostname === 'localhost');
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isGenerating) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isGenerating]);

  const [addOpen,       setAddOpen]       = useState(allIssues.length === 0);
  const [linkNumber,    setLinkNumber]    = useState('');
  const [localRepo,     setLocalRepo]     = useState(issueRepo || repos[0] || '');
  const [issueListOpen, setIssueListOpen] = useState(false);
  const [issueList,     setIssueList]     = useState<GitHubIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError,   setIssuesError]   = useState('');
  const [issuesPage,    setIssuesPage]    = useState(1);
  const [hasMore,       setHasMore]       = useState(true);
  const [issueSearch,   setIssueSearch]   = useState('');

  const handleRepoChange = (v: string) => {
    setLocalRepo(v);
    onRepoChange(v);
    setIssueList([]);
    setIssueListOpen(false);
    setIssuesPage(1);
    setHasMore(true);
    setIssuesError('');
    setIssueSearch('');
  };

  const loadIssues = async (repo: string, page: number, append = false) => {
    if (!repo) return;
    setIssuesLoading(true);
    setIssuesError('');
    try {
      const result = await fetchRepoIssues(repo, page);
      setIssueList((prev) => append ? [...prev, ...result] : result);
      setHasMore(result.length === 30);
    } catch (e: any) {
      setIssuesError(e.message ?? '불러오기 실패');
    } finally {
      setIssuesLoading(false);
    }
  };

  const handleToggleList = () => {
    if (!localRepo) return;
    if (!issueListOpen) {
      setIssueListOpen(true);
      if (issueList.length === 0) loadIssues(localRepo, 1);
    } else {
      setIssueListOpen(false);
    }
  };

  const handleLoadMore = () => {
    if (issuesLoading || !hasMore) return;
    const next = issuesPage + 1;
    setIssuesPage(next);
    loadIssues(localRepo, next, true);
  };

  const handleLink = () => {
    const num = parseInt(linkNumber.trim(), 10);
    if (!localRepo || !num) return;
    onLink(localRepo, num);
    setLinkNumber('');
  };

  const handleSelectIssue = (issue: GitHubIssue) => {
    onLink(localRepo, issue.number);
    setIssueListOpen(false);
  };

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg2, zIndex: 10 }]}>
      <View style={[styles.issuePanelHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.issuePanelBack} disabled={isGenerating}>
          <Ionicons name="chevron-back" size={20} color={isGenerating ? C.text4 : C.text3} />
        </TouchableOpacity>
        <Text style={[styles.issuePanelTitle, { color: C.text }]}>GitHub 이슈</Text>
      </View>

      {isGenerating && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg2, zIndex: 20, justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Claude가 이슈를 작성 중이에요</Text>
          <Text style={{ color: C.text3, fontSize: 13 }}>보통 20~30초 정도 걸려요</Text>
          <Text style={{ color: C.text4, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')} 경과
          </Text>
        </View>
      )}

      {!isGenerating && !!generateMsg && !generateMsg.startsWith('✓') && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(255,69,58,0.08)' }}>
          <Ionicons name="alert-circle-outline" size={14} color="#FF453A" />
          <Text style={{ color: '#FF453A', fontSize: 12, flex: 1 }}>{generateMsg}</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* 연결된 이슈 목록 */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.panelSectionLabel, { color: C.labelColor, marginTop: 0 }]}>연결된 이슈</Text>
          {allIssues.length === 0 ? (
            <Text style={{ color: C.text4, fontSize: 13 }}>연결된 이슈가 없어요</Text>
          ) : allIssues.map((issue) => {
            const repoShort = (issue.repo.split('/')[1] ?? issue.repo).replace('shucle-', '').replace('-product', '');
            return (
              <View key={issue.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg3, paddingHorizontal: 12, paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="logo-github" size={14} color={C.text3} />
                  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600', flex: 1 }}>
                    {repoShort} <Text style={{ color: '#007AFF' }}>#{issue.number}</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(issueUrl(issue.repo, parseInt(issue.number))).catch(() => {})}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Ionicons name="open-outline" size={13} color="#007AFF" />
                    <Text style={{ color: '#007AFF', fontSize: 12 }}>열기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onUnlink(issue.id)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={14} color="#FF453A" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* 이슈 추가 연결 (접힘) */}
        <TouchableOpacity
          onPress={() => setAddOpen(!addOpen)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}
        >
          <Ionicons name={addOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.text3} />
          <Text style={{ color: C.text3, fontSize: 13, fontWeight: '600' }}>이슈 추가 연결</Text>
        </TouchableOpacity>

        {addOpen && (<>

          {/* 레포 선택 */}
          <View>
            <Text style={[styles.panelSectionLabel, { color: C.labelColor, marginTop: 0 }]}>레포지토리</Text>
            <IssueRepoPicker repos={repos} value={localRepo} onChange={handleRepoChange} C={C} noMargin />
          </View>

          {/* 이슈 목록 (Finder 스타일) */}
          <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, overflow: 'hidden' }}>
            <TouchableOpacity
              onPress={handleToggleList}
              disabled={!localRepo}
              style={{ flexDirection: 'row', alignItems: 'center', height: 26, paddingHorizontal: 8, backgroundColor: C.bg3, gap: 5 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 7, color: localRepo ? C.text3 : C.text4, marginTop: 1, width: 8 }}>
                {issueListOpen ? '▼' : '▶'}
              </Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: localRepo ? C.text2 : C.text4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                이슈 목록
              </Text>
              {issuesLoading && issueListOpen && <Text style={{ color: C.text4, fontSize: 11 }}>···</Text>}
            </TouchableOpacity>

            {issueListOpen && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'stretch', height: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg3 }}>
                  <View style={{ width: 52, justifyContent: 'center', paddingHorizontal: 7, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}>
                    <Text style={{ fontSize: 10, color: C.text3, fontWeight: '600' }}>번호 ↓</Text>
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 7, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}>
                    <Text style={{ fontSize: 10, color: C.text3, fontWeight: '600' }}>제목</Text>
                  </View>
                  <View style={{ width: 58, justifyContent: 'center', paddingHorizontal: 7 }}>
                    <Text style={{ fontSize: 10, color: C.text3, fontWeight: '600', textAlign: 'right' }}>등록일</Text>
                  </View>
                </View>

                {/* 검색 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg }}>
                  <Ionicons name="search" size={12} color={C.text4} />
                  <TextInput
                    style={{ flex: 1, fontSize: 12, color: C.text, padding: 0 }}
                    placeholder="제목 검색..."
                    placeholderTextColor={C.text4}
                    value={issueSearch}
                    onChangeText={setIssueSearch}
                  />
                  {!!issueSearch && (
                    <TouchableOpacity onPress={() => setIssueSearch('')}>
                      <Ionicons name="close-circle" size={13} color={C.text4} />
                    </TouchableOpacity>
                  )}
                </View>

                {issuesLoading && issueList.length === 0 ? (
                  <View style={{ height: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                    <Text style={{ color: C.text3, fontSize: 12 }}>불러오는 중...</Text>
                  </View>
                ) : issuesError ? (
                  <View style={{ height: 40, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                    <Ionicons name="alert-circle-outline" size={13} color="#FF453A" />
                    <Text style={{ color: '#FF453A', fontSize: 12, flex: 1 }}>{issuesError}</Text>
                    <TouchableOpacity onPress={() => loadIssues(localRepo, 1)}>
                      <Text style={{ color: '#007AFF', fontSize: 12 }}>재시도</Text>
                    </TouchableOpacity>
                  </View>
                ) : issueList.length === 0 ? (
                  <View style={{ height: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                    <Text style={{ color: C.text3, fontSize: 12 }}>열린 이슈가 없어요</Text>
                  </View>
                ) : (() => {
                  const filtered = issueSearch.trim()
                    ? issueList.filter((i) => i.title.toLowerCase().includes(issueSearch.toLowerCase()) || String(i.number).includes(issueSearch.trim()))
                    : issueList;
                  if (filtered.length === 0) return (
                    <View style={{ height: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                      <Text style={{ color: C.text3, fontSize: 12 }}>검색 결과 없음</Text>
                    </View>
                  );
                  return <>{filtered.map((issue, idx) => {
                    const alreadyLinked = allIssues.some((i) => i.number === String(issue.number) && i.repo === localRepo);
                    const zebra = idx % 2 !== 0;
                    return (
                      <TouchableOpacity
                        key={issue.number}
                        onPress={() => handleSelectIssue(issue)}
                        disabled={alreadyLinked}
                        style={{
                          flexDirection: 'row', alignItems: 'stretch', height: 24,
                          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
                          backgroundColor: alreadyLinked
                            ? 'rgba(74,222,128,0.08)'
                            : zebra
                              ? (isLight ? 'rgba(0,0,0,0.028)' : 'rgba(255,255,255,0.04)')
                              : 'transparent',
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ width: 52, justifyContent: 'center', paddingHorizontal: 7, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: alreadyLinked ? '#4ADE80' : '#007AFF' }}>
                            #{issue.number}
                          </Text>
                        </View>
                        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 7, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}>
                          <Text style={{ fontSize: 12, color: alreadyLinked ? C.text3 : C.text }} numberOfLines={1}>
                            {issue.title}
                          </Text>
                        </View>
                        <View style={{ width: 58, justifyContent: 'center', paddingHorizontal: 7 }}>
                          <Text style={{ fontSize: 11, color: C.text4, textAlign: 'right' }}>
                            {relDate(issue.created_at)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}</>;
                })()}

                {!issueSearch && issueList.length > 0 && (hasMore || (issuesLoading && issueList.length > 0)) && (
                  <TouchableOpacity
                    onPress={handleLoadMore}
                    disabled={issuesLoading}
                    style={{ height: 28, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg3 }}
                  >
                    <Text style={{ color: issuesLoading ? C.text4 : '#007AFF', fontSize: 12, fontWeight: '600' }}>
                      {issuesLoading ? '···' : '더 보기'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* 번호로 직접 연결 */}
          <View>
            <Text style={[styles.panelSectionLabel, { color: C.labelColor, marginTop: 0 }]}>번호로 직접 연결</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ color: C.text3, fontSize: 13, fontWeight: '700', marginRight: 4 }}>#</Text>
                <TextInput
                  style={{ flex: 1, color: C.text, fontSize: 13, padding: 0 }}
                  value={linkNumber}
                  onChangeText={setLinkNumber}
                  placeholder="이슈 번호"
                  placeholderTextColor={C.text4}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={handleLink}
                />
              </View>
              <TouchableOpacity
                onPress={handleLink}
                disabled={!localRepo || !linkNumber.trim()}
                style={{ backgroundColor: '#007AFF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, opacity: (!localRepo || !linkNumber.trim()) ? 0.4 : 1 }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>연결</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 구분선 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
            <Text style={{ color: C.text4, fontSize: 11 }}>또는</Text>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
          </View>

          {/* Claude로 이슈 생성 */}
          <TouchableOpacity
            onPress={onGenerate}
            disabled={isGenerating || !localRepo || !canCallClaudeApi}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: canCallClaudeApi ? 'rgba(0,122,255,0.3)' : C.border, backgroundColor: canCallClaudeApi ? 'rgba(0,122,255,0.08)' : C.bg3, paddingVertical: 14, opacity: (isGenerating || !localRepo || !canCallClaudeApi) ? 0.4 : 1 }}
          >
            <Ionicons name="sparkles" size={15} color={canCallClaudeApi ? '#007AFF' : C.text3} />
            <Text style={{ color: canCallClaudeApi ? '#007AFF' : C.text3, fontSize: 14, fontWeight: '600' }}>
              {!canCallClaudeApi ? 'Claude 이슈 생성 (로컬 전용)' : isGenerating ? 'Claude 작성 중...' : 'Claude로 이슈 생성'}
            </Text>
          </TouchableOpacity>

        </>)}

      </ScrollView>
    </View>
  );
}

// ─── 오른쪽 상세 패널 ──────────────────────────────────────
export function DetailPanel({ task, repos, mode, isLight, onSave, onDelete, onClose, onOpenSettings, links, onLinksChange, subTasks, onAddSubTask, onSelectChild }: {
  task: Task; repos: string[]; mode: AppMode; isLight: boolean;
  onSave: (data: Partial<Task>, issues: DraftIssue[]) => Promise<string | null>;
  onDelete: (id: string) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  links: TaskLink[];
  onLinksChange: (links: TaskLink[]) => void;
  subTasks?: Task[];
  onAddSubTask?: (title: string) => void;
  onSelectChild?: (task: Task) => void;
}) {
  const [editTitle,     setEditTitle]     = useState(task.title);
  const [editNote,      setEditNote]      = useState(task.note ?? '');
  const [editProduct,   setEditProduct]   = useState<string | null>(task.product);
  const [editMilestone, setEditMilestone] = useState<string | null>(task.milestone);
  const [editBusiness,  setEditBusiness]  = useState<string | null>(task.business);
  const [editPriority,  setEditPriority]  = useState<Task['priority']>(task.priority);
  const [editStatus,    setEditStatus]    = useState<Task['status']>(task.status);
  const C = isLight ? LIGHT_C : DARK_C;
  const [editType,      setEditType]      = useState<TaskType>(task.type ?? 'etc');
  const [issueRepo,     setIssueRepo]     = useState(repos[0] ?? '');
  const [isGenerating,  setIsGenerating]  = useState(false);
  const canCallClaudeApi = Platform.OS !== 'web' || (typeof window !== 'undefined' && window.location.hostname === 'localhost');
  const [generateMsg,   setGenerateMsg]   = useState('');
  const [issuePreview,  setIssuePreview]  = useState<{ title: string; body: string } | null>(null);
  const [isPosting,     setIsPosting]     = useState(false);
  const [editStartDate, setEditStartDate] = useState(fmtDate(task.start_date));
  const [editDueDate,   setEditDueDate]   = useState(fmtDate(task.due_date));
  const [editEndDate,   setEditEndDate]   = useState(fmtDate(task.end_date));
  const [activeDatePicker, setActiveDatePicker] = useState<'start' | 'due' | 'end' | null>(null);
  const [datePickerY, setDatePickerY] = useState(0);
  const openPicker = (field: 'start' | 'due' | 'end') => (y: number) => { setDatePickerY(y); setActiveDatePicker(field); };
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>(() => initChecklist(task.checklist, task.type));
  const [customInput,   setCustomInput]   = useState('');
  const _initIssues = (t: Task) => (t.task_issues ?? []).map((i) => ({ id: i.id, repo: i.github_repo, number: i.github_issue_number.toString() }));
  const [mainIssue,     setMainIssue]     = useState<DraftIssue | null>(() => { const all = _initIssues(task); return all[0] ?? null; });
  const [relatedIssues, setRelatedIssues] = useState<DraftIssue[]>(() => { const all = _initIssues(task); return all.slice(1); });
  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [addingSubTask, setAddingSubTask] = useState(false);
  const [subTaskInput, setSubTaskInput] = useState('');
  const addLink = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    onLinksChange([...links, { url, label: newLinkLabel.trim() || undefined }]);
    setNewLinkUrl(''); setNewLinkLabel(''); setAddingLink(false);
  };
  const removeLink = (idx: number) => onLinksChange(links.filter((_, i) => i !== idx));

  useEffect(() => {
    setEditTitle(task.title);
    setEditNote(task.note ?? '');
    setEditProduct(task.product);
    setEditMilestone(task.milestone);
    setEditBusiness(task.business);
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditStartDate(fmtDate(task.start_date));
    setEditDueDate(fmtDate(task.due_date));
    setEditEndDate(fmtDate(task.end_date));
    setEditChecklist(initChecklist(task.checklist, task.type));
    setCustomInput('');
    const allIssues = (task.task_issues ?? []).map((i) => ({ id: i.id, repo: i.github_repo, number: i.github_issue_number.toString() }));
    setMainIssue(allIssues[0] ?? null);
    setRelatedIssues(allIssues.slice(1));
    setEditType(task.type ?? 'etc');
    setGenerateMsg('');
  }, [task.id]);

  useEffect(() => {
    if (editStatus === 'in_progress' && !editStartDate) setEditStartDate(today());
    if (editStatus === 'done'        && !editEndDate)   setEditEndDate(today());
  }, [editStatus]);

  useEffect(() => {
    setEditChecklist((prev) => {
      const newDefaults = CHECKLIST_BY_TYPE[editType] ?? [];
      const prevMap = new Map(prev.map((it) => [it.label, it]));
      const custom = prev.filter((it) => !ALL_DEFAULT_CHECKLIST_ITEMS.includes(it.label));
      const predefined = newDefaults.map((label) => ({
        label,
        enabled: prevMap.get(label)?.enabled ?? true,
        done:    prevMap.get(label)?.done    ?? false,
      }));
      return [...predefined, ...custom];
    });
  }, [editType]);

  const addRelatedRow    = () => setRelatedIssues((p) => [...p, { id: uid(), repo: '', number: '' }]);
  const updateRelated    = (id: string, d: DraftIssue) => setRelatedIssues((p) => p.map((i) => i.id === id ? d : i));
  const removeRelated    = (id: string) => setRelatedIssues((p) => p.filter((i) => i.id !== id));

  const toggleEnabled = (idx: number) =>
    setEditChecklist((cur) => cur.map((it, i) => i === idx ? { ...it, enabled: !it.enabled, done: it.enabled ? false : it.done } : it));
  const toggleDone = (idx: number) =>
    setEditChecklist((cur) => cur.map((it, i) => i === idx ? { ...it, done: !it.done } : it));
  const addCustomItem = () => {
    const label = customInput.trim();
    if (!label) return;
    setEditChecklist((cur) => [...cur, { label, enabled: true, done: false }]);
    setCustomInput('');
  };
  const removeCustomItem = (idx: number) =>
    setEditChecklist((cur) => cur.filter((_, i) => i !== idx));

  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const allIssues = [...(mainIssue ? [mainIssue] : []), ...relatedIssues];
      const err = await onSave({
        title: editTitle, note: editNote || null,
        product: editProduct, milestone: editMilestone, business: editBusiness,
        priority: editPriority, status: editStatus, type: editType,
        start_date: editStartDate || null, due_date: editDueDate || null, end_date: editEndDate || null,
        checklist: editChecklist,
      }, allIssues);
      if (err) setSaveError(err);
      else onClose();
    } catch (e: any) {
      setSaveError(e?.message ?? '저장 중 오류 발생');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateIssue = async () => {
    setIsGenerating(true);
    setGenerateMsg('');
    try {
      const apiKey = await getClaudeKey();
      if (!apiKey) { setIsGenerating(false); onOpenSettings(); return; }
      const taskData = {
        title: editTitle, note: editNote || null, type: editType,
        product: editProduct, milestone: editMilestone, business: editBusiness,
      };
      const { title: issueTitle, body } = await generateIssue(apiKey, taskData as any, issueRepo);
      setIssuePreview({ title: issueTitle, body });
      setGithubPanelOpen(false);
    } catch (e: any) {
      setGenerateMsg(`오류: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostIssue = async (title: string, body: string | null) => {
    setIsPosting(true);
    try {
      const issueNumber = await createIssue(issueRepo, title, body ?? '');
      await supabase.from('task_issues').insert({ task_id: task.id, github_repo: issueRepo, github_issue_number: issueNumber });
      setMainIssue({ id: uid(), repo: issueRepo, number: String(issueNumber) });
      setGenerateMsg(`✓ #${issueNumber} 생성 완료`);
      setIssuePreview(null);
    } catch (e: any) {
      setGenerateMsg(`오류: ${e.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Modal visible animationType={isMobile ? 'slide' : 'fade'} transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.detailModalOverlay, isMobile && { justifyContent: 'flex-end', alignItems: 'stretch' }]}>
        {!isMobile && <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />}
        <View style={[styles.detailPanel, { backgroundColor: C.bg2, borderColor: C.border }, isMobile && { borderRadius: 0, width: '100%', maxWidth: undefined, maxHeight: '100%', flex: 1 }]}>
          {/* 헤더: 제목 + GitHub이슈 + 삭제 + 닫기 */}
          <View style={[styles.detailCompactHeader, { borderBottomColor: C.border }]}>
            <TextInput
              style={[styles.detailTitleInput, { color: C.text }]}
              value={editTitle} onChangeText={setEditTitle}
              numberOfLines={1} placeholder="제목" placeholderTextColor={C.text3}
            />

            {mode === 'work' && (() => {
              const headerIssues = [mainIssue, ...relatedIssues].filter(Boolean) as DraftIssue[];
              return (
                <TouchableOpacity
                  onPress={() => setGithubPanelOpen(true)}
                  style={[styles.issueBadge, { backgroundColor: C.bg3, borderColor: C.border }]}
                >
                  <Ionicons name="logo-github" size={11} color={C.text3} />
                  <Text style={[styles.issueBadgeText, { color: C.text3 }]} numberOfLines={1}>
                    {headerIssues.length > 0
                      ? headerIssues.map((i) => `#${i.number}`).join('  ')
                      : '연결 이슈 없음'}
                  </Text>
                  {headerIssues.length === 0 && <Ionicons name="add" size={10} color={C.text4} />}
                </TouchableOpacity>
              );
            })()}

            <TouchableOpacity onPress={() => onDelete(task.id)} style={styles.detailIconBtn}>
              <Ionicons name="trash-outline" size={14} color="#FF453A" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.detailIconBtn}>
              <Ionicons name="close" size={17} color={C.text3} />
            </TouchableOpacity>
          </View>

          {!!generateMsg && (
            <Text style={[{ paddingHorizontal: 14, paddingVertical: 5, fontSize: 11 }, generateMsg.startsWith('✓') ? styles.issueGenMsgOk : { color: '#FF453A' }]}>
              {generateMsg}
            </Text>
          )}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.detailPanelScroll} contentContainerStyle={{ paddingBottom: 8 }}>
            <TextInput style={[styles.panelNoteInput, { backgroundColor: C.input, color: C.text2, borderColor: C.border }]}
              value={editNote} onChangeText={setEditNote} placeholder="메모 (선택)" placeholderTextColor={C.text4} />

            {/* 링크 섹션 */}
            <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>링크</Text>
            <View style={{ gap: 6, marginBottom: 4 }}>
              {links.map((link, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
                  <Ionicons name="link-outline" size={13} color={C.text3} />
                  <View style={{ flex: 1, overflow: 'hidden' }}>
                    {link.label ? <Text style={{ fontSize: 10, color: C.text3, marginBottom: 1 }}>{link.label}</Text> : null}
                    <Text style={{ fontSize: 12, color: '#0A84FF' }} numberOfLines={1}>{link.url}</Text>
                  </View>
                  <TouchableOpacity onPress={() => Linking.openURL(link.url)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="open-outline" size={14} color={C.text3} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeLink(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={14} color={C.text4} />
                  </TouchableOpacity>
                </View>
              ))}
              {addingLink ? (
                <View style={{ backgroundColor: C.bg3, borderRadius: 8, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, gap: 6 }}>
                  <TextInput
                    value={newLinkUrl} onChangeText={setNewLinkUrl}
                    placeholder="URL" placeholderTextColor={C.text4}
                    style={{ fontSize: 13, color: C.text, backgroundColor: C.input, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}
                    autoCapitalize="none" autoCorrect={false} keyboardType="url"
                  />
                  <TextInput
                    value={newLinkLabel} onChangeText={setNewLinkLabel}
                    placeholder="레이블 (선택) e.g. Slack 쓰레드" placeholderTextColor={C.text4}
                    style={{ fontSize: 13, color: C.text, backgroundColor: C.input, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}
                  />
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={addLink} style={{ flex: 1, backgroundColor: '#0A84FF', borderRadius: 6, paddingVertical: 8, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>추가</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setAddingLink(false); setNewLinkUrl(''); setNewLinkLabel(''); }}
                      style={{ flex: 1, backgroundColor: C.bg3, borderRadius: 6, paddingVertical: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
                      <Text style={{ color: C.text3, fontSize: 13 }}>취소</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setAddingLink(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}>
                  <Ionicons name="add-circle-outline" size={15} color={C.text3} />
                  <Text style={{ fontSize: 13, color: C.text3 }}>링크 추가</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.twoColRow, isMobile && { flexDirection: 'column' }]}>
              {/* 왼쪽: 프로덕트 / 마일스톤 / 연관사업 / 중요도 / 날짜 */}
              <View style={styles.twoColPane}>
                {mode === 'work' && (<>
                  <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>프로덕트</Text>
                  <View style={styles.chipRow}>
                    {PRODUCTS.map((v) => (
                      <Chip key={v} label={(PRODUCT_EMOJI[v] ? PRODUCT_EMOJI[v] + ' ' : '') + v} active={editProduct === v} C={C}
                        onPress={() => setEditProduct(editProduct === v ? null : v)} />
                    ))}
                  </View>

                  <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>마일스톤</Text>
                  <View style={styles.chipRow}>
                    {MILESTONES.map((v) => (
                      <Chip key={v} label={v} active={editMilestone === v} C={C}
                        onPress={() => setEditMilestone(editMilestone === v ? null : v)} />
                    ))}
                  </View>

                  <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>연관 사업</Text>
                  <View style={styles.chipRow}>
                    {BUSINESSES.map((v) => (
                      <Chip key={v} label={v} active={editBusiness === v} C={C}
                        onPress={() => setEditBusiness(editBusiness === v ? null : v)} />
                    ))}
                  </View>
                </>)}

                {editType !== 'schedule' && (<>
                  <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>중요도</Text>
                  <View style={styles.chipRow}>
                    {PRIORITIES.map((p) => (
                      <Chip key={p.value} label={p.label} active={editPriority === p.value} C={C}
                        onPress={() => setEditPriority(editPriority === p.value ? null : p.value)} />
                    ))}
                  </View>
                </>)}

                <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>날짜</Text>
                {editType === 'schedule' ? (
                  <>
                    <View style={[styles.dateBlock, { backgroundColor: C.input, borderColor: C.border }]}>
                      <DateRow label="날짜" value={editDueDate} onOpen={openPicker('due')} C={C} />
                    </View>
                    {activeDatePicker && (
                      <MiniCalendar anchorY={datePickerY} value={editDueDate}
                        onChange={setEditDueDate} onClose={() => setActiveDatePicker(null)} />
                    )}
                  </>
                ) : (
                  <>
                    <View style={[styles.dateBlock, { backgroundColor: C.input, borderColor: C.border }]}>
                      <View style={{ flexDirection: 'row' }}>
                        <View style={{ flex: 1, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}>
                          <DateRow label="등록일" value={fmtDisplay(task.created_at)} readOnly C={C} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <DateRow label="마감일" value={editDueDate} onOpen={openPicker('due')} C={C} />
                        </View>
                      </View>
                    </View>
                    <View style={[styles.dateBlock, { marginTop: 4, backgroundColor: C.input, borderColor: C.border }]}>
                      <View style={{ flexDirection: 'row' }}>
                        <View style={{ flex: 1, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}>
                          <DateRow label="시작일" value={editStartDate} onOpen={openPicker('start')} C={C} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <DateRow label="종료일" value={editEndDate} onOpen={openPicker('end')} C={C} />
                        </View>
                      </View>
                    </View>
                    {activeDatePicker && (
                      <MiniCalendar anchorY={datePickerY}
                        value={activeDatePicker === 'start' ? editStartDate : activeDatePicker === 'due' ? editDueDate : editEndDate}
                        onChange={activeDatePicker === 'start' ? setEditStartDate : activeDatePicker === 'due' ? setEditDueDate : setEditEndDate}
                        onClose={() => setActiveDatePicker(null)} />
                    )}
                  </>
                )}
              </View>

              {!isMobile && <View style={[styles.twoColDivider, { backgroundColor: C.border }]} />}

              {/* 오른쪽: 타입 / 상태 / 체크리스트 */}
              <View style={styles.twoColPane}>
                <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>타입</Text>
                <View style={styles.chipRow}>
                  {SELECTABLE_TYPES.map((t) => (
                    <TouchableOpacity key={t.value}
                      style={[styles.chip, { backgroundColor: C.chipBg, borderColor: C.chipBorder }, editType === t.value && { backgroundColor: t.bg, borderColor: t.color }]}
                      onPress={() => setEditType(t.value)}>
                      <Text style={[styles.chipText, { color: C.chipText }, editType === t.value && { color: t.color }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editType !== 'schedule' && (<>
                  <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>상태</Text>
                  <View style={styles.chipRow}>
                    {STATUSES.map((s) => (
                      <Chip key={s.value} label={s.label} active={editStatus === s.value} C={C}
                        onPress={() => setEditStatus(s.value)} />
                    ))}
                  </View>

                  <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>체크리스트</Text>
                  <View style={[styles.checklistBlock, { backgroundColor: C.bg3, borderColor: C.border }]}>
                    {editChecklist.map((item, idx) => {
                      const isCustom = !ALL_DEFAULT_CHECKLIST_ITEMS.includes(item.label);
                      return (
                        <View key={idx} style={[styles.checklistRow, { borderBottomColor: C.border }]}>
                          <TouchableOpacity onPress={() => toggleEnabled(idx)} style={styles.enableToggleWrap}>
                            <View style={[styles.toggleTrack, item.enabled && styles.toggleTrackOn]}>
                              <View style={[styles.toggleKnob, item.enabled && styles.toggleKnobOn]} />
                            </View>
                          </TouchableOpacity>
                          <Text style={[
                            styles.checklistLabel,
                            !item.enabled && styles.checklistLabelOff,
                            item.enabled && item.done && styles.checklistLabelDone,
                          ]} numberOfLines={1}>{item.label}</Text>
                          {isCustom && (
                            <TouchableOpacity onPress={() => removeCustomItem(idx)} style={styles.removeCustomBtn}>
                              <Text style={styles.removeCustomText}>×</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => item.enabled && toggleDone(idx)}
                            style={[styles.checkbox, item.done && styles.checkboxChecked, !item.enabled && styles.checkboxDisabled]}
                          >
                            {item.done && <Text style={styles.checkmark}>✓</Text>}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    <View style={styles.addCustomRow}>
                      <TextInput
                        style={[styles.addCustomInput, { color: C.text3 }]}
                        value={customInput}
                        onChangeText={setCustomInput}
                        placeholder="기타 항목 추가..."
                        placeholderTextColor={C.text4}
                        onSubmitEditing={addCustomItem}
                        returnKeyType="done"
                      />
                      <TouchableOpacity onPress={addCustomItem} style={styles.addCustomBtn}>
                        <Ionicons name="add" size={13} color="#007AFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>)}
              </View>
            </View>

            {/* 하위 작업 */}
            {((subTasks && subTasks.length > 0) || onAddSubTask) && (
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.panelSectionLabel, { color: C.labelColor }]}>하위 작업</Text>
                <View style={{ gap: 4 }}>
                  {subTasks?.map((child) => {
                    const csm = STATUS_META[child.status] ?? STATUS_META['todo'];
                    const cIsDone = child.status === 'done';
                    return (
                      <TouchableOpacity
                        key={child.id}
                        onPress={() => onSelectChild?.(child)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}
                      >
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, backgroundColor: csm.bg, borderColor: csm.border }}>
                          <Text style={{ fontSize: 10, color: csm.color, fontWeight: '600' }}>{csm.label}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, color: cIsDone ? C.text3 : C.text2, textDecorationLine: cIsDone ? 'line-through' : 'none' }} numberOfLines={1}>{child.title}</Text>
                        <Ionicons name="chevron-forward" size={12} color={C.text4} />
                      </TouchableOpacity>
                    );
                  })}
                  {onAddSubTask && (
                    addingSubTask ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
                        <TextInput
                          style={{ flex: 1, fontSize: 13, color: C.text, padding: 0 }}
                          value={subTaskInput}
                          onChangeText={setSubTaskInput}
                          placeholder="하위 작업 제목..."
                          placeholderTextColor={C.text4}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            const t = subTaskInput.trim();
                            if (t) { onAddSubTask(t); setSubTaskInput(''); setAddingSubTask(false); }
                          }}
                        />
                        <TouchableOpacity onPress={() => {
                          const t = subTaskInput.trim();
                          if (t) { onAddSubTask(t); setSubTaskInput(''); setAddingSubTask(false); }
                        }}>
                          <Ionicons name="checkmark-circle" size={18} color="#007AFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setAddingSubTask(false); setSubTaskInput(''); }}>
                          <Ionicons name="close-circle" size={18} color={C.text4} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => setAddingSubTask(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
                        <Ionicons name="add-circle-outline" size={15} color={C.text3} />
                        <Text style={{ fontSize: 13, color: C.text3 }}>하위 작업 추가</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.saveBtn, isSaving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={isSaving}>
              <Text style={styles.saveBtnText}>{isSaving ? '저장 중...' : '저장'}</Text>
            </TouchableOpacity>
            {!!saveError && <Text style={styles.saveErrorText}>{saveError}</Text>}
          </ScrollView>

          {githubPanelOpen && (
            <GitHubIssuePanel
              repos={repos}
              issueRepo={issueRepo}
              onRepoChange={setIssueRepo}
              allIssues={[mainIssue, ...relatedIssues].filter(Boolean) as DraftIssue[]}
              isGenerating={isGenerating}
              generateMsg={generateMsg}
              isLight={isLight}
              C={C}
              onClose={() => setGithubPanelOpen(false)}
              onLink={(repo, num) => {
                const d = { id: uid(), repo, number: String(num) };
                if (!mainIssue) setMainIssue(d);
                else setRelatedIssues((p) => [...p, d]);
              }}
              onUnlink={(id) => {
                if (mainIssue?.id === id) {
                  setMainIssue(relatedIssues[0] ?? null);
                  setRelatedIssues((p) => p.slice(1));
                } else {
                  setRelatedIssues((p) => p.filter((i) => i.id !== id));
                }
              }}
              onGenerate={handleGenerateIssue}
            />
          )}
          {issuePreview && (
            <IssuePreviewPanel
              preview={issuePreview}
              C={C}
              isPosting={isPosting}
              onClose={() => setIssuePreview(null)}
              onPost={handlePostIssue}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
