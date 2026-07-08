import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, Linking, Modal, Pressable, Platform, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { supabase, Task, TaskIssue } from '../lib/supabase';
import { issueUrl, fetchRepoIssues, searchIssues, GitHubIssue, PRODUCT_REPO_MAP } from '../lib/github';

const REPO_TO_PRODUCT: Record<string, string> = Object.entries(PRODUCT_REPO_MAP).reduce(
  (acc, [product, repo]) => ({ ...acc, [repo]: product }),
  {} as Record<string, string>
);
import { IssueBrowser } from './IssueBrowser';
import {
  ThemeColors, DARK_C, LIGHT_C,
  PRODUCTS, MILESTONES, PRODUCT_DOT, PRODUCT_EMOJI, PRODUCT_SHORT, MILESTONE_DOT,
  todayKST, addWorkingDays, uid,
} from '../lib/constants';

// ─── types ─────────────────────────────────────────────────
type Section = {
  product: string;
  milestone: string;
  rawProduct: string | null;
  rawMilestone: string | null;
  key: string;
};
type Column = {
  milestone: string;
  rawMilestone: string | null;
  sections: Section[];
};
type AddTarget = { parentId: string | null; rawProduct: string | null; rawMilestone: string | null };
type MenuState = { taskId: string; x: number; y: number };
type CalState  = { taskId: string; anchorY: number };
type IssueState = { taskId: string; repo: string; num: string };
type LinkState  = { taskId: string };
type TaskLink   = { url: string; label?: string };

// ─── helpers ───────────────────────────────────────────────
function buildChildrenMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  tasks.forEach((t) => {
    const key = t.parent_id ?? 'ROOT';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  });
  return map;
}

function deriveSections(tasks: Task[]): Section[] {
  const rootTasks = tasks.filter((t) => !t.parent_id);
  const seen = new Set<string>();
  const sections: Section[] = [];
  const milestoneOrder = (m: string | null) => msOrder(m ?? 'ETC');
  [...rootTasks]
    .sort((a, b) => {
      const mo = milestoneOrder(a.milestone) - milestoneOrder(b.milestone);
      if (mo !== 0) return mo;
      const PORDER: Record<string, number> = { '라이더앱': 0, '드라이버앱': 1, '택시기사앱': 2 };
      return (PORDER[a.product ?? ''] ?? 9) - (PORDER[b.product ?? ''] ?? 9);
    })
    .forEach((t) => {
      const rawProduct = t.product ?? null;
      const rawMilestone = t.milestone ?? null;
      const product = rawProduct ?? '기타';
      const milestone = rawMilestone ?? 'ETC';
      const key = `${product}::${milestone}`;
      if (!seen.has(key)) {
        seen.add(key);
        sections.push({ product, milestone, rawProduct, rawMilestone, key });
      }
    });
  return sections;
}

function msOrder(ms: string): number {
  if (ms === 'ETC' || ms === '기타') return 99999;
  if (ms === 'TBD') return 99998;
  const m = ms.match(/v?(\d+)\.(\d+)/);
  if (m) return parseInt(m[1]) * 1000 + parseInt(m[2]);
  return 99997;
}

function deriveColumns(sections: Section[]): Column[] {
  const map = new Map<string, Column>();
  sections.forEach((s) => {
    if (!map.has(s.milestone)) {
      map.set(s.milestone, { milestone: s.milestone, rawMilestone: s.rawMilestone, sections: [] });
    }
    map.get(s.milestone)!.sections.push(s);
  });
  const result: Column[] = [...map.entries()]
    .filter(([ms]) => ms !== 'ETC')
    .sort(([a], [b]) => msOrder(a) - msOrder(b))
    .map(([, col]) => col);
  // 기타(ETC) 항상 마지막에
  const etcSections = sections.filter(s => s.milestone === 'ETC');
  result.push({ milestone: '기타', rawMilestone: null, sections: etcSections });
  return result;
}

function countDeep(tasks: Task[], childrenMap: Map<string, Task[]>, field: 'all' | 'done'): number {
  let n = 0;
  const walk = (id: string) => {
    const children = childrenMap.get(id) ?? [];
    children.forEach((c) => {
      if (field === 'all' || c.status === 'done') n++;
      walk(c.id);
    });
  };
  tasks.forEach((t) => {
    if (field === 'all' || t.status === 'done') n++;
    walk(t.id);
  });
  return n;
}

// ─── MiniCalendar ──────────────────────────────────────────
const CAL_CELL = 28;
function MiniCalendar({ value, onChange, onClose, anchorY }: {
  value: string; onChange: (v: string) => void; onClose: () => void; anchorY: number;
}) {
  const now = new Date();
  const base = value ? new Date(value + 'T00:00:00') : now;
  const [year,  setYear]  = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth());
  const prevM = () => month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1);
  const nextM = () => month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1);
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selY = value ? +value.split('-')[0] : null;
  const selM = value ? +value.split('-')[1] - 1 : null;
  const selD = value ? +value.split('-')[2] : null;
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const { height: screenH } = { height: typeof window !== 'undefined' ? window.innerHeight : 800 };
  const CAL_H = 260;
  const top = Math.min(Math.max(anchorY - 10, 8), screenH - CAL_H - 8);
  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <Pressable style={{ position: 'absolute', top, right: 16, backgroundColor: '#2C2C2E', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#38383A', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <TouchableOpacity onPress={prevM} style={{ padding: 4 }}><Text style={{ color: '#fff', fontSize: 16 }}>‹</Text></TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{year}. {String(month + 1).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={nextM} style={{ padding: 4 }}><Text style={{ color: '#fff', fontSize: 16 }}>›</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {['일','월','화','수','목','금','토'].map(d => (
              <View key={d} style={{ width: CAL_CELL, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#636366' }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, i) => {
              if (!day) return <View key={`b${i}`} style={{ width: CAL_CELL, height: CAL_CELL }} />;
              const isSel = day === selD && month === selM && year === selY;
              const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
              return (
                <TouchableOpacity key={day} onPress={() => { onChange(`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`); onClose(); }}
                  style={{ width: CAL_CELL, height: CAL_CELL, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? '#007AFF' : isToday ? 'rgba(0,122,255,0.2)' : 'transparent' }}>
                    <Text style={{ fontSize: 12, color: isSel ? '#fff' : isToday ? '#007AFF' : (i % 7 === 0 ? '#FF453A' : '#fff') }}>{day}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {!!value && (
            <TouchableOpacity onPress={() => { onChange(''); onClose(); }} style={{ marginTop: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#FF453A' }}>날짜 삭제</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── MiniMenu ──────────────────────────────────────────────
function MiniMenu({ x, y, task, C, onClose, onSetDate, onEditNote, onLinkIssue, onAddLink, onSetFlag, onDelete }: {
  x: number; y: number; task: Task; C: ThemeColors;
  onClose: () => void;
  onSetDate: () => void;
  onEditNote: () => void;
  onLinkIssue: () => void;
  onAddLink: () => void;
  onSetFlag: (flag: 'today' | 'tomorrow' | null) => void;
  onDelete: () => void;
}) {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 800;
  const menuW = 160;
  const left = Math.min(x - menuW / 2, screenW - menuW - 8);
  const top = y + 8;
  const flagLabel = task.flag === 'today' ? '오늘 해제' : task.flag === 'tomorrow' ? '내일 → 오늘' : '오늘 할 일';
  const flagLabel2 = task.flag === 'tomorrow' ? '내일 해제' : task.flag === 'today' ? '오늘 → 내일' : '내일 할 일';
  const items = [
    { icon: 'flag',             label: flagLabel,                                onPress: () => onSetFlag(task.flag === 'today' ? null : 'today') },
    { icon: 'flag-outline',     label: flagLabel2,                               onPress: () => onSetFlag(task.flag === 'tomorrow' ? null : 'tomorrow') },
    { icon: 'calendar-outline', label: task.due_date ? '날짜 수정' : '날짜 설정', onPress: onSetDate },
    { icon: 'create-outline',   label: task.note ? '메모 편집' : '메모 추가',  onPress: onEditNote },
    { icon: 'logo-github',      label: 'GitHub 이슈 연결',                      onPress: onLinkIssue },
    { icon: 'link-outline',     label: '링크 추가',                              onPress: onAddLink },
    { icon: 'trash-outline',    label: '삭제',                                   onPress: onDelete, danger: true },
  ] as const;
  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <Pressable style={{ position: 'absolute', top, left, width: menuW, backgroundColor: C.bg2, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, overflow: 'hidden' }} onPress={() => {}}>
          {items.map((item, i) => (
            <TouchableOpacity key={i} onPress={() => { onClose(); item.onPress(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: C.border }}>
              <Ionicons name={item.icon as any} size={14} color={'danger' in item && item.danger ? '#FF453A' : C.text2} />
              <Text style={{ fontSize: 13, color: 'danger' in item && item.danger ? '#FF453A' : C.text2 }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── IssueInput ────────────────────────────────────────────
function IssueInputModal({ state, C, onClose, onConfirm }: {
  state: IssueState; C: ThemeColors;
  onClose: () => void;
  onConfirm: (repo: string, num: number) => void;
}) {
  const [repo, setRepo] = useState(state.repo);
  const [num,  setNum]  = useState(state.num);
  const [issueList, setIssueList] = useState<GitHubIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [textSearch, setTextSearch] = useState('');
  const [searchResults, setSearchResults] = useState<GitHubIssue[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const PINNED = [
    'hkmc-airlab/shucle-rider', 'hkmc-airlab/shucle-bts-rider',
    'hkmc-airlab/shucle-DriverVehicle-product', 'hkmc-airlab/shucle-taxidriver-product',
    'hhdeunj1/2026',
  ];

  // 레포 선택 시 최근 이슈 자동 로드
  useEffect(() => {
    if (!repo) return;
    setIssueList([]);
    setTextSearch('');
    setSearchResults([]);
    setIssuesLoading(true);
    fetchRepoIssues(repo, 1, 20)
      .then(setIssueList)
      .catch(() => {})
      .finally(() => setIssuesLoading(false));
  }, [repo]);

  // 텍스트 검색 디바운스 (400ms)
  useEffect(() => {
    if (!textSearch.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const q = textSearch.toLowerCase().trim();
      const fromCache = issueList.filter((i) => i.title.toLowerCase().includes(q));
      const seen = new Set(fromCache.map((i) => i.number));
      try {
        const apiResults = await searchIssues([repo], textSearch);
        for (const r of apiResults) {
          if (!seen.has(r.number)) { seen.add(r.number); fromCache.push(r); }
        }
      } catch {}
      setSearchResults(fromCache);
      setSearchLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [textSearch]);

  const handleUrl = (v: string) => {
    const m = v.match(/github\.com\/([^/\s]+\/[^/\s]+)\/issues\/(\d+)/);
    if (m) { setRepo(m[1]); setNum(m[2]); return; }
    if (/^\d+$/.test(v.trim())) { setNum(v.trim()); return; }
    setNum(v.replace(/[^0-9]/g, ''));
  };

  const displayList = textSearch.trim() ? searchResults : issueList;

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }]} onPress={onClose}>
        <Pressable style={{ backgroundColor: C.bg2, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 12 }} onPress={() => {}}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>GitHub 이슈 연결</Text>

          {/* 레포 선택 */}
          <Text style={{ fontSize: 11, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>레포지토리</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PINNED.map(r => {
              const short = r.split('/')[1].replace('shucle-','').replace('-product','');
              return (
                <TouchableOpacity key={r} onPress={() => setRepo(r)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: repo === r ? 'rgba(0,122,255,0.12)' : C.bg3, borderColor: repo === r ? 'rgba(0,122,255,0.4)' : C.border }}>
                  <Text style={{ fontSize: 12, color: repo === r ? '#007AFF' : C.text3 }}>{short}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 최근 이슈 + 제목 검색 */}
          {repo ? (
            <View style={{ backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              <TextInput
                style={{ fontSize: 13, color: C.text, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border } as any}
                value={textSearch} onChangeText={setTextSearch}
                placeholder="제목으로 검색..." placeholderTextColor={C.text4}
                autoCapitalize="none" autoCorrect={false}
              />
              <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                {(issuesLoading || searchLoading) ? (
                  <Text style={{ fontSize: 12, color: C.text4, padding: 10 }}>불러오는 중...</Text>
                ) : displayList.length === 0 ? (
                  <Text style={{ fontSize: 12, color: C.text4, padding: 10 }}>{textSearch ? '검색 결과 없음' : '이슈 없음'}</Text>
                ) : displayList.map((issue) => (
                  <TouchableOpacity
                    key={issue.number}
                    onPress={() => setNum(String(issue.number))}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: num === String(issue.number) ? 'rgba(0,122,255,0.08)' : 'transparent' }}
                  >
                    <Text style={{ fontSize: 11, color: '#007AFF', fontVariant: ['tabular-nums'], marginRight: 6, minWidth: 32 }}>#{issue.number}</Text>
                    <Text style={{ flex: 1, fontSize: 12, color: C.text }} numberOfLines={1}>{issue.title}</Text>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: issue.state === 'open' ? '#30a46c' : '#8b949e', marginLeft: 6 }} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 번호/URL 직접 입력 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: C.text3, fontSize: 13 }}>#</Text>
            <TextInput style={{ flex: 1, fontSize: 13, color: C.text, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border } as any}
              value={num} onChangeText={handleUrl} placeholder="번호 또는 URL 붙여넣기" placeholderTextColor={C.text4}
              keyboardType="default" autoCapitalize="none" autoCorrect={false} />
          </View>

          <TouchableOpacity onPress={() => { if (repo && num) { onConfirm(repo, parseInt(num, 10)); onClose(); } }}
            style={{ backgroundColor: repo && num ? '#007AFF' : C.bg3, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: repo && num ? 1 : 0.4 }}>
            <Text style={{ color: repo && num ? '#fff' : C.text4, fontSize: 14, fontWeight: '700' }}>연결</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── LinkModal ─────────────────────────────────────────────
function LinkModal({ taskId, C, onClose, onConfirm }: {
  taskId: string; C: ThemeColors;
  onClose: () => void;
  onConfirm: (taskId: string, link: TaskLink) => void;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const canSubmit = url.trim().length > 0;
  const handleSubmit = () => {
    if (!canSubmit) return;
    const trimUrl = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
    const trimLabel = label.trim() || (() => { try { return new URL(trimUrl).hostname.replace('www.', ''); } catch { return trimUrl; } })();
    onConfirm(taskId, { url: trimUrl, label: trimLabel });
    onClose();
  };
  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }]} onPress={onClose}>
        <Pressable style={{ backgroundColor: C.bg2, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 12 }} onPress={() => {}}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>링크 추가</Text>
          <TextInput style={{ fontSize: 13, color: C.text, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border } as any}
            value={url} onChangeText={setUrl} placeholder="URL 입력 (예: notion.so/...)" placeholderTextColor={C.text4}
            autoCapitalize="none" autoCorrect={false} autoFocus keyboardType="url" />
          <TextInput style={{ fontSize: 13, color: C.text, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border } as any}
            value={label} onChangeText={setLabel} placeholder="라벨 (선택, 없으면 도메인 자동)" placeholderTextColor={C.text4} />
          <TouchableOpacity onPress={handleSubmit}
            style={{ backgroundColor: canSubmit ? '#007AFF' : C.bg3, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: canSubmit ? 1 : 0.4 }}>
            <Text style={{ color: canSubmit ? '#fff' : C.text4, fontSize: 14, fontWeight: '700' }}>추가</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── AddInput ──────────────────────────────────────────────
function AddInput({ depth, value, onChange, onSubmit, onCancel, C }: {
  depth: number; value: string; onChange: (v: string) => void;
  onSubmit: () => void; onCancel: () => void; C: ThemeColors;
}) {
  const indent = 12 + depth * 12;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: indent, paddingRight: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder, gap: 8 }}>
      <View style={{ width: 16 }} />
      <View style={{ width: 15, height: 15, borderRadius: 3, borderWidth: 1.5, borderColor: C.border2, backgroundColor: 'transparent' }} />
      <TextInput
        style={{ flex: 1, fontSize: depth === 0 ? 14 : 13, color: C.text, padding: 0, fontWeight: depth === 0 ? '600' : '400' } as any}
        value={value}
        onChangeText={onChange}
        autoFocus
        placeholder="제목 입력..."
        placeholderTextColor={C.text4}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        onBlur={() => { if (!value.trim()) onCancel(); }}
      />
      <TouchableOpacity onPress={onSubmit} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Ionicons name="checkmark-circle" size={18} color="#007AFF" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Ionicons name="close-circle" size={18} color={C.text4} />
      </TouchableOpacity>
    </View>
  );
}

// ─── IssueBadge ────────────────────────────────────────────
function IssueBadge({ issue, C, onRemove }: { issue: any; C: ThemeColors; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <View
      {...{ onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } as any}
      style={{ marginLeft: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: C.chipBg, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: C.chipBorder }}
    >
      <TouchableOpacity onPress={() => Linking.openURL(issueUrl(issue.github_repo, issue.github_issue_number))}>
        <Text style={{ fontSize: 10, color: C.text3, fontVariant: ['tabular-nums'] }}>#{issue.github_issue_number}</Text>
      </TouchableOpacity>
      {hovered && (
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 4, bottom: 4, left: 4, right: 2 }} style={{ marginLeft: 3 }}>
          <Ionicons name="close" size={9} color="#FF453A" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── LinkBadge ─────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s]+/g;
function parseNoteLinks(note: string | null): { text: string; links: TaskLink[] } {
  if (!note) return { text: '', links: [] };
  const links: TaskLink[] = [];
  const text = note.replace(URL_RE, (u) => { links.push({ url: u }); return ''; }).replace(/\s+/g, ' ').trim();
  return { text, links };
}

function linkMeta(url: string) {
  if (url.includes('github.com'))
    return { iconName: 'logo-github' as const, figma: false, color: '#aab4c0', bg: 'rgba(139,148,158,0.22)' };
  if (url.includes('slack.com') || url.includes('slack-edge.com'))
    return { iconName: 'logo-slack' as const, figma: false, color: '#E01E5A', bg: 'rgba(224,30,90,0.15)' };
  if (url.includes('figma.com'))
    return { iconName: null, figma: true, color: '#C084FC', bg: 'rgba(192,132,252,0.18)' };
  if (url.includes('docs.google.com'))
    return { iconName: 'grid-outline' as const, figma: false, color: '#34A853', bg: 'rgba(52,168,83,0.18)' };
  return { iconName: 'link-outline' as const, figma: false, color: '#8E8E93', bg: 'rgba(142,142,147,0.15)' };
}

function LinkBadge({ link }: { link: TaskLink; C: ThemeColors; onRemove: () => void }) {
  const meta = linkMeta(link.url);
  return (
    <TouchableOpacity onPress={() => Linking.openURL(link.url)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: meta.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, borderWidth: 1, borderColor: meta.color + '55', marginLeft: 3 }}>
        {meta.figma
          ? <FontAwesome5 name="figma" size={11} color={meta.color} />
          : <Ionicons name={meta.iconName!} size={11} color={meta.color} />
        }
      </View>
    </TouchableOpacity>
  );
}

// ─── Native HTML drag/drop helpers (React Native Web 이벤트 우회) ──
const DragDiv = ({ taskId, children }: { taskId: string; children: React.ReactNode }) =>
  React.createElement('div', {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/taskId', taskId);
      e.dataTransfer.effectAllowed = 'move';
    },
    style: { display: 'flex', flexDirection: 'column', cursor: 'grab' },
  }, children);

const ReorderDiv = ({ taskId, sectionKey, onReorder, onAdoptChild, children }: {
  taskId: string; sectionKey: string;
  onReorder: (draggedId: string, targetId: string, before: boolean) => void;
  onAdoptChild: (childId: string, parentId: string) => void;
  children: React.ReactNode;
}) => {
  const [ind, setInd] = React.useState<'before'|'after'|null>(null);
  return React.createElement('div', {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setInd(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setInd(null);
    },
    onDrop: (e: React.DragEvent) => {
      const draggedId      = e.dataTransfer.getData('text/taskId');
      const sourceSK       = e.dataTransfer.getData('text/sectionKey');
      const depth          = e.dataTransfer.getData('text/taskDepth');
      const draggedParentId = e.dataTransfer.getData('text/parentId');
      setInd(null);
      if (!draggedId || draggedId === taskId) return;
      if (depth === '1') {
        // 같은 부모의 자식이면 ChildReorderDiv가 처리 → 여기서 무시
        if (draggedParentId === taskId) return;
        e.preventDefault();
        e.stopPropagation();
        onAdoptChild(draggedId, taskId);
        return;
      }
      if (sourceSK === sectionKey) {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onReorder(draggedId, taskId, e.clientY < rect.top + rect.height / 2);
      }
    },
    style: {
      display: 'flex', flexDirection: 'column',
      userSelect: 'none', WebkitUserSelect: 'none',
      borderTop: ind === 'before' ? '2px solid rgba(0,122,255,0.8)' : '2px solid transparent',
      borderBottom: ind === 'after' ? '2px solid rgba(0,122,255,0.8)' : '2px solid transparent',
    },
  }, children);
};

const ChildReorderDiv = ({ taskId, parentId, onReorder, children }: {
  taskId: string; parentId: string;
  onReorder: (parentId: string, draggedId: string, targetId: string, before: boolean) => void;
  children: React.ReactNode;
}) => {
  const [ind, setInd] = React.useState<'before'|'after'|null>(null);
  return React.createElement('div', {
    onDragOver: (e: React.DragEvent) => {
      const depth = e.dataTransfer.types.includes('text/taskdepth')
        ? null : null; // types 접근용
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setInd(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setInd(null);
    },
    onDrop: (e: React.DragEvent) => {
      const draggedId = e.dataTransfer.getData('text/taskId');
      const draggedParent = e.dataTransfer.getData('text/parentId');
      setInd(null);
      if (!draggedId || draggedId === taskId) return;
      // 같은 부모의 자식끼리만 재정렬
      if (draggedParent !== parentId) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      onReorder(parentId, draggedId, taskId, e.clientY < rect.top + rect.height / 2);
    },
    style: {
      display: 'flex', flexDirection: 'column',
      userSelect: 'none', WebkitUserSelect: 'none',
      borderTop: ind === 'before' ? '2px solid rgba(0,122,255,0.8)' : '2px solid transparent',
      borderBottom: ind === 'after' ? '2px solid rgba(0,122,255,0.8)' : '2px solid transparent',
    },
  }, children);
};

const ColumnScroll = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingBottom: 60,
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    },
  }, children);

const DropZone = ({ rawMilestone, onDrop, onDropChild, children }: {
  rawMilestone: string | null;
  onDrop: (taskId: string, ms: string | null) => void;
  onDropChild: (childId: string, ms: string | null) => void;
  children: React.ReactNode;
}) => {
  const [over, setOver] = React.useState(false);
  return React.createElement('div', {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(false);
      const id = e.dataTransfer.getData('text/taskId');
      const depth = e.dataTransfer.getData('text/taskDepth');
      if (!id) return;
      if (depth === '1') {
        // 하위 태스크 → 상위 선택 모달 열기
        onDropChild(id, rawMilestone);
      } else {
        onDrop(id, rawMilestone);
      }
    },
    style: {
      flex: 1, display: 'flex', flexDirection: 'column',
      backgroundColor: over ? 'rgba(0,122,255,0.07)' : 'transparent',
      transition: 'background-color 0.12s',
    },
  }, children);
};

// ─── ChildMoveModal ────────────────────────────────────────
function ChildMoveModal({ childId, rawMilestone, tasks, C, onClose, onReparent, onCreateAndReparent }: {
  childId: string; rawMilestone: string | null; tasks: Task[]; C: ThemeColors;
  onClose: () => void;
  onReparent: (childId: string, parentId: string, ms: string | null) => void;
  onCreateAndReparent: (childId: string, title: string, ms: string | null, product: string | null) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const child = tasks.find((t) => t.id === childId);
  const roots = tasks.filter((t) => !t.parent_id &&
    (rawMilestone === null
      ? (!t.milestone || t.milestone === 'ETC')
      : t.milestone === rawMilestone)
  );
  const canSubmit = newTitle.trim().length > 0;
  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }]} onPress={onClose}>
        <Pressable style={{ backgroundColor: C.bg2, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 10 }} onPress={() => {}}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>상위 항목 선택</Text>
          <Text style={{ fontSize: 12, color: C.text3 }} numberOfLines={1}>이동: {child?.title}</Text>
          {roots.length > 0 && (
            <View style={{ gap: 6 }}>
              {roots.map((root) => (
                <TouchableOpacity key={root.id} onPress={() => { onReparent(childId, root.id, rawMilestone); onClose(); }}
                  style={{ padding: 10, borderRadius: 8, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontSize: 13, color: C.text }}>{root.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>새 상위 항목 만들기</Text>
          <TextInput
            style={{ fontSize: 13, color: C.text, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border } as any}
            value={newTitle} onChangeText={setNewTitle}
            placeholder="새 그룹 이름 입력..." placeholderTextColor={C.text4}
            autoFocus returnKeyType="done"
            onSubmitEditing={() => { if (canSubmit) { onCreateAndReparent(childId, newTitle.trim(), rawMilestone, child?.product ?? null); onClose(); } }}
          />
          <TouchableOpacity onPress={() => { if (canSubmit) { onCreateAndReparent(childId, newTitle.trim(), rawMilestone, child?.product ?? null); onClose(); } }}
            style={{ backgroundColor: canSubmit ? '#007AFF' : C.bg3, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: canSubmit ? 1 : 0.4 }}>
            <Text style={{ color: canSubmit ? '#fff' : C.text4, fontSize: 14, fontWeight: '700' }}>이동</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── AddSectionModal ───────────────────────────────────────
function AddSectionModal({ visible, onClose, onAdd, C, defaultMilestone }: {
  visible: boolean; onClose: () => void;
  onAdd: (product: string | null, milestone: string | null, title: string) => void;
  C: ThemeColors;
  defaultMilestone?: string | null;
}) {
  const [selProduct, setSelProduct] = useState<string | null>(PRODUCTS[0]);
  const [selMilestone, setSelMilestone] = useState<string | null>(defaultMilestone ?? MILESTONES[0]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (visible) {
      setSelMilestone(defaultMilestone ?? MILESTONES[0]);
      setTitle('');
    }
  }, [visible, defaultMilestone]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <Pressable
          style={{ position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: C.bg2, borderRadius: 16, padding: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}
          onPress={() => {}}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 16 }}>새 섹션 추가</Text>

          <Text style={{ fontSize: 11, color: C.text3, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>프로덕트</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {PRODUCTS.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setSelProduct(p)}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: selProduct === p ? (PRODUCT_DOT[p] ?? '#007AFF') + '22' : C.bg3, borderColor: selProduct === p ? (PRODUCT_DOT[p] ?? '#007AFF') + '66' : C.border }}
              >
                <Text style={{ fontSize: 12, color: selProduct === p ? (PRODUCT_DOT[p] ?? '#007AFF') : C.text3 }}>
                  {PRODUCT_EMOJI[p] ?? ''} {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: C.text3, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>마일스톤</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {MILESTONES.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setSelMilestone(m)}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: selMilestone === m ? (MILESTONE_DOT[m] ?? '#8E8E93') + '22' : C.bg3, borderColor: selMilestone === m ? (MILESTONE_DOT[m] ?? '#8E8E93') + '66' : C.border }}
              >
                <Text style={{ fontSize: 12, color: selMilestone === m ? (MILESTONE_DOT[m] ?? '#8E8E93') : C.text3 }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: C.text3, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>첫 번째 태스크</Text>
          <TextInput
            style={{ fontSize: 13, color: C.text, backgroundColor: C.bg3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border, marginBottom: 20 } as any}
            value={title}
            onChangeText={setTitle}
            placeholder="태스크 제목 입력..."
            placeholderTextColor={C.text4}
            autoFocus={false}
            returnKeyType="done"
            onSubmitEditing={() => { if (title.trim() && selProduct && selMilestone) { onAdd(selProduct, selMilestone, title.trim()); onClose(); } }}
          />
          <TouchableOpacity
            onPress={() => { if (title.trim()) { onAdd(selProduct, selMilestone, title.trim()); onClose(); } }}
            style={{ backgroundColor: title.trim() ? '#007AFF' : C.bg3, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: title.trim() ? 1 : 0.4 }}
          >
            <Text style={{ color: title.trim() ? '#fff' : C.text4, fontSize: 14, fontWeight: '700' }}>섹션 추가</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── OutlineRow ────────────────────────────────────────────
interface OutlineRowProps {
  task: Task;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  doneCount: number;
  totalChildren: number;
  isEditing: boolean;
  editValue: string;
  isEditingNote: boolean;
  noteValue: string;
  assignee: string;
  isEditingAssignee: boolean;
  assigneeValue: string;
  C: ThemeColors;
  today: string;
  onToggleDone: () => void;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onChangeEdit: (v: string) => void;
  onCommitEdit: () => void;
  onStartEditNote: () => void;
  onChangeNote: (v: string) => void;
  onCommitNote: () => void;
  onCancelNote: () => void;
  onStartEditAssignee: () => void;
  onChangeAssignee: (v: string) => void;
  onCommitAssignee: () => void;
  taskSectionKey?: string;
  links: TaskLink[];
  onRemoveIssue: (issueId: string) => void;
  onRemoveLink: (idx: number) => void;
  onAdd: () => void;
  onOpenMenu: (e: any) => void;
  folderSelectMode?: boolean;
  isBoardSelected?: boolean;
  onToggleBoardSelect?: () => void;
}

function OutlineRow({
  task, depth, isExpanded, hasChildren, doneCount, totalChildren,
  isEditing, editValue, isEditingNote, noteValue, assignee, isEditingAssignee, assigneeValue,
  C, today: t,
  onToggleDone, onToggleExpand,
  onStartEdit, onChangeEdit, onCommitEdit,
  onStartEditNote, onChangeNote, onCommitNote, onCancelNote,
  onStartEditAssignee, onChangeAssignee, onCommitAssignee,
  taskSectionKey, links, onRemoveIssue, onRemoveLink, onAdd, onOpenMenu,
  folderSelectMode, isBoardSelected, onToggleBoardSelect,
}: OutlineRowProps) {
  const [rowHovered, setRowHovered] = useState(false);
  const isDone = task.status === 'done';
  const issues = task.task_issues ?? [];
  const raw = task.due_date ?? task.start_date;
  const dateStr = raw ? raw.split('T')[0] : null;
  const dateParts = dateStr ? dateStr.split('-') : null;
  const m = dateParts?.[1];
  const dd = dateParts?.[2];
  const isPast = !!(dateStr && !isDone && dateStr < t);
  const isImminent = !!(dateStr && !isDone && !isPast && dateStr <= addWorkingDays(t, 2));
  const indent = 12 + depth * 12;
  const isGroup = depth === 0;
  const { text: noteText, links: noteLinks } = parseNoteLinks(task.note);
  const hasNote = !!(task.note && task.note.trim());
  const allLinks = [...noteLinks, ...links];

  // ── depth별 스타일 ──────────────────────────────────────────
  const rowPadV    = depth === 0 ? 9 : depth === 1 ? 6 : 5;
  const fontSize   = depth === 0 ? 14 : depth === 1 ? 13 : 12;
  const fontW: any = depth === 0 ? '600' : '400';
  const titleColor = isDone ? C.text3 : depth === 0 ? C.text : depth === 1 ? C.text2 : C.text3;
  const cbSize     = depth === 0 ? 15 : depth === 1 ? 14 : 13;
  const cbRadius   = depth === 0 ? 3 : 8;
  const cbBorder   = isDone ? '#30D158' : depth === 0 ? C.text3 : C.border2;
  const rowBg      = depth === 0
    ? (C.bg === '#161618' ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)')
    : 'transparent';

  return (
    <View
      {...{ onMouseEnter: () => setRowHovered(true), onMouseLeave: () => setRowHovered(false) } as any}
      style={{
        paddingLeft: indent, paddingRight: 12,
        paddingTop: rowPadV, paddingBottom: rowPadV,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder,
        backgroundColor: rowBg,
      }}>
      {/* Main row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Drag handle / 폴더 선택 체크박스 */}
        {folderSelectMode ? (
          <TouchableOpacity
            onPress={onToggleBoardSelect}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: '0 6px 0 0' } as any}
          >
            <View style={{
              width: 18, height: 18, borderRadius: 9,
              borderWidth: 1.5,
              borderColor: isBoardSelected ? '#5E5CE6' : 'rgba(142,142,147,0.5)',
              backgroundColor: isBoardSelected ? '#5E5CE6' : 'transparent',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {isBoardSelected && <Ionicons name="checkmark" size={11} color="#fff" />}
            </View>
          </TouchableOpacity>
        ) : React.createElement('div', {
          draggable: depth <= 1,
          onDragStart: depth <= 1 ? (e: any) => {
            e.dataTransfer.setData('text/taskId', task.id);
            e.dataTransfer.setData('text/taskDepth', String(depth));
            if (taskSectionKey) e.dataTransfer.setData('text/sectionKey', taskSectionKey);
            if (task.parent_id) e.dataTransfer.setData('text/parentId', task.parent_id);
            e.dataTransfer.effectAllowed = 'move';
          } : undefined,
          style: {
            cursor: depth <= 1 ? 'grab' : 'default',
            userSelect: 'none', touchAction: 'none',
            padding: '0 6px 0 0', color: '#636366', fontSize: 13,
            display: 'flex', alignItems: 'center', flexShrink: 0,
            visibility: depth <= 1 ? 'visible' : 'hidden',
          }
        }, '⠿')}
        {/* Expand chevron */}
        <TouchableOpacity
          onPress={hasChildren ? onToggleExpand : undefined}
          style={{ width: 18, alignItems: 'center', marginRight: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {hasChildren
            ? <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={11} color={C.text4} />
            : <View style={{ width: 11 }} />
          }
        </TouchableOpacity>

        {/* Flag dot */}
        {task.flag ? (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: task.flag === 'today' ? '#FF453A' : '#FFD60A', marginRight: 6, flexShrink: 0 }} />
        ) : null}

        {/* Checkbox */}
        <TouchableOpacity onPress={onToggleDone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 8 }}>
          <View style={{
            width: cbSize, height: cbSize,
            borderRadius: cbRadius,
            borderWidth: 1.5,
            borderColor: cbBorder,
            backgroundColor: isDone ? '#30D158' : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {isDone && <Ionicons name="checkmark" size={10} color="#fff" />}
          </View>
        </TouchableOpacity>

        {/* Title + inline memo */}
        <View style={{ flex: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isEditing ? (
            <TextInput
              style={{ flex: 1, fontSize: isGroup ? 14 : 13, color: C.text, padding: 0, fontWeight: isGroup ? '600' : '400' } as any}
              value={editValue} onChangeText={onChangeEdit} onBlur={onCommitEdit}
              autoFocus returnKeyType="done" onSubmitEditing={onCommitEdit}
            />
          ) : (
            <>
              <TouchableOpacity onPress={onStartEdit} style={{ flexShrink: 1 }}>
                <Text style={{ fontSize, color: titleColor, fontWeight: fontW, textDecorationLine: isDone ? 'line-through' : 'none', letterSpacing: -0.2 }} numberOfLines={1}>
                  {task.title}
                </Text>
              </TouchableOpacity>
              {/* Memo — editing or has content; hover shows icon */}
              {isEditingNote ? (
                <TextInput
                  style={{ flex: 1, fontSize: 11, color: C.text2, padding: 0, lineHeight: 15, outline: 'none' } as any}
                  value={noteValue} onChangeText={onChangeNote} onBlur={onCommitNote}
                  autoFocus placeholder="메모..." placeholderTextColor={C.text4}
                />
              ) : hasNote && noteText ? (
                <TouchableOpacity onPress={onStartEditNote} style={{ flexShrink: 1 }} activeOpacity={0.6}>
                  <Text style={{ fontSize: 11, color: C.text3, fontStyle: 'italic', lineHeight: 15 }} numberOfLines={1}>
                    {noteText}
                  </Text>
                </TouchableOpacity>
              ) : rowHovered ? (
                <TouchableOpacity onPress={onStartEditNote} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="create-outline" size={12} color={C.text4} />
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>


        {/* Link badges — 날짜 앞 */}
        {allLinks.map((link, i) => React.createElement(LinkBadge, {
          key: i,
          link,
          C,
          onRemove: () => { if (i >= noteLinks.length) onRemoveLink(i - noteLinks.length); },
        }))}

        {/* Issue badges */}
        {issues.map((issue) => React.createElement(IssueBadge, {
          key: issue.id,
          issue,
          C,
          onRemove: () => onRemoveIssue(issue.id),
        }))}

        {/* Due date */}
        {dateStr && (
          <Text style={{ fontSize: 11, color: isPast ? '#FF453A' : isImminent ? '#FF9F0A' : C.text2, fontVariant: ['tabular-nums'], marginLeft: 8, fontWeight: '500' }}>
            {m}/{dd}
          </Text>
        )}

        {/* Assignee */}
        {isEditingAssignee ? (
          <TextInput style={{ fontSize: 11, color: '#BF5AF2', marginLeft: 6, padding: 0, minWidth: 48, maxWidth: 80 } as any}
            value={assigneeValue} onChangeText={onChangeAssignee} onBlur={onCommitAssignee}
            autoFocus returnKeyType="done" onSubmitEditing={onCommitAssignee}
            placeholder="이름" placeholderTextColor={C.text4} />
        ) : assignee ? (
          <TouchableOpacity onPress={onStartEditAssignee} style={{ marginLeft: 6 }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Text style={{ fontSize: 11, color: '#BF5AF2' }}>@{assignee}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Add */}
        <TouchableOpacity onPress={onAdd} hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }} style={{ marginLeft: 6 }}>
          <Ionicons name="add" size={14} color={C.text4} />
        </TouchableOpacity>

        {/* Menu */}
        <TouchableOpacity onPress={onOpenMenu} hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}>
          <Ionicons name="ellipsis-horizontal" size={13} color={C.text4} />
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── WorkspaceView ─────────────────────────────────────────
export function WorkspaceView({ isLight, onSwitchMode, onToggleLight, userId, username, mode = 'work2', hideModeSwitch = false }: {
  isLight: boolean;
  onSwitchMode: () => void;
  onToggleLight: () => void;
  userId?: string;
  username?: string;
  mode?: string;
  hideModeSwitch?: boolean;
}) {
  const C = isLight ? LIGHT_C : DARK_C;
  const t = todayKST();


  const [tasks, setTasks] = useState<Task[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // 접힘 상태 복원
  useEffect(() => {
    AsyncStorage.getItem(`${mode}_collapsed`).then((v) => { if (v) setCollapsed(new Set(JSON.parse(v))); });
    AsyncStorage.getItem(`${mode}_collapsed_sections`).then((v) => { if (v) setCollapsedSections(new Set(JSON.parse(v))); });
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteInputValue, setNoteInputValue] = useState('');

  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null);
  const [assigneeInputValue, setAssigneeInputValue] = useState('');
  const [assignees, setAssignees] = useState<Record<string, string>>({});

  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [addValue, setAddValue] = useState('');

  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [calState,  setCalState]  = useState<CalState | null>(null);
  const [issueState, setIssueState] = useState<IssueState | null>(null);
  const [linkState,  setLinkState]  = useState<LinkState | null>(null);
  const [childMoveState, setChildMoveState] = useState<{ childId: string; rawMilestone: string | null } | null>(null);
  const [linkMap,    setLinkMap]    = useState<Record<string, TaskLink[]>>({});

  const [showAddSection, setShowAddSection] = useState(false);
  const [addSectionMilestone, setAddSectionMilestone] = useState<string | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(true);
  const [showIssueBrowser, setShowIssueBrowser] = useState(false);
  const [sectionOrders, setSectionOrders] = useState<Record<string, string[]>>({});
  const [childOrders, setChildOrders] = useState<Record<string, string[]>>({});

  // 보드 다중 선택 → 폴더 묶기
  const [folderSelectMode, setFolderSelectMode] = useState(false);
  const [boardSelected, setBoardSelected] = useState<Set<string>>(new Set());
  const [folderBarName, setFolderBarName] = useState('');
  const [folderBarCreating, setFolderBarCreating] = useState(false);
  const [flagFilter, setFlagFilter] = useState<'today' | 'tomorrow' | null>(null);

  // 웹 스크롤바 전역 숨김
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.id = 'flux-hide-scrollbar';
      style.textContent = '::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important;-ms-overflow-style:none!important}';
      if (!document.getElementById('flux-hide-scrollbar')) document.head.appendChild(style);
    }
  }, []);
  const [hiddenMilestones, setHiddenMilestones] = useState<Set<string>>(new Set());


  const toggleHideMilestone = (ms: string) => {
    setHiddenMilestones((prev) => {
      const next = new Set(prev);
      next.has(ms) ? next.delete(ms) : next.add(ms);
      return next;
    });
  };

  // Load assignees
  useEffect(() => {
    AsyncStorage.getItem(`${mode}_assignees`).then((v) => {
      if (v) setAssignees(JSON.parse(v));
    });
    AsyncStorage.getItem(`${mode}_section_orders`).then((v) => {
      if (v) setSectionOrders(JSON.parse(v));
    });
  }, []);

  const reparentTask = useCallback((childId: string, newParentId: string, newMilestone: string | null) => {
    const parent = tasks.find((t) => t.id === newParentId);
    const updates = { parent_id: newParentId, milestone: parent?.milestone ?? newMilestone, product: parent?.product };
    setTasks((prev) => {
      const next = prev.map((t) => t.id === childId ? { ...t, ...updates } : t);
      AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
      return next;
    });
    supabase.from('tasks').update({ parent_id: newParentId, milestone: parent?.milestone ?? newMilestone, product: parent?.product ?? undefined }).eq('id', childId).then(() => {});
  }, [tasks]);

  const createAndReparentTask = useCallback(async (childId: string, parentTitle: string, newMilestone: string | null, product: string | null) => {
    const tempId = uid();
    const now = new Date().toISOString();
    const newParent: Task = {
      id: tempId, mode, title: parentTitle, status: 'todo', type: 'task',
      product, milestone: newMilestone, parent_id: null,
      note: null, business: null, priority: null,
      start_date: null, due_date: null, end_date: null,
      checklist: [], created_at: now, updated_at: now,
      user_id: userId ?? null, task_issues: [],
    };
    setTasks((prev) => {
      const next = [...prev.map((t) => t.id === childId
        ? { ...t, parent_id: tempId, milestone: newMilestone, product }
        : t), newParent];
      AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
      return next;
    });
    // Supabase: insert parent (UUID 자동생성), 실제 id 받아서 교체
    const { data } = await supabase.from('tasks').insert({
      title: parentTitle, status: 'todo', type: 'task', mode,
      product, milestone: newMilestone, checklist: [], user_id: userId ?? null,
    }).select().single();
    if (data) {
      await supabase.from('tasks').update({ parent_id: data.id, milestone: newMilestone, product }).eq('id', childId);
      setTasks((prev) => {
        const next = prev.map((t) => {
          if (t.id === tempId) return { ...t, id: data.id, created_at: data.created_at, updated_at: data.updated_at };
          if (t.parent_id === tempId) return { ...t, parent_id: data.id };
          return t;
        });
        AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
        return next;
      });
    }
  }, [mode, userId]);

  const saveSectionOrder = useCallback((key: string, order: string[]) => {
    setSectionOrders((prev) => {
      const next = { ...prev, [key]: order };
      AsyncStorage.setItem(`${mode}_section_orders`, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleChildReorder = useCallback((parentId: string, draggedId: string, targetId: string, before: boolean) => {
    const order = childOrders[parentId] ?? [];
    const siblings = tasks
      .filter((t) => t.parent_id === parentId)
      .sort((a, b) => {
        const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return a.created_at.localeCompare(b.created_at);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    const ids = siblings.map((t) => t.id);
    const from = ids.indexOf(draggedId);
    if (from === -1) return;
    ids.splice(from, 1);
    let to = ids.indexOf(targetId);
    if (to === -1) return;
    if (!before) to++;
    ids.splice(to, 0, draggedId);
    setChildOrders((prev) => ({ ...prev, [parentId]: ids }));
    AsyncStorage.setItem(`child_order_${parentId}`, JSON.stringify(ids));
  }, [tasks, childOrders]);

  const handleReorder = useCallback((sectionKey: string, draggedId: string, targetId: string, before: boolean) => {
    const order = sectionOrders[sectionKey] ?? [];
    const secTasks = tasks
      .filter((t) => !t.parent_id && `${t.product ?? ''}::${t.milestone ?? 'ETC'}` === sectionKey)
      .sort((a, b) => {
        const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return a.created_at.localeCompare(b.created_at);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    const ids = secTasks.map((t) => t.id);
    const from = ids.indexOf(draggedId);
    if (from === -1) return;
    ids.splice(from, 1);
    let to = ids.indexOf(targetId);
    if (to === -1) return;
    if (!before) to++;
    ids.splice(to, 0, draggedId);
    saveSectionOrder(sectionKey, ids);
  }, [tasks, sectionOrders, saveSectionOrder]);

  const commitLink = (taskId: string, link: TaskLink) => {
    setLinkMap((prev) => {
      const newLinks = [...(prev[taskId] ?? []), link];
      const next = { ...prev, [taskId]: newLinks };
      supabase.from('tasks').update({ links: newLinks }).eq('id', taskId).then(() => {});
      return next;
    });
  };

  const saveAssignees = async (next: Record<string, string>) => {
    setAssignees(next);
    await AsyncStorage.setItem(`${mode}_assignees`, JSON.stringify(next));
  };

  // 캐시 + 상태 동시 업데이트 (Supabase 오프라인 대응)
  const updateLocalTask = useCallback((taskId: string, updates: Partial<Task>) => {
    setTasks((prev) => {
      const next = prev.map((tk) => tk.id === taskId ? { ...tk, ...updates, updated_at: new Date().toISOString() } : tk);
      AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
      return next;
    });
    const persist = async (retries = 3) => {
      const { error } = await supabase
        .from('tasks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error && retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return persist(retries - 1);
      }
    };
    persist();
  }, []);

  const handleDrop = useCallback((taskId: string, newMilestone: string | null) => {
    updateLocalTask(taskId, { milestone: newMilestone });
  }, [updateLocalTask]);

  // Seed function
  const runSeed = async () => {
    const ins = async (title: string, status: string, pid: string | null, ms: string, due: string | null) => {
      const { data, error } = await supabase.from('tasks').insert({
        title, status, type: 'task', mode: mode, product: '라이더앱',
        milestone: ms, parent_id: pid, due_date: due, checklist: [], user_id: userId,
      }).select('id').single();
      if (error) { alert('insert error: ' + error.message + ' | ' + JSON.stringify(error)); throw error; }
      return data?.id ?? null;
    };
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
    const g6 = await ins('상세 기획 및 논의', 'todo', null, 'v4.14', null);
    await ins('기사님 요청 사항 입력 시점', 'todo', g6, 'v4.14', null);
    await fetchTasks();
  };

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    const cacheKey = `flux_tasks_cache_${mode}_v2`;
    const deletedKey = `flux_deleted_${mode}_v2`;
    const [cached, deletedRaw] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(deletedKey),
    ]);
    const cachedTasks: Task[] = cached ? JSON.parse(cached) : [];
    const deletedIds = new Set<string>(deletedRaw ? JSON.parse(deletedRaw) : []);
    if (cachedTasks.length > 0) setTasks(cachedTasks);
    const { data: taskData, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('mode', mode)
      .eq('user_id', userId ?? null)
      .order('created_at', { ascending: true });
    if (taskError || !taskData) return;
    if (taskData.length === 0 && cachedTasks.length > 0) return;
    const taskIds = taskData.map((t) => t.id);
    const { data: issueData } = taskIds.length > 0
      ? await supabase.from('task_issues').select('*').in('task_id', taskIds)
      : { data: [] };
    const issuesByTaskId: Record<string, TaskIssue[]> = {};
    (issueData ?? []).forEach((issue) => {
      if (!issuesByTaskId[issue.task_id]) issuesByTaskId[issue.task_id] = [];
      issuesByTaskId[issue.task_id].push(issue);
    });
    // product가 null이거나 '기타'인데 task_issues가 있으면 repo로 자동 수정
    const toFix = taskData.filter(
      (t) => (!t.product || t.product === '기타') && (issuesByTaskId[t.id]?.length ?? 0) > 0
    );
    if (toFix.length > 0) {
      await Promise.all(
        toFix.map(async (task) => {
          const repo = issuesByTaskId[task.id][0].github_repo;
          const correctProduct = REPO_TO_PRODUCT[repo];
          if (correctProduct) {
            task.product = correctProduct;
            await supabase.from('tasks').update({ product: correctProduct }).eq('id', task.id);
          }
        })
      );
    }

    const cachedById = new Map(cachedTasks.map((t) => [t.id, t]));
    const supabaseById = new Map(taskData.map((t) => [t.id, t]));
    // 삭제된 ID는 Supabase에서 살아와도 제외
    const merged = taskData
      .filter((t) => !deletedIds.has(t.id) && !deletedIds.has(t.parent_id ?? ''))
      .map((task) => {
        const cached = cachedById.get(task.id);
        // 캐시가 더 최신이면 캐시 우선 (Supabase 저장 실패한 로컬 편집 보존)
        const base = (cached && cached.updated_at > task.updated_at) ? cached : task;
        return { ...base, task_issues: issuesByTaskId[task.id] ?? [] };
      });
    const localOnly = cachedTasks.filter((t) => !supabaseById.has(t.id) && !deletedIds.has(t.id));
    const final = [...merged, ...localOnly];
    setTasks(final);
    const initialLinkMap: Record<string, TaskLink[]> = {};
    final.forEach((t) => { if (t.links && t.links.length > 0) initialLinkMap[t.id] = t.links; });
    setLinkMap(initialLinkMap);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(final));
  }, [userId, mode]);

  useEffect(() => {
    fetchTasks();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('seed') === '1') {
      runSeed();
    }
  }, [fetchTasks]);

  const childrenMap = useMemo(() => buildChildrenMap(tasks), [tasks]);
  const sections = useMemo(() => deriveSections(tasks), [tasks]);
  const columns = useMemo(() => deriveColumns(sections), [sections]);
  const filteredColumns = useMemo(() => {
    const base = hiddenMilestones.size === 0 ? columns : columns.filter((c) => !hiddenMilestones.has(c.milestone));
    // addTarget이 아직 없는 마일스톤이면 임시 컬럼 추가
    if (addTarget && addTarget.parentId === null && addTarget.rawMilestone) {
      const exists = base.some((c) => c.rawMilestone === addTarget.rawMilestone);
      if (!exists) {
        const tempCol: Column = { milestone: addTarget.rawMilestone, rawMilestone: addTarget.rawMilestone, sections: [] };
        return [...base.filter(c => c.milestone !== '기타'), tempCol, base.find(c => c.milestone === '기타')!].filter(Boolean);
      }
    }
    return base;
  }, [columns, hiddenMilestones, addTarget]);

  // Toggle section collapse
  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      AsyncStorage.setItem(`${mode}_collapsed_sections`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem(`${mode}_collapsed`, JSON.stringify([...next]));
      return next;
    });
  };

  // Toggle done
  const toggleDone = (task: Task) => {
    updateLocalTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
  };

  // Edit title
  const startEdit = (task: Task) => { setEditingId(task.id); setEditValue(task.title); };
  const commitEdit = () => {
    if (!editingId) return;
    const val = editValue.trim();
    if (val) updateLocalTask(editingId, { title: val });
    setEditingId(null);
  };

  // Edit note
  const startEditNote = (task: Task) => { setEditingNoteId(task.id); setNoteInputValue(task.note ?? ''); };
  const commitNote = () => {
    if (!editingNoteId) return;
    updateLocalTask(editingNoteId, { note: noteInputValue.trim() || null });
    setEditingNoteId(null);
  };

  // Edit assignee
  const startEditAssignee = (id: string) => { setEditingAssigneeId(id); setAssigneeInputValue(assignees[id] ?? ''); };
  const commitAssignee = async () => {
    if (!editingAssigneeId) return;
    const val = assigneeInputValue.trim().replace(/^@/, '');
    const next = { ...assignees };
    if (val) next[editingAssigneeId] = val;
    else delete next[editingAssigneeId];
    await saveAssignees(next);
    setEditingAssigneeId(null);
  };

  // Date from calendar
  const commitDate = (taskId: string, dateStr: string) => {
    updateLocalTask(taskId, { due_date: dateStr || null });
    setCalState(null);
  };

  // Link issue
  const commitIssue = async (taskId: string, repo: string, num: number) => {
    const { data: issueData } = await supabase
      .from('task_issues')
      .insert({ task_id: taskId, github_repo: repo, github_issue_number: num })
      .select()
      .single();
    if (!issueData) return;
    setTasks((prev) => {
      const next = prev.map((tk) => tk.id === taskId
        ? { ...tk, task_issues: [...(tk.task_issues ?? []), issueData] }
        : tk);
      AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
      return next;
    });
  };

  // Add item
  const openAdd = (parentId: string | null, rawProduct: string | null, rawMilestone: string | null) => {
    setAddTarget({ parentId, rawProduct, rawMilestone });
    setAddValue('');
    if (parentId) setCollapsed((prev) => { const next = new Set(prev); next.delete(parentId); return next; });
    // 해당 마일스톤이 숨겨져 있으면 해제
    if (rawMilestone) {
      setHiddenMilestones((prev) => {
        if (!prev.has(rawMilestone)) return prev;
        const next = new Set(prev); next.delete(rawMilestone); return next;
      });
    }
  };

  const submitAdd = async () => {
    const title = addValue.trim();
    if (!title || !addTarget) { setAddTarget(null); return; }

    const newTask: Task = {
      id: uid(),
      mode: mode,
      title,
      status: 'todo',
      type: 'task',
      product: addTarget.rawProduct,
      milestone: addTarget.rawMilestone,
      parent_id: addTarget.parentId,
      note: null, business: null, priority: null,
      start_date: null, due_date: null, end_date: null,
      checklist: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: userId ?? null,
      task_issues: [],
    };

    const capturedTarget = addTarget;

    // 로컬 즉시 반영
    setTasks((prev) => {
      const next = [...prev, newTask];
      AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
      return next;
    });
    setAddTarget(null);
    setAddValue('');

    // Supabase 동기화 (id 없이 → UUID 자동 생성)
    const { data } = await supabase.from('tasks').insert({
      title, status: 'todo', type: 'task', mode: mode,
      parent_id: capturedTarget.parentId,
      product: capturedTarget.rawProduct,
      milestone: capturedTarget.rawMilestone,
      checklist: [],
      user_id: userId ?? null,
    }).select().single();

    if (data) {
      // 임시 ID → 실제 UUID 교체
      setTasks((prev) => {
        const next = prev.map((t) =>
          t.id === newTask.id
            ? { ...t, id: data.id, created_at: data.created_at, updated_at: data.updated_at }
            : t
        );
        AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
        return next;
      });
    }
  };

  // Delete
  const deleteTask = async (id: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('이 항목을 삭제할까요?')
      : true;
    if (!confirmed) return;
    // 로컬 즉시 반영 + 삭제 ID 기록 (새로고침 시에도 제외)
    setTasks((prev) => {
      const next = prev.filter((tk) => tk.id !== id && tk.parent_id !== id);
      AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
      return next;
    });
    const deletedKey = `flux_deleted_${mode}_v2`;
    AsyncStorage.getItem(deletedKey).then((raw) => {
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(id)) ids.push(id);
      AsyncStorage.setItem(deletedKey, JSON.stringify(ids));
    });
    // Supabase 삭제 (재시도)
    const del = async (retries = 3) => {
      const [r1, r2] = await Promise.all([
        supabase.from('tasks').delete().eq('parent_id', id),
        supabase.from('tasks').delete().eq('id', id),
      ]);
      if ((r1.error || r2.error) && retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return del(retries - 1);
      }
    };
    del();
  };

  // Recursive render
  const renderNode = (task: Task, depth: number, sectionKey?: string): React.ReactNode => {
    const order = childOrders[task.id] ?? [];
    const children = (childrenMap.get(task.id) ?? []).sort((a, b) => {
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return a.created_at.localeCompare(b.created_at);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    const hasChildren = children.length > 0;
    const isExpanded = !collapsed.has(task.id);
    const doneCount = children.filter((c) => c.status === 'done').length;
    const isAddingHere = addTarget?.parentId === task.id;

    const isBoardSelected = folderSelectMode && boardSelected.has(task.id);

    return (
      <View key={task.id} style={[
        isBoardSelected ? { backgroundColor: 'rgba(94,92,230,0.10)' } : {},
        Platform.OS === 'web' ? { userSelect: 'none' } as any : {},
      ]}>
        <OutlineRow
          task={task}
          depth={depth}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          doneCount={doneCount}
          totalChildren={children.length}
          isEditing={editingId === task.id}
          editValue={editValue}
          isEditingNote={editingNoteId === task.id}
          noteValue={noteInputValue}
          assignee={assignees[task.id] ?? ''}
          isEditingAssignee={editingAssigneeId === task.id}
          assigneeValue={assigneeInputValue}
          C={C}
          today={t}
          onToggleDone={() => toggleDone(task)}
          onToggleExpand={() => toggleExpand(task.id)}
          onStartEdit={() => startEdit(task)}
          onChangeEdit={setEditValue}
          onCommitEdit={commitEdit}
          onStartEditNote={() => startEditNote(task)}
          onChangeNote={setNoteInputValue}
          onCommitNote={commitNote}
          onCancelNote={() => setEditingNoteId(null)}
          onStartEditAssignee={() => startEditAssignee(task.id)}
          onChangeAssignee={setAssigneeInputValue}
          onCommitAssignee={commitAssignee}
          taskSectionKey={depth <= 1 ? sectionKey : undefined}
          links={linkMap[task.id] ?? []}
          onRemoveIssue={(issueId) => {
            supabase.from('task_issues').delete().eq('id', issueId).then(() => {});
            setTasks((prev) => {
              const next = prev.map((tk) => tk.id === task.id
                ? { ...tk, task_issues: (tk.task_issues ?? []).filter((i) => i.id !== issueId) }
                : tk);
              AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
              return next;
            });
          }}
          onRemoveLink={(idx) => {
            setLinkMap((prev) => {
              const links = (prev[task.id] ?? []).filter((_, i) => i !== idx);
              const next = { ...prev, [task.id]: links };
              supabase.from('tasks').update({ links }).eq('id', task.id).then(() => {});
              return next;
            });
          }}
          onAdd={() => openAdd(task.id, task.product, task.milestone)}
          onOpenMenu={(e) => {
            const px = e?.nativeEvent?.pageX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
            const py = e?.nativeEvent?.pageY ?? 200;
            setMenuState({ taskId: task.id, x: px, y: py });
          }}
          folderSelectMode={folderSelectMode}
          isBoardSelected={isBoardSelected}
          onToggleBoardSelect={() => setBoardSelected((prev) => {
            const next = new Set(prev);
            next.has(task.id) ? next.delete(task.id) : next.add(task.id);
            return next;
          })}
        />
        {isExpanded && children.map((child) => (
          <ChildReorderDiv
            key={child.id}
            taskId={child.id}
            parentId={task.id}
            onReorder={handleChildReorder}
          >
            {renderNode(child, depth + 1, sectionKey)}
          </ChildReorderDiv>
        ))}
        {isExpanded && isAddingHere && (
          <AddInput
            depth={depth + 1}
            value={addValue}
            onChange={setAddValue}
            onSubmit={submitAdd}
            onCancel={() => setAddTarget(null)}
            C={C}
          />
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 10 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.5 }}>Flux</Text>
        {(username || userId) && <Text style={{ fontSize: 12, color: C.text3 }}>@{username ?? userId?.slice(0, 8)}</Text>}

        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => {
            const rootIds = new Set(tasks.filter((tk) => !tk.parent_id).map((tk) => tk.id));
            const depth1Ids = tasks.filter((tk) => tk.parent_id && rootIds.has(tk.parent_id)).map((tk) => tk.id);
            setCollapsed(new Set(depth1Ids));
            AsyncStorage.setItem(`${mode}_collapsed`, JSON.stringify(depth1Ids));
          }}
          style={{ padding: 4 }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="chevron-up-circle-outline" size={16} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setCollapsed(new Set());
            AsyncStorage.setItem(`${mode}_collapsed`, JSON.stringify([]));
            setCollapsedSections(new Set());
            AsyncStorage.setItem(`${mode}_collapsed_sections`, JSON.stringify([]));
          }}
          style={{ padding: 4 }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="chevron-down-circle-outline" size={16} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleLight} style={{ padding: 4 }}>
          <Ionicons name={isLight ? 'moon-outline' : 'sunny-outline'} size={16} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ padding: 4 }}>
          <Ionicons name="log-out-outline" size={16} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS === 'web') {
              const date = new Date().toISOString().slice(0, 10);
              const json = JSON.stringify(tasks, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `flux_backup_${date}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }
          }}
          style={{ padding: 4 }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="download-outline" size={16} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (folderSelectMode) {
              setFolderSelectMode(false);
              setBoardSelected(new Set());
              setFolderBarName('');
            } else {
              setFolderSelectMode(true);
              setBoardSelected(new Set());
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: folderSelectMode ? '#5E5CE6' : '#5E5CE622', borderWidth: StyleSheet.hairlineWidth, borderColor: '#5E5CE688' }}
        >
          <Ionicons name="folder-outline" size={13} color={folderSelectMode ? '#fff' : '#5E5CE6'} />
          <Text style={{ fontSize: 12, color: folderSelectMode ? '#fff' : '#5E5CE6', fontWeight: '600' }}>묶기</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowIssueBrowser(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: '#5E5CE622', borderWidth: StyleSheet.hairlineWidth, borderColor: '#5E5CE688' }}
        >
          <Ionicons name="logo-github" size={13} color="#5E5CE6" />
          <Text style={{ fontSize: 12, color: '#5E5CE6', fontWeight: '600' }}>이슈</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setAddSectionMilestone(null); setShowAddSection(true); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: '#007AFF' }}
        >
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>섹션</Text>
        </TouchableOpacity>
      </View>

      {/* ── Content: Filter Sidebar + Multi-Column ── */}
      {tasks.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Ionicons name="layers-outline" size={48} color={C.text4} />
          <Text style={{ fontSize: 16, color: C.text3, fontWeight: '600' }}>업무 항목이 없어요</Text>
          <Text style={{ fontSize: 13, color: C.text4, textAlign: 'center' }}>위 '+ 섹션' 버튼으로{'\n'}앱별 버전 섹션을 만들어보세요</Text>
          <TouchableOpacity
            onPress={runSeed}
            style={{ marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bg3 }}
          >
            <Text style={{ fontSize: 13, color: C.text3 }}>🗂 샘플 데이터 불러오기</Text>
          </TouchableOpacity>
        </View>
      ) : (

        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Filter Sidebar ── */}
          <View style={{ width: showFilterPanel ? 100 : 28, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border, flexShrink: 0 }}>
            {/* Toggle button */}
            <TouchableOpacity
              onPress={() => setShowFilterPanel((p) => !p)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}
            >
              <Ionicons name={showFilterPanel ? 'funnel' : 'funnel-outline'} size={14} color={showFilterPanel ? '#007AFF' : C.text3} />
              {showFilterPanel && (
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>마일스톤</Text>
              )}
            </TouchableOpacity>

            {showFilterPanel && (
              <ScrollView contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 8 }} showsVerticalScrollIndicator={false}>
                {/* 마일스톤 필터 */}
                {columns.map((col) => {
                  const isVisible = !hiddenMilestones.has(col.milestone);
                  return (
                    <TouchableOpacity
                      key={col.milestone}
                      onPress={() => { setFlagFilter(null); toggleHideMilestone(col.milestone); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
                    >
                      <View style={{
                        width: 15, height: 15, borderRadius: 4, borderWidth: 1.5,
                        borderColor: isVisible ? C.text3 : C.border2,
                        backgroundColor: isVisible ? C.bg3 : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isVisible && <Ionicons name="checkmark" size={10} color={C.text3} />}
                      </View>
                      <Text style={{ fontSize: 12, color: isVisible ? C.text : C.text3 }}>{col.milestone}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ── Flag View ── */}
          {flagFilter && (() => {
            const flagged = tasks.filter((tk) => tk.flag === flagFilter && !tk.parent_id);
            const flagColor = flagFilter === 'today' ? '#FF453A' : '#FFD60A';
            const label = flagFilter === 'today' ? '오늘' : '내일';
            const grouped = flagged.reduce<Record<string, Task[]>>((acc, tk) => {
              const ms = tk.milestone ?? '기타';
              if (!acc[ms]) acc[ms] = [];
              acc[ms].push(tk);
              return acc;
            }, {});
            return (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 20 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: flagColor, marginBottom: 4 }}>{label} 할 일 {flagged.length}개</Text>
                {Object.entries(grouped).map(([ms, msTasks]) => (
                  <View key={ms} style={{ gap: 4 }}>
                    <Text style={{ fontSize: 11, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{ms}</Text>
                    {msTasks.map((tk) => (
                      <View key={tk.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.bg2, borderRadius: 8 }}>
                        <TouchableOpacity onPress={() => updateLocalTask(tk.id, { status: tk.status === 'done' ? 'todo' : 'done' })}>
                          <View style={{ width: 15, height: 15, borderRadius: 3, borderWidth: 1.5, borderColor: tk.status === 'done' ? '#30D158' : C.text3, backgroundColor: tk.status === 'done' ? '#30D158' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {tk.status === 'done' && <Ionicons name="checkmark" size={10} color="#fff" />}
                          </View>
                        </TouchableOpacity>
                        <Text style={{ flex: 1, fontSize: 13, color: tk.status === 'done' ? C.text3 : C.text, textDecorationLine: tk.status === 'done' ? 'line-through' : 'none' }} numberOfLines={1}>{tk.title}</Text>
                        <TouchableOpacity onPress={() => updateLocalTask(tk.id, { flag: null })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: flagColor }} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ))}
                {flagged.length === 0 && (
                  <Text style={{ fontSize: 13, color: C.text4 }}>{label}로 표시한 항목이 없어요</Text>
                )}
              </ScrollView>
            );
          })()}

          {/* ── Columns ── */}
          {!flagFilter && <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ alignItems: 'stretch' }}
          >
            {filteredColumns.map((col) => {
              const isEtc = col.milestone === '기타';
              const colRootTasks = tasks.filter((tk) => !tk.parent_id && (isEtc ? (!tk.milestone || tk.milestone === 'ETC') : tk.milestone === col.rawMilestone));
              const colDone = countDeep(colRootTasks, childrenMap, 'done');
              const colAll  = countDeep(colRootTasks, childrenMap, 'all');

              return (
                <DropZone key={col.milestone} rawMilestone={isEtc ? null : col.rawMilestone} onDrop={handleDrop} onDropChild={(cid, ms) => setChildMoveState({ childId: cid, rawMilestone: ms })}>
                <View style={{ width: 634, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border, flex: 1 }}>
                    {/* Column Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)', gap: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isEtc ? C.text3 : C.text, letterSpacing: -0.2 }}>
                        {col.milestone}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity
                        onPress={() => { setAddSectionMilestone(isEtc ? null : col.rawMilestone); setShowAddSection(true); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={{ marginLeft: 4 }}
                      >
                        <Ionicons name="add" size={16} color={C.text4} />
                      </TouchableOpacity>
                    </View>

                    {/* Column Sections */}
                    <ColumnScroll>
                      {col.sections.map((section) => {
                        const secOrder = sectionOrders[section.key] ?? [];
                        const sectionTasks = tasks
                          .filter((tk) => !tk.parent_id && tk.product === section.rawProduct && tk.milestone === section.rawMilestone)
                          .sort((a, b) => {
                            const ai = secOrder.indexOf(a.id), bi = secOrder.indexOf(b.id);
                            if (ai === -1 && bi === -1) return a.created_at.localeCompare(b.created_at);
                            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                          });

                        const isCollapsed = collapsedSections.has(section.key);
                        const totalDone = countDeep(sectionTasks, childrenMap, 'done');
                        const totalAll = countDeep(sectionTasks, childrenMap, 'all');
                        const productColor = PRODUCT_DOT[section.product] ?? C.text3;
                        const isAddingHere = addTarget?.parentId === null &&
                          addTarget?.rawProduct === section.rawProduct &&
                          addTarget?.rawMilestone === section.rawMilestone;

                        return (
                          <View key={section.key}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 14, paddingVertical: 8, backgroundColor: isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, borderLeftWidth: 3, borderLeftColor: productColor, gap: 8 }}>
                              <View style={{ width: 11 }} />
                              <TouchableOpacity onPress={() => toggleSection(section.key)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={12} color={C.text4} />
                              </TouchableOpacity>
                              <Text style={{ fontSize: 11, color: productColor, fontWeight: '700', letterSpacing: 0.3 }}>
                                {PRODUCT_EMOJI[section.product] ?? ''} {PRODUCT_SHORT[section.product] ?? section.product}
                              </Text>
                              <View style={{ flex: 1 }} />
                              <TouchableOpacity
                                onPress={() => openAdd(null, section.rawProduct, section.rawMilestone)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                style={{ marginLeft: 6 }}
                              >
                                <Ionicons name="add" size={16} color={C.text4} />
                              </TouchableOpacity>
                            </View>

                            {!isCollapsed && (
                              <View>
                                {sectionTasks.map((task) => (
                                  <ReorderDiv
                                    key={task.id}
                                    taskId={task.id}
                                    sectionKey={section.key}
                                    onReorder={(dId, tId, before) => handleReorder(section.key, dId, tId, before)}
                                    onAdoptChild={(cid, pid) => reparentTask(cid, pid, col.rawMilestone)}
                                  >
                                    {renderNode(task, 0, section.key)}
                                  </ReorderDiv>
                                ))}
                                {isAddingHere && (
                                  <AddInput
                                    depth={0}
                                    value={addValue}
                                    onChange={setAddValue}
                                    onSubmit={submitAdd}
                                    onCancel={() => setAddTarget(null)}
                                    C={C}
                                  />
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}

                      {/* 기타 컬럼 빈 상태 */}
                      {isEtc && col.sections.length === 0 && !addTarget && (
                        <View style={{ paddingHorizontal: 14, paddingVertical: 20, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: C.text4 }}>드래그해서 옮겨오세요</Text>
                        </View>
                      )}

                      {/* 새 섹션 AddInput — 아직 존재하지 않는 product+milestone 조합 */}
                      {(() => {
                        if (!addTarget || addTarget.parentId !== null) return null;
                        const milestoneMatch = isEtc
                          ? addTarget.rawMilestone === null
                          : addTarget.rawMilestone === col.rawMilestone;
                        if (!milestoneMatch) return null;
                        const sectionExists = col.sections.some(s => s.rawProduct === addTarget.rawProduct);
                        if (sectionExists) return null; // 기존 섹션에서 처리
                        const productColor = PRODUCT_DOT[addTarget.rawProduct ?? ''] ?? C.text3;
                        return (
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 8 }}>
                              <Text style={{ fontSize: 11, color: productColor, fontWeight: '700' }}>
                                {PRODUCT_EMOJI[addTarget.rawProduct ?? ''] ?? ''} {PRODUCT_SHORT[addTarget.rawProduct ?? ''] ?? addTarget.rawProduct ?? '기타'}
                              </Text>
                            </View>
                            <AddInput
                              depth={0}
                              value={addValue}
                              onChange={setAddValue}
                              onSubmit={submitAdd}
                              onCancel={() => setAddTarget(null)}
                              C={C}
                            />
                          </View>
                        );
                      })()}
                    </ColumnScroll>
                  </View>
                </DropZone>
              );
            })}

            {/* Add Column */}
            <TouchableOpacity
              onPress={() => { setAddSectionMilestone(null); setShowAddSection(true); }}
              style={{ width: 160, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.4 }}
            >
              <Ionicons name="add-circle-outline" size={28} color={C.text3} />
              <Text style={{ fontSize: 12, color: C.text3 }}>마일스톤 추가</Text>
            </TouchableOpacity>
          </ScrollView>}
        </View>
      )}

      {/* ── Add Section Modal ── */}
      <AddSectionModal
        visible={showAddSection}
        onClose={() => setShowAddSection(false)}
        onAdd={async (product, milestone, title) => {
          const tempId = uid();
          const newTask: Task = {
            id: tempId, mode: mode, title, status: 'todo', type: 'task',
            product, milestone, parent_id: null,
            note: null, business: null, priority: null,
            start_date: null, due_date: null, end_date: null,
            checklist: [], created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(), user_id: userId ?? null, task_issues: [],
          };
          setTasks((prev) => {
            const next = [...prev, newTask];
            AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
            return next;
          });
          const { data } = await supabase.from('tasks').insert({
            title, status: 'todo', type: 'task', mode: mode,
            product, milestone, checklist: [], user_id: userId ?? null,
          }).select().single();
          if (data) {
            setTasks((prev) => {
              const next = prev.map((t) =>
                t.id === tempId ? { ...t, id: data.id, created_at: data.created_at, updated_at: data.updated_at } : t
              );
              AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
              return next;
            });
          }
        }}
        C={C}
        defaultMilestone={addSectionMilestone}
      />

      {/* ── Mini Menu ── */}
      {menuState && (() => {
        const task = tasks.find((tk) => tk.id === menuState.taskId);
        if (!task) return null;
        return (
          <MiniMenu
            x={menuState.x} y={menuState.y} task={task} C={C}
            onClose={() => setMenuState(null)}
            onSetDate={() => setCalState({ taskId: task.id, anchorY: menuState.y })}
            onEditNote={() => startEditNote(task)}
            onLinkIssue={() => {
              const PRODUCT_REPO: Record<string, string> = {
                '라이더앱':   'hkmc-airlab/shucle-rider',
                '택시기사앱': 'hkmc-airlab/shucle-taxidriver-product',
                '드라이버앱': 'hkmc-airlab/shucle-DriverVehicle-product',
              };
              const defaultRepo = (task.product && PRODUCT_REPO[task.product]) ?? '';
              setIssueState({ taskId: task.id, repo: defaultRepo, num: '' });
            }}
            onAddLink={() => setLinkState({ taskId: task.id })}
            onSetFlag={(flag) => updateLocalTask(task.id, { flag })}
            onDelete={() => deleteTask(task.id)}
          />
        );
      })()}

      {/* ── Calendar ── */}
      {calState && (() => {
        const task = tasks.find((tk) => tk.id === calState.taskId);
        if (!task) return null;
        return (
          <MiniCalendar
            value={task.due_date?.split('T')[0] ?? ''}
            onChange={(v) => commitDate(task.id, v)}
            onClose={() => setCalState(null)}
            anchorY={calState.anchorY}
          />
        );
      })()}

      {/* ── Issue Input ── */}
      {issueState && (
        <IssueInputModal
          state={issueState} C={C}
          onClose={() => setIssueState(null)}
          onConfirm={(repo, num) => commitIssue(issueState.taskId, repo, num)}
        />
      )}

      {/* ── Child Move Modal ── */}
      {childMoveState && (
        <ChildMoveModal
          childId={childMoveState.childId}
          rawMilestone={childMoveState.rawMilestone}
          tasks={tasks}
          C={C}
          onClose={() => setChildMoveState(null)}
          onReparent={reparentTask}
          onCreateAndReparent={createAndReparentTask}
        />
      )}

      {/* ── Link Modal ── */}
      {linkState && (
        <LinkModal
          taskId={linkState.taskId} C={C}
          onClose={() => setLinkState(null)}
          onConfirm={commitLink}
        />
      )}

      {/* ── Issue Browser ── */}
      {showIssueBrowser && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowIssueBrowser(false)}>
          <IssueBrowser
            C={C}
            milestones={[...MILESTONES, 'v4.13', 'v4.14', 'v4.15'].filter((v, i, a) => a.indexOf(v) === i)}
            defaultMilestone={MILESTONES[0]}
            tasks={tasks}
            myUsername={username}
            onLinkIssue={async (taskId, repo, num) => { await commitIssue(taskId, repo, num); }}
            onCreateTask={async (title, product, milestone, repo, issueNum) => {
              const { data } = await supabase.from('tasks').insert({
                mode, title, status: 'todo', type: 'task',
                product, milestone, parent_id: null, note: null, business: null,
                priority: null, start_date: null, due_date: null, end_date: null,
                checklist: [], user_id: userId ?? null,
              }).select().single();
              if (data) {
                const { data: issueRow } = await supabase
                  .from('task_issues')
                  .insert({ task_id: data.id, github_repo: repo, github_issue_number: issueNum })
                  .select()
                  .single();
                const withIssue = { ...data, task_issues: issueRow ? [issueRow] : [] };
                setTasks((prev) => {
                  const next = [...prev, withIssue];
                  AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
                  return next;
                });
              }
            }}
            onCreateFolder={async (folderTitle, issues, milestone) => {
              const products = [...new Set(issues.map((i) => i.product))];
              const product = products.length === 1 ? products[0] : null;
              // 1. 부모(폴더) task 생성
              const { data: parent } = await supabase.from('tasks').insert({
                mode, title: folderTitle, status: 'todo', type: 'task',
                product, milestone, parent_id: null, note: null, business: null,
                priority: null, start_date: null, due_date: null, end_date: null,
                checklist: [], user_id: userId ?? null,
              }).select().single();
              if (!parent) return;
              const newTasks: Task[] = [{ ...parent, task_issues: [] }];
              // 2. 자식 tasks + 이슈 연결
              for (const issue of issues) {
                const { data: child } = await supabase.from('tasks').insert({
                  mode, title: issue.title, status: 'todo', type: 'task',
                  product: issue.product, milestone, parent_id: parent.id,
                  note: null, business: null, priority: null,
                  start_date: null, due_date: null, end_date: null,
                  checklist: [], user_id: userId ?? null,
                }).select().single();
                if (child) {
                  const { data: issueRow } = await supabase
                    .from('task_issues')
                    .insert({ task_id: child.id, github_repo: issue.repo, github_issue_number: issue.issueNum })
                    .select().single();
                  newTasks.push({ ...child, task_issues: issueRow ? [issueRow] : [] });
                }
              }
              setTasks((prev) => {
                const next = [...prev, ...newTasks];
                AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
                return next;
              });
            }}
            onClose={() => setShowIssueBrowser(false)}
          />
        </Modal>
      )}

      {/* ── 폴더 묶기 플로팅 바 ── */}
      {folderSelectMode && boardSelected.size > 0 && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: C.card,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
          zIndex: 100,
        }}>
          <TextInput
            style={{
              flex: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
              fontSize: 13, borderWidth: 1.5, borderColor: '#5E5CE688',
              backgroundColor: C.input, color: C.text,
            }}
            value={folderBarName}
            onChangeText={setFolderBarName}
            placeholder={`폴더명 입력... (${boardSelected.size}개 선택됨)`}
            placeholderTextColor={C.text3}
          />
          <TouchableOpacity
            onPress={() => { setFolderSelectMode(false); setBoardSelected(new Set()); setFolderBarName(''); }}
          >
            <Text style={{ fontSize: 13, color: C.text3, paddingHorizontal: 8 }}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              if (!folderBarName.trim() || folderBarCreating) return;
              setFolderBarCreating(true);
              const selectedTasks = tasks.filter((t) => boardSelected.has(t.id));
              const products = [...new Set(selectedTasks.map((t) => t.product).filter(Boolean))];
              const milestones = [...new Set(selectedTasks.map((t) => t.milestone).filter(Boolean))];
              const product = products.length === 1 ? products[0] : null;
              const milestone = milestones.length === 1 ? milestones[0] : (milestones[0] ?? null);
              // 부모 task 생성
              const { data: parent } = await supabase.from('tasks').insert({
                mode, title: folderBarName.trim(), status: 'todo', type: 'task',
                product, milestone, parent_id: null,
                note: null, business: null, priority: null,
                start_date: null, due_date: null, end_date: null,
                checklist: [], user_id: userId ?? null,
              }).select().single();
              if (parent) {
                // 선택한 태스크들의 parent_id 업데이트
                const ids = [...boardSelected];
                await supabase.from('tasks').update({ parent_id: parent.id }).in('id', ids);
                setTasks((prev) => {
                  const next = [
                    { ...parent, task_issues: [] } as Task,
                    ...prev.map((t) => boardSelected.has(t.id) ? { ...t, parent_id: parent.id } : t),
                  ];
                  AsyncStorage.setItem(`flux_tasks_cache_${mode}_v2`, JSON.stringify(next));
                  return next;
                });
              }
              setFolderBarCreating(false);
              setFolderSelectMode(false);
              setBoardSelected(new Set());
              setFolderBarName('');
            }}
            style={{
              backgroundColor: folderBarName.trim() ? '#5E5CE6' : C.bg3,
              borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8,
              opacity: folderBarCreating ? 0.5 : 1,
            }}
            disabled={!folderBarName.trim() || folderBarCreating}
          >
            {folderBarCreating
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ fontSize: 13, color: folderBarName.trim() ? '#fff' : C.text3, fontWeight: '600' }}>폴더 생성</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
