import React from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../lib/styles';

export function SettingsModal({ visible, isLight, onToggleLight, tokenInput, onTokenChange, claudeKeyInput, onClaudeKeyChange, proxyHostInput, onProxyHostChange, onSave, onClose }: {
  visible: boolean; isLight: boolean; onToggleLight: () => void;
  tokenInput: string; onTokenChange: (t: string) => void;
  claudeKeyInput: string; onClaudeKeyChange: (k: string) => void;
  proxyHostInput: string; onProxyHostChange: (h: string) => void;
  onSave: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.settingsOverlay} onPress={onClose}>
        <Pressable style={styles.settingsSheet} onPress={() => {}}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>설정</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsRow}>
            <View>
              <Text style={styles.settingsRowLabel}>라이트 모드</Text>
              <Text style={styles.settingsRowDesc}>애플 스타일 밝은 테마</Text>
            </View>
            <TouchableOpacity onPress={onToggleLight}
              style={[styles.bigToggleTrack, isLight && styles.bigToggleTrackOn]}>
              <View style={[styles.bigToggleKnob, isLight && styles.bigToggleKnobOn]} />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsDivider} />

          <Text style={styles.settingsGroupLabel}>GitHub Token</Text>
          <Text style={styles.settingsGroupDesc}>private 레포 포함 전체 레포를 불러옵니다.{'\n'}GitHub → Settings → Developer settings → Personal access tokens</Text>
          <TextInput style={styles.settingsInput} placeholder="ghp_xxxxxxxxxxxx" placeholderTextColor="#636366"
            value={tokenInput} onChangeText={onTokenChange} secureTextEntry autoCapitalize="none" />

          <View style={styles.settingsDivider} />

          <Text style={styles.settingsGroupLabel}>Anthropic API Key</Text>
          <Text style={styles.settingsGroupDesc}>Claude로 GitHub 이슈를 자동 생성합니다.{'\n'}console.anthropic.com → API Keys</Text>
          <TextInput style={styles.settingsInput} placeholder="sk-ant-xxxxxxxxxxxx" placeholderTextColor="#636366"
            value={claudeKeyInput} onChangeText={onClaudeKeyChange} secureTextEntry autoCapitalize="none" />

          <View style={styles.settingsDivider} />

          <Text style={styles.settingsGroupLabel}>Mac IP 주소</Text>
          <Text style={styles.settingsGroupDesc}>이슈 생성 시 Mac의 프록시 서버에 연결합니다.{'\n'}터미널에서 확인: ipconfig getifaddr en0</Text>
          <TextInput style={styles.settingsInput} placeholder="예: 10.25.253.149" placeholderTextColor="#636366"
            value={proxyHostInput} onChangeText={onProxyHostChange} autoCapitalize="none" keyboardType="decimal-pad" />

          <View style={styles.settingsBtnRow}>
            <TouchableOpacity onPress={onClose} style={styles.settingsCancelBtn}>
              <Text style={styles.settingsCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={styles.settingsSaveBtn}>
              <Text style={styles.settingsSaveText}>저장</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
