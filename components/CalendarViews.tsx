import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../lib/supabase';
import { today, todayKST, STATUS_META, TASK_TYPES, ThemeColors } from '../lib/constants';
import { styles } from '../lib/styles';

const WEEK_DAYS  = ['월', '화', '수', '목', '금', '토', '일'];
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// ─── 월간 캘린더 ───────────────────────────────────────────
export function MonthCalendar({ tasks, year, month, onPrev, onNext, onSelectTask, mode, onAdd, onDatePress }: {
  tasks: Task[];
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onSelectTask: (task: Task) => void;
  mode: string | null;
  onAdd: () => void;
  onDatePress: (date: string) => void;
}) {
  const firstDow    = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr    = today();

  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    if (!t.due_date) return;
    const d = t.due_date.split('T')[0];
    const [ty, tm] = d.split('-').map(Number);
    if (ty === year && tm - 1 === month) {
      if (!tasksByDate[d]) tasksByDate[d] = [];
      tasksByDate[d].push(t);
    }
  });

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.calNavRow}>
        <TouchableOpacity onPress={onPrev} style={styles.calNavBtn}>
          <Ionicons name="chevron-back" size={16} color="#888" />
        </TouchableOpacity>
        <Text style={styles.calNavTitle}>{year}년 {month + 1}월</Text>
        <TouchableOpacity onPress={onNext} style={styles.calNavBtn}>
          <Ionicons name="chevron-forward" size={16} color="#888" />
        </TouchableOpacity>
        <View style={styles.calNavActions}>
          <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.calWeekHeader}>
        {WEEK_DAYS.map((d, i) => (
          <View key={d} style={styles.calWeekCell}>
            <Text style={[styles.calWeekLabel, i >= 5 && styles.calWeekLabelWeekend]}>{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((day, di) => {
            if (!day) return <View key={`e-${wi}-${di}`} style={styles.calCell} />;
            const dateStr  = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTasks = tasksByDate[dateStr] || [];
            const isToday  = dateStr === todayStr;
            const isWeekend = di >= 5;
            return (
              <TouchableOpacity key={day}
                style={[styles.calCell, isWeekend && styles.calCellWeekend, isToday && styles.calCellToday]}
                onPress={() => onDatePress(dateStr)} activeOpacity={0.7}>
                <Text style={[styles.calDayNum, isWeekend && styles.calDayWeekend, isToday && styles.calDayNumToday]}>
                  {day}
                </Text>
                {(() => {
                  const milestones = dayTasks.filter(t => t.type === 'schedule');
                  const regulars   = dayTasks.filter(t => t.type !== 'milestone');
                  return <>
                    {milestones.map(t => (
                      <TouchableOpacity key={t.id} onPress={() => onSelectTask(t)} style={styles.calMilestoneBanner}>
                        <Text style={styles.calMilestoneText} numberOfLines={1}>◆ {t.title}</Text>
                      </TouchableOpacity>
                    ))}
                    {regulars.slice(0, 3).map(t => {
                      const sm = STATUS_META[t.status];
                      return (
                        <TouchableOpacity key={t.id} onPress={() => onSelectTask(t)} style={[styles.calTaskChip, { backgroundColor: sm.bg }]}>
                          <Text style={[styles.calTaskText, { color: sm.color }]} numberOfLines={1}>{t.title}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {regulars.length > 3 && <Text style={styles.calMore}>+{regulars.length - 3}</Text>}
                  </>;
                })()}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── 주간 뷰 ───────────────────────────────────────────────
export function WeekView({ tasks, weekStart, onPrev, onNext, onSelectTask, mode, onAdd, onDatePress }: {
  tasks: Task[];
  weekStart: string;
  onPrev: () => void;
  onNext: () => void;
  onSelectTask: (task: Task) => void;
  mode: string | null;
  onAdd: () => void;
  onDatePress: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
  const todayStr = today();
  const [sm, em] = [days[0], days[6]].map((d) => { const [, m, dd] = d.split('-'); return `${parseInt(m)}/${parseInt(dd)}`; });
  const wsDate = new Date(weekStart);
  const wMonth = wsDate.getMonth() + 1;
  const weekOrdinals = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
  const weekNum = Math.ceil(wsDate.getDate() / 7);
  const weekLabel = `${wMonth}월 ${weekOrdinals[weekNum - 1] ?? weekNum + '번째'}주`;

  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    if (!t.due_date) return;
    const d = t.due_date.split('T')[0];
    if (days.includes(d)) {
      if (!tasksByDate[d]) tasksByDate[d] = [];
      tasksByDate[d].push(t);
    }
  });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.calNavRow}>
        <TouchableOpacity onPress={onPrev} style={styles.calNavBtn}>
          <Ionicons name="chevron-back" size={16} color="#888" />
        </TouchableOpacity>
        <Text style={styles.calNavTitle}>{weekLabel} <Text style={{ color: '#555', fontSize: 11, fontWeight: '400' }}>({sm} – {em})</Text></Text>
        <TouchableOpacity onPress={onNext} style={styles.calNavBtn}>
          <Ionicons name="chevron-forward" size={16} color="#888" />
        </TouchableOpacity>
        <View style={styles.calNavActions}>
          <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.calWeekHeader}>
        {WEEK_DAYS.map((d, i) => (
          <View key={d} style={styles.calWeekCell}>
            <Text style={[styles.calWeekLabel, i >= 5 && styles.calWeekLabelWeekend]}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.calRow}>
        {days.map((dateStr, di) => {
          const day = parseInt(dateStr.split('-')[2]);
          const dayTasks  = tasksByDate[dateStr] || [];
          const isToday   = dateStr === todayStr;
          const isWeekend = di >= 5;
          return (
            <TouchableOpacity key={dateStr}
              style={[styles.calCell, styles.weekCell, isWeekend && styles.calCellWeekend, isToday && styles.calCellToday]}
              onPress={() => onDatePress(dateStr)} activeOpacity={0.7}>
              <Text style={[styles.calDayNum, isWeekend && styles.calDayWeekend, isToday && styles.calDayNumToday]}>
                {day}
              </Text>
              {(() => {
                const milestones = dayTasks.filter(t => t.type === 'schedule');
                const regulars   = dayTasks.filter(t => t.type !== 'milestone');
                return <>
                  {milestones.map(t => (
                    <TouchableOpacity key={t.id} onPress={(e) => { e.stopPropagation?.(); onSelectTask(t); }} style={styles.calMilestoneBanner}>
                      <Text style={styles.calMilestoneText} numberOfLines={1}>◆ {t.title}</Text>
                    </TouchableOpacity>
                  ))}
                  {regulars.map(t => {
                    const sm = STATUS_META[t.status];
                    return (
                      <TouchableOpacity key={t.id} onPress={(e) => { e.stopPropagation?.(); onSelectTask(t); }} style={[styles.calTaskChip, { backgroundColor: sm.bg }]}>
                        <Text style={[styles.calTaskText, { color: sm.color }]} numberOfLines={1}>{t.title}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>;
              })()}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── 일간 뷰 ───────────────────────────────────────────────
export function DayView({ tasks, day, onPrev, onNext, onSelectTask, mode, onAdd }: {
  tasks: Task[];
  day: string;
  onPrev: () => void;
  onNext: () => void;
  onSelectTask: (task: Task) => void;
  mode: string | null;
  onAdd: () => void;
}) {
  const dayTasks = tasks.filter((t) => t.due_date?.split('T')[0] === day);
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const isWeekend = dow === 0 || dow === 6;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.calNavRow}>
        <TouchableOpacity onPress={onPrev} style={styles.calNavBtn}>
          <Ionicons name="chevron-back" size={16} color="#888" />
        </TouchableOpacity>
        <Text style={[styles.calNavTitle, isWeekend && styles.calDayWeekend]}>
          {m}월 {d}일 ({DOW_LABELS[dow]})
        </Text>
        <TouchableOpacity onPress={onNext} style={styles.calNavBtn}>
          <Ionicons name="chevron-forward" size={16} color="#888" />
        </TouchableOpacity>
        <View style={styles.calNavActions}>
          <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {dayTasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>마감 항목 없음</Text>
        </View>
      ) : (
        <FlatList
          data={dayTasks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: t }) => {
            const sm = STATUS_META[t.status];
            return (
              <TouchableOpacity onPress={() => onSelectTask(t)} style={styles.tableRow}>
                <View style={styles.tableCellFlex}>
                  <Text style={styles.cellTitle}>{t.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: sm.bg }]}>
                    <Text style={[styles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

// ─── 일정 캘린더 ───────────────────────────────────────────
export function ScheduleView({ tasks, onSelectTask, onAdd, C }: {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onAdd: () => void;
  C: ThemeColors;
}) {
  const todayStr = todayKST();
  const todayMs  = Date.parse(todayStr);

  const daysUntil = (dateStr: string) =>
    Math.ceil((Date.parse(dateStr.split('T')[0]) - todayMs) / 86400000);

  const dLabel = (d: number) =>
    d < 0 ? `D+${Math.abs(d)}` : d === 0 ? '오늘' : `D-${d}`;

  // schedule 이벤트: due_date 있는 것만, 날짜 오름차순
  const scheduleEvents = tasks
    .filter(t => t.type === 'schedule' && t.due_date)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  const allWorkTasks = tasks.filter(t => t.type !== 'schedule');

  // milestone별 같은 마일스톤 schedule 이벤트 목록 (그룹핑용)
  const eventsByMs: Record<string, Task[]> = {};
  scheduleEvents.forEach(se => {
    const key = se.milestone ?? '__none__';
    if (!eventsByMs[key]) eventsByMs[key] = [];
    eventsByMs[key].push(se);
  });

  // 각 schedule 이벤트에 속하는 미완료 태스크 계산
  const grouped = scheduleEvents.map(se => {
    const msKey  = se.milestone ?? '__none__';
    const seDate = se.due_date!.split('T')[0];
    const sameMsEvents = eventsByMs[msKey] ?? [];
    const idx    = sameMsEvents.findIndex(s => s.id === se.id);
    const prevDate = idx > 0 ? sameMsEvents[idx - 1].due_date!.split('T')[0] : null;
    const firstUpcomingId = sameMsEvents.find(s => s.due_date!.split('T')[0] >= todayStr)?.id;

    const related = allWorkTasks.filter(t => {
      if (t.status === 'done') return false;
      if ((t.milestone ?? '__none__') !== msKey) return false;
      if (t.due_date) {
        const td = t.due_date.split('T')[0];
        return td <= seDate && (!prevDate || td > prevDate);
      }
      // due_date 없으면 → 마일스톤의 첫 번째 다가오는 이벤트에 배정
      return firstUpcomingId === se.id;
    });

    // 진행률: 같은 milestone 완료 태스크 / 전체
    const msTotal = allWorkTasks.filter(t => (t.milestone ?? '__none__') === msKey).length;
    const msDone  = allWorkTasks.filter(t => (t.milestone ?? '__none__') === msKey && t.status === 'done').length;

    return { event: se, tasks: related, msTotal, msDone };
  });

  // 어떤 schedule 이벤트에도 속하지 않는 미완료 태스크
  const scheduledIds = new Set(grouped.flatMap(g => g.tasks.map(t => t.id)));
  const unscheduled  = allWorkTasks.filter(t => !scheduledIds.has(t.id) && t.status !== 'done');

  // 오늘 마감 / 기한 초과
  const urgent = allWorkTasks.filter(
    t => t.status !== 'done' && t.due_date && t.due_date.split('T')[0] <= todayStr
  );

  const urgencyColor = (td: string | null): string => {
    if (!td) return C.text4;
    const d = daysUntil(td);
    if (d <= 0)  return '#FF3B30';
    if (d <= 3)  return '#FF6961';
    if (d <= 7)  return '#FF9500';
    if (d <= 14) return '#FFCC00';
    return C.text3;
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* 탑바 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: C.text, flex: 1 }}>일정 캘린더</Text>
        <TouchableOpacity onPress={onAdd}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#007AFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={{ fontSize: 12, color: '#fff', fontWeight: '500' }}>추가</Text>
        </TouchableOpacity>
      </View>

      {/* 오늘 마감 / 기한 초과 배너 */}
      {urgent.length > 0 && (
        <View style={{ backgroundColor: 'rgba(255,59,48,0.07)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,59,48,0.25)', paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#FF3B30', marginBottom: 6 }}>
            오늘 마감 / 기한 초과 ({urgent.length})
          </Text>
          {urgent.map(t => (
            <TouchableOpacity key={t.id} onPress={() => onSelectTask(t)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30' }} />
              <Text style={{ fontSize: 13, color: C.text, flex: 1 }} numberOfLines={1}>{t.title}</Text>
              <Text style={{ fontSize: 11, color: '#FF3B30', fontVariant: ['tabular-nums'] }}>
                {t.due_date!.split('T')[0].substring(5).replace('-', '/')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 빈 상태 */}
      {scheduleEvents.length === 0 && (
        <View style={{ padding: 48, alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 22, color: '#5AC8FA' }}>◆</Text>
          <Text style={{ fontSize: 15, color: C.text2, fontWeight: '600' }}>등록된 일정이 없어요</Text>
          <Text style={{ fontSize: 13, color: C.text3, textAlign: 'center', lineHeight: 20 }}>
            태스크를 추가할 때 타입을 Schedule로{'\n'}설정하면 여기에 일정이 표시돼요
          </Text>
        </View>
      )}

      {/* Schedule 이벤트 섹션 */}
      {grouped.map(({ event: se, tasks: seTasks, msTotal, msDone }) => {
        const days   = daysUntil(se.due_date!.split('T')[0]);
        const isPast = days < 0;
        const dColor = isPast ? C.text4 : days <= 3 ? '#FF3B30' : days <= 7 ? '#FF9500' : days <= 14 ? '#FFCC00' : '#5AC8FA';
        const prog   = msTotal > 0 ? msDone / msTotal : 0;

        return (
          <View key={se.id} style={{ marginTop: 14 }}>
            {/* 이벤트 헤더 */}
            <TouchableOpacity onPress={() => onSelectTask(se)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.bg2, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
              <Text style={{ fontSize: 14, color: '#5AC8FA', fontWeight: '700', marginRight: 6 }}>◆</Text>
              <Text style={{ fontSize: 14, color: C.text, fontWeight: '600', flex: 1 }}>{se.title}</Text>
              {se.milestone && (
                <View style={{ backgroundColor: C.bg3, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 }}>
                  <Text style={{ fontSize: 10, color: C.text3 }}>{se.milestone}</Text>
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '600', color: dColor, fontVariant: ['tabular-nums'] }}>
                {dLabel(days)}
              </Text>
              <Text style={{ fontSize: 12, color: C.text4, marginLeft: 4, fontVariant: ['tabular-nums'] }}>
                · {se.due_date!.split('T')[0].substring(5).replace('-', '/')}
              </Text>
            </TouchableOpacity>

            {/* 진행률 */}
            {msTotal > 0 && (
              <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, backgroundColor: C.bg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: C.text4 }}>{msDone} / {msTotal} 완료</Text>
                  <Text style={{ fontSize: 11, color: prog === 1 ? '#30D158' : C.text4 }}>{Math.round(prog * 100)}%</Text>
                </View>
                <View style={{ height: 3, backgroundColor: C.bg3, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: 3, width: `${prog * 100}%` as any, backgroundColor: prog === 1 ? '#30D158' : '#007AFF', borderRadius: 2 }} />
                </View>
              </View>
            )}

            {/* 태스크 없음 */}
            {seTasks.length === 0 && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: C.text4, fontStyle: 'italic' }}>이 일정에 연결된 태스크 없음</Text>
              </View>
            )}

            {/* 태스크 목록 */}
            {[...seTasks]
              .sort((a, b) => {
                if (!a.due_date && !b.due_date) return 0;
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return a.due_date.localeCompare(b.due_date);
              })
              .map(t => {
                const td      = t.due_date ? t.due_date.split('T')[0] : null;
                const taskDays = td ? daysUntil(td) : null;
                const uc      = urgencyColor(td);
                const sm_meta = STATUS_META[t.status];
                return (
                  <TouchableOpacity key={t.id} onPress={() => onSelectTask(t)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder, gap: 8 }}>
                    <Text style={{ fontSize: 11, color: uc, width: 36, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: (taskDays !== null && taskDays <= 3) ? '600' : '400' }}>
                      {taskDays !== null ? dLabel(taskDays) : '미정'}
                    </Text>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: uc }} />
                    <Text style={{ fontSize: 13, color: t.status === 'in_confirm' ? C.text3 : C.text, flex: 1 }} numberOfLines={1}>
                      {t.title}
                    </Text>
                    {t.product && (
                      <Text style={{ fontSize: 10, color: C.text3 }}>
                        {t.product.replace('앱', '').replace('기사', '')}
                      </Text>
                    )}
                    <View style={{ backgroundColor: sm_meta.bg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: sm_meta.color }}>{sm_meta.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>
        );
      })}

      {/* 일정 미분류 */}
      {unscheduled.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.bg2, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
            <Text style={{ fontSize: 12, color: C.text3 }}>일정 미분류</Text>
            <Text style={{ fontSize: 11, color: C.text4, marginLeft: 4 }}>({unscheduled.length})</Text>
          </View>
          {unscheduled.map(t => {
            const sm_meta = STATUS_META[t.status];
            return (
              <TouchableOpacity key={t.id} onPress={() => onSelectTask(t)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowBorder, gap: 8 }}>
                <Text style={{ fontSize: 13, color: C.text, flex: 1 }} numberOfLines={1}>{t.title}</Text>
                {t.milestone && <Text style={{ fontSize: 11, color: C.text4 }}>{t.milestone}</Text>}
                <View style={{ backgroundColor: sm_meta.bg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, color: sm_meta.color }}>{sm_meta.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── 미니 캘린더 (스플릿뷰용) ─────────────────────────────────
export function SplitCalendar({ tasks, year, month, selectedDate, onSelectDate, onPrev, onNext, C }: {
  tasks: Task[];
  year: number;
  month: number;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  C: ThemeColors;
}) {
  const todayStr    = todayKST();
  const firstDow    = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const countByDate: Record<string, number> = {};
  tasks.forEach((t) => {
    const ref = t.due_date ?? t.start_date;
    if (!ref) return;
    const d = ref.split('T')[0];
    const [ty, tm] = d.split('-').map(Number);
    if (ty === year && tm - 1 === month) countByDate[d] = (countByDate[d] || 0) + 1;
  });

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{ padding: 12, backgroundColor: C.bg2, borderRadius: 12 }}>
      {/* 월 네비 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <TouchableOpacity onPress={onPrev} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={15} color={C.text3} />
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{year}년 {month + 1}월</Text>
        <TouchableOpacity onPress={onNext} style={{ padding: 4 }}>
          <Ionicons name="chevron-forward" size={15} color={C.text3} />
        </TouchableOpacity>
      </View>
      {/* 요일 헤더 */}
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
          <View key={d} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: i >= 5 ? '#FF6B6B' : C.text3, fontWeight: '500' }}>{d}</Text>
          </View>
        ))}
      </View>
      {/* 날짜 그리드 */}
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((day, di) => {
            if (!day) return <View key={`e-${wi}-${di}`} style={{ flex: 1, height: 36 }} />;
            const dateStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday   = dateStr === todayStr;
            const isSel     = dateStr === selectedDate;
            const cnt       = countByDate[dateStr] || 0;
            const isWeekend = di >= 5;
            return (
              <TouchableOpacity
                key={day}
                onPress={() => onSelectDate(dateStr)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSel ? '#007AFF' : isToday ? 'rgba(0,122,255,0.15)' : 'transparent',
                }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: isSel || isToday ? '700' : '400',
                    color: isSel ? '#fff' : isToday ? '#007AFF' : isWeekend ? '#FF6B6B' : C.text,
                  }}>{day}</Text>
                </View>
                {cnt > 0 && (
                  <View style={{ flexDirection: 'row', gap: 1.5, marginTop: 1 }}>
                    {Array.from({ length: Math.min(cnt, 3) }).map((_, i) => (
                      <View key={i} style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: isSel ? '#fff8' : '#007AFF88' }} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
