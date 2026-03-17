import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../lib/supabase';
import { today, STATUS_META, TASK_TYPES } from '../lib/constants';
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
