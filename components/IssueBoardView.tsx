import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../lib/constants';
import { IssueBoardConfig } from '../lib/supabase';
import { PRODUCT_REPO_MAP, fetchIssuesByMilestone, GitHubIssueDetail } from '../lib/github';

type Props = {
  C: ThemeColors;
  config: IssueBoardConfig;
};

type Column = {
  product: string;
  issues: GitHubIssueDetail[];
};

export function IssueBoardView({ C, config }: Props) {
  const { products, milestones } = config;
  const [selMilestone, setSelMilestone] = useState(milestones[0] ?? '');
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

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
    setColumns(results);
    setLoading(false);
    setFetched(true);
  }, [products]);

  useEffect(() => {
    if (selMilestone) loadIssues(selMilestone);
  }, [selMilestone, loadIssues]);

  const s = styles(C);
  const totalCount = columns.reduce((n, c) => n + c.issues.length, 0);

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
        {fetched && !loading && (
          <Text style={s.totalBadge}>{totalCount}개</Text>
        )}
        {loading && <ActivityIndicator size="small" color={C.text3} style={{ marginRight: 16 }} />}
      </View>

      {/* 칸반 보드 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={s.board}>
          {columns.map((col) => (
            <View key={col.product} style={s.column}>
              {/* 컬럼 헤더 */}
              <View style={s.colHeader}>
                <Text style={s.colTitle}>{col.product}</Text>
                <View style={s.colBadge}>
                  <Text style={s.colBadgeText}>{col.issues.length}</Text>
                </View>
              </View>

              {/* 이슈 카드 목록 */}
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {col.issues.length === 0 && fetched && (
                  <Text style={s.emptyCol}>이슈 없음</Text>
                )}
                {col.issues.map((issue) => (
                  <TouchableOpacity
                    key={issue.number}
                    style={s.card}
                    onPress={() => Linking.openURL(issue.html_url)}
                    activeOpacity={0.75}
                  >
                    <View style={s.cardTopRow}>
                      <Text style={s.cardNum}>#{issue.number}</Text>
                    </View>
                    <Text style={s.cardTitle} numberOfLines={3}>{issue.title}</Text>
                    {issue.assignees.length > 0 && (
                      <View style={s.assigneeRow}>
                        <Ionicons name="person-outline" size={11} color={C.text3} />
                        <Text style={s.assigneeText} numberOfLines={1}>
                          {issue.assignees.join(', ')}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const COLUMN_WIDTH = 260;

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
  totalBadge: { fontSize: 12, color: C.text3, marginRight: 16, marginLeft: 8 },
  board: { flexDirection: 'row', padding: 12, gap: 10, flex: 1 },
  column: {
    width: COLUMN_WIDTH,
    backgroundColor: C.bg2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: 10,
    maxHeight: '100%',
  },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  colTitle: { fontSize: 13, fontWeight: '600', color: C.text2 },
  colBadge: {
    backgroundColor: C.bg3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  colBadgeText: { fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] },
  emptyCol: { fontSize: 12, color: C.text4, textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardNum: { fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] },
  cardTitle: { fontSize: 13, color: C.text, lineHeight: 18 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  assigneeText: { fontSize: 11, color: C.text3, flex: 1 },
});
