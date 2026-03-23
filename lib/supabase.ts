import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://krstbimbdjzxgnlzktjm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtyc3RiaW1iZGp6eGdubHprdGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTAxNTcsImV4cCI6MjA4OTAyNjE1N30.Ue0wHCh68FTNm6UBXA4pGDmNOD8bDu2PF4BMSBw2KRA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type TaskLink = {
  url: string;
  label?: string;
};

export type TaskIssue = {
  id: string;
  task_id: string;
  github_repo: string;
  github_issue_number: number;
  created_at: string;
};

export type TaskType = 'feature' | 'task' | 'milestone' | 'research' | 'etc' | 'schedule';

export type ChecklistItem = {
  label: string;
  enabled: boolean;  // 이 태스크에서 해당 항목이 적용되는지
  done: boolean;     // 완료 여부
};

export type Task = {
  id: string;
  mode: 'work' | 'personal';
  title: string;
  note: string | null;
  milestone: string | null;
  product: string | null;
  business: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | null;
  type: TaskType;
  status: 'todo' | 'in_progress' | 'in_confirm' | 'done';
  start_date: string | null;
  due_date: string | null;
  end_date: string | null;
  checklist: ChecklistItem[];
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  task_issues?: TaskIssue[];
};
