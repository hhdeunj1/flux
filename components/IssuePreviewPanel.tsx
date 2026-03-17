import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { ThemeColors } from '../lib/constants';
import { styles, markdownStyles, AI_LABEL_COLORS } from '../lib/styles';

// ─── 서브 컴포넌트 ─────────────────────────────────────────

export function AutoInput({ minH = 38, style, value, onChangeText, ...props }: React.ComponentProps<typeof TextInput> & { minH?: number }) {
  const [h, setH] = useState(minH);
  return (
    <View>
      <Text
        style={[style, { position: 'absolute', opacity: 0, top: 0, left: 0, right: 0, zIndex: -1 }]}
        onLayout={(e) => setH(Math.max(minH, e.nativeEvent.layout.height))}
        aria-hidden
      >
        {(value as string) || ' '}
      </Text>
      <TextInput
        multiline scrollEnabled={false} textAlignVertical="top"
        value={value} onChangeText={onChangeText}
        style={[style, { height: h }]}
        {...props}
      />
    </View>
  );
}

export function IssueSection({ label, C, children }: { label: string; C: ThemeColors; children: React.ReactNode }) {
  return (
    <View style={styles.issueSectionBlock}>
      <Text style={[styles.issueSectionLabel, { color: C.labelColor }]}>{label}</Text>
      {children}
    </View>
  );
}

export function IssueLinkField({ sectionLabel, nameValue, onNameChange, namePlaceholder, urlValue, C }: {
  sectionLabel: string; nameValue: string; onNameChange: (v: string) => void;
  namePlaceholder: string; urlValue: string; C: ThemeColors;
}) {
  const hasUrl = !!urlValue;
  return (
    <View style={styles.issueSectionBlock}>
      <Text style={[styles.issueSectionLabel, { color: C.labelColor }]}>{sectionLabel}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput
          style={[styles.issueSectionInput, { flex: 1, backgroundColor: C.input, color: C.text, borderColor: C.border }]}
          value={nameValue} onChangeText={onNameChange}
          placeholderTextColor={C.text4} placeholder={namePlaceholder}
        />
        <TouchableOpacity
          onPress={() => hasUrl ? Linking.openURL(urlValue).catch(() => {}) : undefined}
          style={[styles.issueLinkBtn, { backgroundColor: C.bg3, borderColor: C.border }]}
          disabled={!hasUrl}
        >
          <Ionicons name="open-outline" size={15} color={hasUrl ? '#007AFF' : C.text4} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AICommentsList({ content, C }: { content: string; C: ThemeColors }) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {lines.map((line, i) => {
        const m = line.match(/^-?\s*`([^`]+)`\s*:?\s*(.*)/);
        if (m) {
          const [, label, text] = m;
          const col = AI_LABEL_COLORS[label] ?? { text: '#8E8E93', bg: 'rgba(142,142,147,0.15)' };
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ backgroundColor: col.bg, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2, flexShrink: 0 }}>
                <Text style={{ color: col.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
              </View>
              <Text style={{ flex: 1, color: C.text2, fontSize: 13, lineHeight: 20 }}>{text}</Text>
            </View>
          );
        }
        return <Text key={i} style={{ color: C.text2, fontSize: 13, lineHeight: 20 }}>{line}</Text>;
      })}
    </View>
  );
}

// ─── 이슈 본문 파싱 / 조합 ──────────────────────────────────
type ParsedIssue = {
  bg: string; overviewText: string; entryPath: string;
  screenLabel: string; screenUrl: string; mdLabel: string; mdUrl: string;
  specHeading: string; spec: string; ai: string;
};

function parseOverview(raw: string) {
  const entryM  = raw.match(/>\s*\[진입[^\]]*\]\s*(.+)/);
  const screenM = raw.match(/>\s*\[연관\s*화면\]\s*(?:\[([^\]]+)\]\(([^)]+)\)|(.+))/);
  const mdM     = raw.match(/>\s*\[연관\s*MD\]\s*(?:\[([^\]]+)\]\(([^)]+)\)|(.+))/);
  const text    = raw.split('\n').filter(l => !l.trimStart().startsWith('>')).join('\n').trim();
  return {
    text,
    entryPath:   entryM  ? entryM[1].trim()                 : '',
    screenLabel: screenM ? (screenM[1] || screenM[3] || '') : '',
    screenUrl:   screenM ? (screenM[2] || '')               : '',
    mdLabel:     mdM     ? (mdM[1] || mdM[3] || '')         : '',
    mdUrl:       mdM     ? (mdM[2] || '')                   : '',
  };
}

function parseIssueBody(body: string): ParsedIssue {
  const detailsMatch = body.match(/<details>[\s\S]*?<\/details>/);
  const aiBlock      = detailsMatch ? detailsMatch[0] : '';
  const bodyNoAI     = body.replace(aiBlock, '').trim();

  const specHeadingMatch = bodyNoAI.match(/^## Spec[^\n]*/m);
  const specHeading = specHeadingMatch ? specHeadingMatch[0] : '## Spec';

  const extract = (label: string) => {
    const re = new RegExp(`## ${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`);
    const m = bodyNoAI.match(re);
    return m ? m[1].trim() : '';
  };
  const specRe    = /## Spec[^\n]*\n([\s\S]*?)(?=\n---|$)/;
  const specMatch = bodyNoAI.match(specRe);
  const aiContentMatch = aiBlock.match(/<summary>[^\n]*<\/summary>([\s\S]*?)<\/details>/);
  const ov = parseOverview(extract('개요'));

  return {
    bg: extract('배경'),
    overviewText: ov.text,
    entryPath: ov.entryPath,
    screenLabel: ov.screenLabel, screenUrl: ov.screenUrl,
    mdLabel: ov.mdLabel, mdUrl: ov.mdUrl,
    specHeading,
    spec: specMatch ? specMatch[1].trim() : '',
    ai:   aiContentMatch ? aiContentMatch[1].trim() : '',
  };
}

function assembleOverviewSection(text: string, entryPath: string, screenLabel: string, screenUrl: string, mdLabel: string, mdUrl: string): string {
  const meta: string[] = [];
  if (entryPath) meta.push(`> [진입 경로] ${entryPath}`);
  if (screenLabel || screenUrl) meta.push(screenUrl ? `> [연관 화면] [${screenLabel}](${screenUrl})` : `> [연관 화면] ${screenLabel}`);
  if (mdLabel || mdUrl) meta.push(mdUrl ? `> [연관 MD] [${mdLabel}](${mdUrl})` : `> [연관 MD] ${mdLabel}`);
  return [text, ...meta].filter(Boolean).join('\n');
}

function assembleIssueBody(p: { bg: string; overviewText: string; entryPath: string; screenLabel: string; screenUrl: string; mdLabel: string; mdUrl: string; specHeading: string; spec: string; ai: string }): string {
  const parts: string[] = [];
  if (p.bg) parts.push(`## 배경\n${p.bg}`);
  const ov = assembleOverviewSection(p.overviewText, p.entryPath, p.screenLabel, p.screenUrl, p.mdLabel, p.mdUrl);
  if (ov) parts.push(`## 개요\n${ov}`);
  if (p.spec) parts.push(`${p.specHeading}\n${p.spec}`);
  if (p.ai) parts.push(`---\n\n<details>\n<summary>🤖 AI Comments</summary>\n${p.ai}\n</details>`);
  return parts.join('\n\n');
}

// ─── IssuePreviewPanel ─────────────────────────────────────
export function IssuePreviewPanel({ preview, C, isPosting, onClose, onPost }: {
  preview: { title: string; body: string };
  C: ThemeColors;
  isPosting: boolean;
  onClose: () => void;
  onPost: (title: string, body: string | null) => void;
}) {
  const [title, setTitle] = useState(preview.title);
  const [tab, setTab]     = useState<'edit' | 'preview'>('edit');
  const parsed = useMemo(() => parseIssueBody(preview.body), [preview.body]);
  const [bg,           setBg]           = useState(parsed.bg);
  const [overviewText, setOverviewText] = useState(parsed.overviewText);
  const [entryPath,    setEntryPath]    = useState(parsed.entryPath);
  const [screenLabel,  setScreenLabel]  = useState(parsed.screenLabel);
  const [screenUrl,    setScreenUrl]    = useState(parsed.screenUrl);
  const [mdLabel,      setMdLabel]      = useState(parsed.mdLabel);
  const [mdUrl,        setMdUrl]        = useState(parsed.mdUrl);
  const [spec,         setSpec]         = useState(parsed.spec);
  const [ai,           setAi]           = useState(parsed.ai);
  const [aiOpen,       setAiOpen]       = useState(false);

  const fullBody = assembleIssueBody({ bg, overviewText, entryPath, screenLabel, screenUrl, mdLabel, mdUrl, specHeading: parsed.specHeading, spec, ai });

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg2 }]}>
      {/* 헤더 */}
      <View style={[styles.issuePanelHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.issuePanelBack}>
          <Ionicons name="chevron-back" size={20} color={C.text3} />
        </TouchableOpacity>
        <Text style={[styles.issuePanelTitle, { color: C.text }]}>이슈 등록</Text>
        <View style={[styles.previewTabRow, { marginBottom: 0, backgroundColor: C.bg3, width: 140, flexShrink: 0 }]}>
          {(['edit', 'preview'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.previewTab, tab === t && [styles.previewTabActive, { backgroundColor: C.bg }]]}
              onPress={() => setTab(t)}
            >
              <Text numberOfLines={1} style={[styles.previewTabText, { color: C.text3 }, tab === t && [styles.previewTabTextActive, { color: C.text }]]}>
                {t === 'edit' ? '편집' : '미리보기'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 제목 */}
      <TextInput
        style={[styles.issuePanelTitleInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
        value={title} onChangeText={setTitle}
        placeholder="이슈 제목" placeholderTextColor={C.text4}
      />

      {/* 본문 */}
      {tab === 'edit' ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* 왼쪽: 배경·개요·Spec·AI Comments */}
          <ScrollView
            style={{ flex: 3, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border }}
            contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          >
            <IssueSection label="배경" C={C}>
              <AutoInput style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                value={bg} onChangeText={setBg} placeholderTextColor={C.text3} placeholder="배경 내용" />
            </IssueSection>
            <IssueSection label="개요" C={C}>
              <AutoInput style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                value={overviewText} onChangeText={setOverviewText} placeholderTextColor={C.text3} placeholder="한 줄 요약" />
            </IssueSection>
            <IssueSection label="Spec" C={C}>
              <AutoInput minH={200} style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                value={spec} onChangeText={setSpec} placeholderTextColor={C.text3} placeholder="AS-IS / TO-BE" />
            </IssueSection>
            <View style={[styles.issueSectionBlock, { borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg3, overflow: 'hidden' }]}>
              <TouchableOpacity
                onPress={() => setAiOpen(o => !o)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 }}
              >
                <Text style={[styles.issueSectionLabel, { color: C.labelColor, flex: 1, marginBottom: 0 }]}>🤖 AI Comments</Text>
                <Ionicons name={aiOpen ? 'chevron-up' : 'chevron-down'} size={13} color={C.text3} />
              </TouchableOpacity>
              {aiOpen && (
                <View style={{ paddingHorizontal: 10, paddingBottom: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                  <AICommentsList content={ai} C={C} />
                </View>
              )}
            </View>
          </ScrollView>

          {/* 오른쪽: 진입 경로·연관 화면·연관 MD */}
          <ScrollView
            style={{ flex: 2 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          >
            <IssueSection label="진입 경로" C={C}>
              <AutoInput style={[styles.issueSectionInput, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
                value={entryPath} onChangeText={setEntryPath} placeholderTextColor={C.text3} placeholder="온보딩 > 개인/법인 선택" />
            </IssueSection>
            <IssueLinkField sectionLabel="연관 화면" nameValue={screenLabel} onNameChange={setScreenLabel}
              namePlaceholder="프레임명" urlValue={screenUrl} C={C} />
            <IssueLinkField sectionLabel="연관 MD" nameValue={mdLabel} onNameChange={setMdLabel}
              namePlaceholder="MD파일명 > 섹션 경로" urlValue={mdUrl} C={C} />
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Markdown style={markdownStyles}>{fullBody}</Markdown>
        </ScrollView>
      )}

      {/* 하단 버튼 */}
      <View style={[styles.previewBtnRow, { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
        <TouchableOpacity
          style={[styles.previewBtnEmpty, { borderColor: C.border2 }, isPosting && { opacity: 0.4 }]}
          onPress={() => onPost(title, null)} disabled={isPosting}
        >
          <Text style={[styles.previewBtnEmptyText, { color: C.text3 }]}>제목만 업로드</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.previewBtnPost, isPosting && { opacity: 0.4 }]}
          onPress={() => onPost(title, fullBody)} disabled={isPosting}
        >
          <Text style={styles.previewBtnPostText}>{isPosting ? '업로드 중...' : '업로드'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
