import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AuthContext } from '../../context/AuthContext';
import { AppButton } from '../../components/AppButton';

const TRADES = ['Electrician', 'Plumber', 'Carpenter', 'Mechanic', 'Driver', 'Painter', 'Construction', 'Other'];
const EXPERIENCE_LEVELS = [
  { label: 'Fresher', value: 'Fresher' },
  { label: '1–3 years', value: '1-3' },
  { label: '3–5 years', value: '3-5' },
  { label: '5+ years', value: '5+' },
];
const WORK_TYPES = ['Full-time', 'Part-time', 'Contract'];

export const EditProfileScreen: React.FC<any> = ({ navigation }) => {
  const { profile, updateProfile, t } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  // ── Aadhaar auto-filled fields (read-only) ──────────────────────────────────
  // These come from the Aadhaar database and cannot be changed by the user.

  // ── User-editable fields ────────────────────────────────────────────────────
  const [trade, setTrade] = useState(profile?.trade || '');
  const [experience, setExperience] = useState(profile?.experience_level || '');
  const [workPreference, setWorkPreference] = useState(profile?.work_preference || '');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>(profile?.skills || []);
  const [education, setEducation] = useState(profile?.education || '');

  const addSkill = () => {
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      setSkills([...skills, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await updateProfile({
        trade,
        experience_level: experience,
        skills,
        work_preference: workPreference,
        education,
      });
      Alert.alert('Success', 'Profile updated successfully!');
      navigation.goBack();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ text }: { text: string }) => <Text style={styles.label}>{text}</Text>;

  const ReadOnlyField = ({ label, value }: { label: string; value?: string }) => (
    <View style={styles.readOnlyField}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <View style={styles.readOnlyValueRow}>
        <Text style={styles.readOnlyValue}>{value || t('not_provided' as any)}</Text>
        <View style={styles.aadhaarBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#15803d" />
          <Text style={styles.aadhaarBadgeText}>Aadhaar</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('edit_profile')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* ── Aadhaar Auto-filled Section ─────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-checkmark" size={18} color="#15803d" />
              <Text style={styles.sectionTitle}>Aadhaar Verified Details</Text>
            </View>
            <Text style={styles.sectionNote}>
              These details are fetched from your Aadhaar and cannot be edited here.
            </Text>
            <ReadOnlyField label={t('full_name_label')} value={profile?.full_name} />
            <ReadOnlyField label={t('phone_label')} value={profile?.phone} />
            <ReadOnlyField label={t('district_label')} value={profile?.district} />
            <ReadOnlyField label={t('gender_label')} value={profile?.gender} />
            <ReadOnlyField label={t('age_label')} value={profile?.age} />
          </View>

          {/* ── Trade & Experience ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle2}>{t('work_trade')}</Text>
            <Label text={t('trade')} />
            <View style={styles.chipContainer}>
              {TRADES.map((t_val) => (
                <TouchableOpacity
                  key={t_val}
                  onPress={() => setTrade(t_val)}
                  style={[styles.chip, trade === t_val && styles.selectedChip]}
                >
                  <Text style={[styles.chipText, trade === t_val && styles.selectedChipText]}>
                    {t_val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label text={t('experience')} />
            <View style={styles.chipContainer}>
              {EXPERIENCE_LEVELS.map((exp) => (
                <TouchableOpacity
                  key={exp.value}
                  onPress={() => setExperience(exp.value)}
                  style={[styles.chip, experience === exp.value && styles.selectedChip]}
                >
                  <Text style={[styles.chipText, experience === exp.value && styles.selectedChipText]}>
                    {exp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Skills ──────────────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle2}>{t('skills_edu')}</Text>
            <Label text={t('skills')} />
            <View style={styles.skillInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={t('add_skill')}
                value={skillInput}
                onChangeText={setSkillInput}
                onSubmitEditing={addSkill}
              />
              <TouchableOpacity onPress={addSkill} style={styles.addSkillBtn}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.chipContainer}>
              {skills.map((s) => (
                <View key={s} style={styles.skillChip}>
                  <Text style={styles.skillChipText}>{s}</Text>
                  <TouchableOpacity onPress={() => removeSkill(s)}>
                    <Ionicons name="close-circle" size={16} color="#64748b" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <Label text={t('education')} />
            <TextInput
              style={styles.input}
              value={education}
              onChangeText={setEducation}
              placeholder="e.g. 10th Pass, ITI, Diploma"
            />
          </View>

          {/* ── Work Preference ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle2}>{t('preferences')}</Text>
            <Label text={t('work_preference')} />
            <View style={styles.chipContainer}>
              {WORK_TYPES.map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => setWorkPreference(w)}
                  style={[styles.chip, workPreference === w && styles.selectedChip]}
                >
                  <Text style={[styles.chipText, workPreference === w && styles.selectedChipText]}>
                    {w}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AppButton
            title={t('save_changes')}
            onPress={handleSave}
            loading={loading}
            disabled={loading}
            style={styles.saveBtn}
          />
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginLeft: 8 },
  content: { padding: 24 },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#15803d',
    marginLeft: 6,
  },
  sectionTitle2: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  sectionNote: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  // Read-only fields
  readOnlyField: {
    marginBottom: 12,
  },
  readOnlyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  readOnlyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  readOnlyValue: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  aadhaarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 3,
  },
  aadhaarBadgeText: {
    fontSize: 10,
    color: '#15803d',
    fontWeight: '600',
  },
  // Editable fields
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    height: 50,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    margin: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedChip: {
    backgroundColor: '#eff6ff',
    borderColor: theme.colors.primary,
  },
  chipText: { fontSize: 14, color: '#475569' },
  selectedChipText: { color: theme.colors.primary, fontWeight: '600' },
  skillInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addSkillBtn: {
    width: 50,
    height: 50,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    margin: 4,
  },
  skillChipText: { fontSize: 14, color: '#334155', marginRight: 6 },
  saveBtn: { marginTop: 16 },
});
