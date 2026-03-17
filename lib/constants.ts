import { Task, TaskType, ChecklistItem } from './supabase';

// ─── 타입 ──────────────────────────────────────────────────
export type AppMode    = 'work' | 'personal';
export type TimeView   = 'all' | 'monthly' | 'weekly' | 'daily';
export type SortKey    = 'product' | 'milestone' | 'type' | 'title' | 'status' | 'business' | null;
export type SortDir    = 'asc' | 'desc';
export type FilterMap  = Partial<Record<'product' | 'milestone' | 'type' | 'status' | 'business', string>>;
export type DraftIssue = { id: string; repo: string; number: string };

// ─── 테마 ──────────────────────────────────────────────────
export const DARK_C  = { bg:'#161618', bg2:'#1C1C1E', bg3:'#2C2C2E', card:'#1C1C1E', border:'#38383A', border2:'#48484A', text:'#FFFFFF', text2:'rgba(235,235,245,0.72)', text3:'#8E8E93', text4:'#48484A', input:'#2C2C2E', rowBorder:'#2C2C2E', searchBg:'#2C2C2E', labelColor:'#8E8E93', chipBg:'#2C2C2E', chipBorder:'#48484A', chipText:'rgba(235,235,245,0.72)' };
export const LIGHT_C = { bg:'#F2F2F7', bg2:'#FFFFFF', bg3:'#F2F2F7', card:'#FFFFFF', border:'#C6C6C8', border2:'#E5E5EA', text:'#000000', text2:'rgba(60,60,67,0.72)', text3:'#8E8E93', text4:'#C7C7CC', input:'#FFFFFF', rowBorder:'#E5E5EA', searchBg:'#FFFFFF', labelColor:'#8E8E93', chipBg:'#E5E5EA', chipBorder:'#D1D1D6', chipText:'rgba(60,60,67,0.85)' };
export type ThemeColors = typeof DARK_C;

// ─── 상수 ──────────────────────────────────────────────────
export const PRODUCTS   = ['라이더앱', '택시기사앱', '드라이버앱'];
export const MILESTONES = ['v4.10', 'v4.11', 'v4.12', 'TBD', 'ETC'];
export const BUSINESSES = ['사업A', '사업B', '사업C', '내부개선'];

export const PRIORITIES: { label: string; value: Task['priority'] }[] = [
  { label: 'P0', value: 'urgent' },
  { label: 'P1', value: 'high' },
  { label: 'P2', value: 'medium' },
];
export const STATUSES: { label: string; value: Task['status'] }[] = [
  { label: 'to-do',       value: 'todo' },
  { label: 'in-progress', value: 'in_progress' },
  { label: 'in-confirm',  value: 'in_confirm' },
  { label: 'done',        value: 'done' },
];
export const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo:        { label: 'to-do',       color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.28)' },
  in_progress: { label: 'in-progress', color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.28)'  },
  in_confirm:  { label: 'in-confirm',  color: '#C084FC', bg: 'rgba(192,132,252,0.10)', border: 'rgba(192,132,252,0.28)' },
  done:        { label: 'done',        color: '#4ADE80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.28)'  },
};

export const COL = { product: 90, milestone: 68, type: 90, status: 110, issue: 80 };
export const PANEL_WIDTH = 300;

// 프로덕트/마일스톤 dot 색상 (chip은 중립 배경, dot만 컬러)
export const PRODUCT_DOT: Record<string, string> = {
  '라이더앱':   '#007AFF', // 파
  '택시기사앱': '#34C759', // 초
  '드라이버앱': '#FFD60A', // 노
};
export const MILESTONE_DOT: Record<string, string> = {
  'v4.10': '#FF9500', // 오렌지
  'v4.11': '#00C7BE', // 틸
  'v4.12': '#5856D6', // 인디고
  'TBD':   '#8E8E93', // 회색
  'ETC':   '#636366', // 진회색
};

export const CHECKLIST_ITEMS = ['이슈 등록', 'figma 기획', '싱크 w/서비스기획', '싱크 w/디자인개발', 'md 업데이트'];
export const CHECKLIST_BY_TYPE: Record<TaskType, string[]> = {
  feature:   ['이슈 등록', 'figma 기획', '싱크 w/서비스기획', '싱크 w/디자인개발', 'md 업데이트'],
  task:      ['이슈 등록', '싱크 w/서비스기획', '싱크 w/디자인개발', 'md 업데이트'],
  milestone: ['이슈 등록', '하위 아이템 정의', '진행률 모니터링', '완료 검토'],
  research:  ['이슈 등록', '리서치 진행', '결과 정리', '공유 싱크', 'md 업데이트'],
  schedule:  [],
  etc:       [],
};
export const ALL_DEFAULT_CHECKLIST_ITEMS = [...new Set(Object.values(CHECKLIST_BY_TYPE).flat())];

export const TASK_TYPES: { value: TaskType; label: string; short: string; color: string; bg: string }[] = [
  { value: 'feature',   label: 'Feature',   short: 'F', color: '#007AFF', bg: 'rgba(0,122,255,0.12)'    },
  { value: 'task',      label: 'Task',       short: 'T', color: '#FF9500', bg: 'rgba(255,149,0,0.12)'    },
  { value: 'milestone', label: 'Milestone',  short: 'M', color: '#30D158', bg: 'rgba(48,209,88,0.12)'    },
  { value: 'research',  label: 'Research',   short: 'R', color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)'   },
  { value: 'schedule',  label: 'Schedule',   short: 'S', color: '#5AC8FA', bg: 'rgba(90,200,250,0.12)'   },
  { value: 'etc',       label: 'Etc',        short: 'E', color: '#8E8E93', bg: 'rgba(142,142,147,0.12)'  },
];
export const SELECTABLE_TYPES = TASK_TYPES.filter((t) => t.value !== 'etc');

export const TIME_VIEWS: { value: TimeView; label: string }[] = [
  { value: 'all',     label: '전체' },
  { value: 'monthly', label: '월' },
  { value: 'weekly',  label: '주' },
  { value: 'daily',   label: '일' },
];

// ─── 유틸 함수 ─────────────────────────────────────────────
export function uid()      { return Math.random().toString(36).slice(2); }
export function today()    { return new Date().toISOString().split('T')[0]; }
export function fmtDate(d: string | null | undefined)    { if (!d) return ''; return d.split('T')[0]; }
export function fmtDisplay(d: string | null | undefined) {
  if (!d) return '—';
  const s = d.split('T')[0];
  const [y, m, dd] = s.split('-');
  return `${y}.${m}.${dd}`;
}

export function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(mon), end: fmt(sun) };
}

export function isInTimeView(task: { due_date: string | null; start_date: string | null }, view: TimeView): boolean {
  if (view === 'all') return true;
  const ref = task.due_date ?? task.start_date;
  if (!ref) return false;
  const d = ref.split('T')[0];
  const t = today();
  if (view === 'daily')   return d === t;
  if (view === 'weekly')  { const { start, end } = getWeekRange(); return d >= start && d <= end; }
  if (view === 'monthly') return d.slice(0, 7) === t.slice(0, 7);
  return true;
}

export function initChecklist(raw: any, type?: TaskType): ChecklistItem[] {
  const defaults = type ? (CHECKLIST_BY_TYPE[type] ?? []) : CHECKLIST_ITEMS;
  const arr: any[] = Array.isArray(raw) ? raw : [];
  const isOld = arr.length > 0 && typeof arr[0] === 'string';
  const savedMap = new Map<string, ChecklistItem>(
    isOld
      ? (arr as string[]).map((label) => [label, { label, enabled: true, done: true }])
      : (arr as ChecklistItem[]).map((it) => [it.label, it])
  );
  const predefined = defaults.map((label) => {
    const saved = savedMap.get(label);
    savedMap.delete(label);
    return saved ?? { label, enabled: true, done: false };
  });
  const custom = [...savedMap.values()].filter((it) => !ALL_DEFAULT_CHECKLIST_ITEMS.includes(it.label));
  return [...predefined, ...custom];
}
