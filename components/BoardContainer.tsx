import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Modal, TextInput, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, Board, IssueBoardConfig } from '../lib/supabase';
import { ThemeColors, DARK_C, LIGHT_C, PRODUCTS, MILESTONES } from '../lib/constants';
import { WorkspaceView } from './WorkspaceView';
import { IssueBoardView } from './IssueBoardView';

type Props = {
  isLight: boolean;
  onToggleLight: () => void;
  userId: string;
  username?: string;
  onSwitchMode: () => void;
};

const ISSUE_MILESTONES = ['v4.11', 'v4.12', 'v4.13', 'v4.14', 'v4.15'];
const ISSUE_PRODUCTS = ['라이더앱', '택시기사앱', '드라이버앱', '키오스크'];

function NewBoardModal({
  C,
  onClose,
  onSave,
}: {
  C: ThemeColors;
  onClose: () => void;
  onSave: (name: string, type: 'task' | 'issue', config: any) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'task' | 'issue'>('issue');
  const [selProducts, setSelProducts] = useState<string[]>(['라이더앱', '택시기사앱']);
  const [selMilestones, setSelMilestones] = useState<string[]>(['v4.13']);
  const [saving, setSaving] = useState(false);

  const toggleProduct = (p: string) =>
    setSelProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  const toggleMilestone = (m: string) =>
    setSelMilestones((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const config = type === 'task'
      ? { mode: `board_${Date.now()}` }
      : { products: selProducts, milestones: selMilestones };
    await onSave(name.trim(), type, config);
    setSaving(false);
  };

  const s = modalStyles(C);

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>새 보드</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={20} color={C.text3} /></TouchableOpacity>
          </View>

          <Text style={s.label}>보드 이름</Text>
          <TextInput
            style={s.input}
            placeholder="예: v4.13 이슈 보드"
            placeholderTextColor={C.text3}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={s.label}>타입</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {(['task', 'issue'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[s.typeBtn, type === t && s.typeBtnActive]}
              >
                <Ionicons
                  name={t === 'task' ? 'grid-outline' : 'logo-github'}
                  size={14}
                  color={type === t ? '#0A84FF' : C.text3}
                />
                <Text style={[s.typeBtnText, type === t && { color: '#0A84FF' }]}>
                  {t === 'task' ? '태스크 보드' : 'GitHub 이슈 보드'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {type === 'issue' && (
            <>
              <Text style={s.label}>마일스톤</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {ISSUE_MILESTONES.map((m) => {
                  const on = selMilestones.includes(m);
                  return (
                    <TouchableOpacity key={m} onPress={() => toggleMilestone(m)} style={[s.chip, on && s.chipActive]}>
                      <Text style={[s.chipText, on && s.chipTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>프로덕트</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {ISSUE_PRODUCTS.map((p) => {
                  const on = selProducts.includes(p);
                  return (
                    <TouchableOpacity key={p} onPress={() => toggleProduct(p)} style={[s.chip, on && s.chipActive]}>
                      <Text style={[s.chipText, on && s.chipTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.saveBtn, (!name.trim() || saving) && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveBtnText}>만들기</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function BoardContainer({ isLight, onToggleLight, userId, username, onSwitchMode }: Props) {
  const C = isLight ? LIGHT_C : DARK_C;
  const [boards, setBoards] = useState<Board[]>([]);
  const [selBoardId, setSelBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const loadBoards = useCallback(async () => {
    const { data } = await supabase
      .from('boards')
      .select('*')
      .eq('user_id', userId)
      .order('position');
    let list: Board[] = data ?? [];

    // 처음 진입 시 기존 work2 보드를 자동 생성
    if (list.length === 0) {
      const { data: created } = await supabase
        .from('boards')
        .insert({ user_id: userId, name: '내 보드', type: 'task', config: { mode: 'work2' }, position: 0 })
        .select('*');
      list = created ?? [];
    }

    setBoards(list);
    if (list.length > 0 && !selBoardId) setSelBoardId(list[0].id);
    setLoading(false);
  }, [userId, selBoardId]);

  useEffect(() => { loadBoards(); }, []);

  const createBoard = async (name: string, type: 'task' | 'issue', config: any) => {
    const position = boards.length;
    const { data } = await supabase
      .from('boards')
      .insert({ user_id: userId, name, type, config, position })
      .select('*')
      .single();
    if (data) {
      setBoards((prev) => [...prev, data as Board]);
      setSelBoardId(data.id);
    }
    setShowNew(false);
  };

  const deleteBoard = async (id: string) => {
    if (boards.length <= 1) return;
    if (!window.confirm('이 보드를 삭제할까요?')) return;
    await supabase.from('boards').delete().eq('id', id);
    const next = boards.filter((b) => b.id !== id);
    setBoards(next);
    if (selBoardId === id) setSelBoardId(next[0]?.id ?? null);
  };

  const selBoard = boards.find((b) => b.id === selBoardId) ?? null;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.text3} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 보드 탭 바 */}
      <View style={[tabBarStyles.bar, { backgroundColor: C.bg2, borderBottomColor: C.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabBarStyles.tabs}>
          {boards.map((b) => {
            const active = b.id === selBoardId;
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => setSelBoardId(b.id)}
                onLongPress={() => deleteBoard(b.id)}
                style={[tabBarStyles.tab, active && tabBarStyles.tabActive]}
              >
                <Ionicons
                  name={b.type === 'issue' ? 'logo-github' : 'grid-outline'}
                  size={12}
                  color={active ? '#0A84FF' : C.text3}
                />
                <Text style={[tabBarStyles.tabText, { color: active ? '#0A84FF' : C.text3 }, active && tabBarStyles.tabTextActive]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setShowNew(true)}
            style={tabBarStyles.addTab}
          >
            <Ionicons name="add" size={16} color={C.text3} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 보드 본문 */}
      {selBoard?.type === 'task' && (
        <WorkspaceView
          isLight={isLight}
          onSwitchMode={onSwitchMode}
          onToggleLight={onToggleLight}
          userId={userId}
          username={username}
          mode={(selBoard.config as any).mode ?? 'work2'}
          hideModeSwitch
        />
      )}
      {selBoard?.type === 'issue' && (
        <IssueBoardView
          C={C}
          config={selBoard.config as IssueBoardConfig}
          userId={userId}
        />
      )}

      {showNew && (
        <NewBoardModal C={C} onClose={() => setShowNew(false)} onSave={createBoard} />
      )}
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 2,
    paddingBottom: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(10,132,255,0.1)',
    borderBottomWidth: 2,
    borderBottomColor: '#0A84FF',
  },
  tabText: { fontSize: 13 },
  tabTextActive: { fontWeight: '600' },
  addTab: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
});

const modalStyles = (C: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 14, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  label: { fontSize: 12, color: C.text3, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: C.input, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.text, marginBottom: 16,
  },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, flex: 1, justifyContent: 'center',
  },
  typeBtnActive: { backgroundColor: '#0A84FF22', borderColor: '#0A84FF88' },
  typeBtnText: { fontSize: 13, color: C.text3 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.bg3,
  },
  chipActive: { backgroundColor: '#0A84FF22', borderColor: '#0A84FF88' },
  chipText: { fontSize: 12, color: C.text3 },
  chipTextActive: { color: '#0A84FF', fontWeight: '600' },
  saveBtn: { backgroundColor: '#0A84FF', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
