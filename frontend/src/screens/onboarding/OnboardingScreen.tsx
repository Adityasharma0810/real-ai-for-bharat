import React, { useState, useContext, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AppButton } from '../../components/AppButton';
import { AuthContext } from '../../context/AuthContext';

const TRADE_CATEGORIES = [
  {
    label: 'Blue-collar Trades',
    trades: [
      'Electrician', 'Plumber', 'Welder', 'Carpenter', 'Mason', 'Painter',
      'HVAC Technician', 'Mechanic / Automobile Technician', 'Fitter', 'Turner',
      'Machinist', 'CNC Operator', 'Lathe Operator', 'Sheet Metal Worker',
      'Fabricator', 'Construction Worker', 'Civil Site Technician',
      'Heavy Equipment Operator', 'Crane Operator', 'Forklift Operator',
      'Truck Driver', 'Delivery Driver', 'Railway Technician',
      'Solar Panel Installer', 'Wind Turbine Technician',
      'Fire Safety Technician', 'Refrigeration Technician', 'Boiler Operator',
      'Mining Technician', 'Industrial Maintenance Technician',
    ],
  },
  {
    label: 'Polytechnic-Skilled Roles',
    trades: [
      'Diploma Mechanical Engineer', 'Diploma Civil Engineer',
      'Diploma Electrical Engineer', 'Diploma Electronics Engineer',
      'Diploma Computer Science Engineer', 'Diploma Automobile Engineer',
      'Diploma Mechatronics Engineer', 'Production Supervisor',
      'Quality Control Engineer', 'CAD Designer', 'AutoCAD Technician',
      'Network Technician', 'Embedded Systems Technician',
      'Robotics Technician', 'Instrumentation Technician', 'Plant Operator',
      'Process Technician', 'Manufacturing Technician', 'Telecom Technician',
      'Biomedical Equipment Technician', 'Surveyor', 'Lab Technician',
      'Safety Officer', 'Junior Site Engineer', 'Maintenance Engineer',
      'Service Engineer', 'Electrical Design Technician', 'Tool and Die Maker',
      'Water Treatment Technician', 'Industrial Automation Technician',
    ],
  },
  {
    label: 'Semi-Skilled Workforce',
    trades: [
      'Data Entry Operator', 'Office Assistant', 'Warehouse Assistant',
      'Store Keeper', 'Sales Associate', 'Retail Executive',
      'Customer Support Executive', 'BPO Executive', 'Delivery Executive',
      'Packing Staff', 'Machine Helper', 'Production Line Worker',
      'Security Guard', 'Housekeeping Staff', 'Hospital Ward Assistant',
      'Nursing Assistant', 'Caregiver', 'Receptionist', 'Field Executive',
      'Inventory Assistant', 'Helper Technician', 'Loading/Unloading Staff',
      'Food Delivery Executive', 'Kitchen Assistant', 'Driver Assistant',
      'Assembly Line Worker', 'Courier Staff', 'Printing Machine Assistant',
      'Office Support Staff', 'Dispatch Assistant',
    ],
  },
];
const EXPERIENCE_LEVELS = [
  { label: 'Fresher', value: 'Fresher' },
  { label: '1–3 years', value: '1-3' },
  { label: '3–5 years', value: '3-5' },
  { label: '5+ years', value: '5+' },
];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const WORK_TYPES = ['Full-time', 'Part-time', 'Contract'];
const EDUCATION_LEVELS = ['Below 10th', '10th Pass', '12th Pass', 'ITI/Diploma', 'Graduate', 'Post Graduate'];

export const OnboardingScreen: React.FC<any> = ({ navigation }) => {
  const { updateProfile, t, profile } = useContext(AuthContext);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [trade, setTrade] = useState('');
  const [experience, setExperience] = useState('');
  const [education, setEducation] = useState('');
  const [workPreference, setWorkPreference] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [tradeQuery, setTradeQuery] = useState('');

  const filteredTradeCategories = useMemo(() => {
    const query = tradeQuery.trim().toLowerCase();
    if (!query) return TRADE_CATEGORIES;
    return TRADE_CATEGORIES
      .map((cat) => ({
        ...cat,
        trades: cat.trades.filter((item) => item.toLowerCase().includes(query)),
      }))
      .filter((cat) => cat.trades.length > 0);
  }, [tradeQuery]);

  const showNoTrades = tradeQuery.trim().length > 0 && filteredTradeCategories.length === 0;

  const profileGenderMatch = useMemo(() => {
    const normalizedGender = profile?.gender?.trim().toLowerCase();
    if (!normalizedGender) return '';
    const match = GENDERS.find((item) => item.toLowerCase() === normalizedGender);
    return match || '';
  }, [profile?.gender]);

  const isAgeLocked = Boolean(profile?.age);
  const isGenderLocked = Boolean(profileGenderMatch);

  useEffect(() => {
    if (profile?.age && profile.age !== age) {
      setAge(profile.age);
    }
    if (profileGenderMatch && profileGenderMatch !== gender) {
      setGender(profileGenderMatch);
    }
  }, [profile?.age, profileGenderMatch, age, gender]);

  const addSkill = () => {
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      setSkills([...skills, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill));
  };

  const handleNext = async () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      try {
        setLoading(true);
        await updateProfile({
          age,
          gender,
          trade,
          experience_level: experience,
          skills,
          education,
          work_preference: workPreference,
          onboarding_completed: true,
        });
      } catch (error) {
        console.error('Onboarding failed:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.title}>{t('work_trade')}</Text>
              <Text style={styles.subtitle}>{t('work_trade_subtitle')}</Text>
            </View>
            <Text style={styles.label}>{t('select_trade')}</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder={t('search_trade_placeholder')}
                placeholderTextColor="#94a3b8"
                value={tradeQuery}
                onChangeText={setTradeQuery}
              />
              {tradeQuery ? (
                <TouchableOpacity onPress={() => setTradeQuery('')} style={styles.searchClear}>
                  <Ionicons name="close" size={16} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>
            {trade ? (
              <View style={styles.selectedTradeBox}>
                <View style={styles.selectedTradeTextWrap}>
                  <Text style={styles.selectedTradeCaption}>{t('selected_trade_label')}</Text>
                  <Text style={styles.selectedTradeText}>{trade}</Text>
                </View>
                <TouchableOpacity onPress={() => setTrade('')}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null}
            {filteredTradeCategories.map(cat => (
              <View key={cat.label}>
                <Text style={styles.categoryHeader}>{cat.label}</Text>
                <View style={styles.chipContainer}>
                  {cat.trades.map(t_val => (
                    <TouchableOpacity
                      key={t_val}
                      onPress={() => setTrade(t_val)}
                      style={[styles.chip, trade === t_val && styles.selectedChip]}
                    >
                      <Text style={[styles.chipText, trade === t_val && styles.selectedChipText]}>{t_val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            {showNoTrades ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{t('no_trades_found')}</Text>
              </View>
            ) : null}
            <Text style={styles.label}>{t('experience')}</Text>
            <Text style={styles.helperText}>{t('experience_helper')}</Text>
            <View style={styles.experienceGrid}>
              {EXPERIENCE_LEVELS.map(exp => (
                <TouchableOpacity
                  key={exp.value}
                  onPress={() => setExperience(exp.value)}
                  style={[styles.experienceCard, experience === exp.value && styles.experienceCardSelected]}
                >
                  <View style={[styles.radio, experience === exp.value && styles.radioSelected]} />
                  <Text style={[styles.experienceText, experience === exp.value && styles.experienceTextSelected]}>{exp.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.title}>{t('skills_edu')}</Text>
              <Text style={styles.subtitle}>{t('skills_edu_subtitle')}</Text>
            </View>
            <Text style={styles.label}>{t('skills')}</Text>
            <View style={styles.skillInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={t('add_skill')}
                value={skillInput}
                onChangeText={setSkillInput}
              />
              <TouchableOpacity onPress={addSkill} style={styles.addSkillBtn}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.chipContainer}>
              {skills.map(s => (
                <View key={s} style={styles.skillChip}>
                  <Text style={styles.skillChipText}>{s}</Text>
                  <TouchableOpacity onPress={() => removeSkill(s)}><Ionicons name="close-circle" size={16} color="#64748b" /></TouchableOpacity>
                </View>
              ))}
            </View>
            <Text style={styles.label}>{t('education')}</Text>
            <View style={styles.dropdown}>
              {EDUCATION_LEVELS.map(e => (
                <TouchableOpacity key={e} onPress={() => setEducation(e)} style={[styles.dropdownItem, education === e && styles.dropdownItemSelected]}>
                  <Text style={[styles.dropdownText, education === e && styles.dropdownTextSelected]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.title}>{t('preferences')}</Text>
              <Text style={styles.subtitle}>{t('preferences_subtitle')}</Text>
            </View>
            <Text style={styles.label}>{t('age')}</Text>
            {isAgeLocked ? (
              <View style={styles.lockHintRow}>
                <Ionicons name="lock-closed" size={14} color="#64748b" />
                <Text style={styles.lockHintText}>{t('autofilled_from_aadhaar')}</Text>
              </View>
            ) : null}
            <TextInput
              style={[styles.input, isAgeLocked && styles.inputLocked]}
              placeholder={t('age')}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              editable={!isAgeLocked}
              selectTextOnFocus={!isAgeLocked}
            />
            <Text style={styles.label}>{t('gender')}</Text>
            {isGenderLocked ? (
              <View style={styles.lockHintRow}>
                <Ionicons name="lock-closed" size={14} color="#64748b" />
                <Text style={styles.lockHintText}>{t('autofilled_from_aadhaar')}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g}
                  onPress={() => {
                    if (!isGenderLocked) setGender(g);
                  }}
                  style={[
                    styles.smallChip,
                    gender === g && styles.selectedChip,
                    isGenderLocked && gender !== g && styles.disabledChip,
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      gender === g && styles.selectedChipText,
                      isGenderLocked && gender !== g && styles.disabledChipText,
                    ]}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('work_preference')}</Text>
            {WORK_TYPES.map(w => (
              <TouchableOpacity key={w} onPress={() => setWorkPreference(w)} style={[styles.listOption, workPreference === w && styles.listOptionSelected]}>
                <Text style={[styles.listOptionText, workPreference === w && styles.listOptionTextSelected]}>{w}</Text>
                {workPreference === w && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        );
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressHeader}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.stepIndicator}>{t('step')} {step} {t('of')} 3</Text>
          {step > 1 && (
            <TouchableOpacity onPress={() => setStep(step - 1)} style={styles.backPill}>
              <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
              <Text style={styles.backBtnText}>{t('back')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>{renderStep()}</ScrollView>
      <View style={styles.footer}>
        <AppButton title={step === 3 ? t('complete_profile') : t('continue')} onPress={handleNext} loading={loading} disabled={(step === 1 && (!trade || !experience)) || (step === 3 && !workPreference)} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  progressHeader: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  progressTrack: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 999 },
  headerInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepIndicator: { fontSize: 12, fontWeight: '700', color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase' },
  backPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#ffffff', borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0' },
  backBtnText: { marginLeft: 2, color: theme.colors.primary, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  stepContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  stepHeader: { marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b' },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, marginTop: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  helperText: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  input: { height: 50, backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  inputLocked: { backgroundColor: '#eef2f7', color: '#64748b', borderColor: '#d1d5db' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f8fafc', margin: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  smallChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f8fafc', marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  selectedChip: { backgroundColor: '#eef2ff', borderColor: theme.colors.primary },
  disabledChip: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  chipText: { fontSize: 13, color: '#475569' },
  selectedChipText: { color: theme.colors.primary, fontWeight: '600' },
  disabledChipText: { color: '#94a3b8' },
  categoryHeader: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 6, marginLeft: 4 },
  selectedTradeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  selectedTradeTextWrap: { flex: 1, marginRight: 10 },
  selectedTradeCaption: { fontSize: 11, fontWeight: '700', color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  selectedTradeText: { fontSize: 15, fontWeight: '600', color: '#312e81', flexShrink: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 12 },
  radioSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  experienceGrid: { marginTop: 4 },
  experienceCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  experienceCardSelected: { backgroundColor: '#eef2ff', borderColor: theme.colors.primary },
  experienceText: { fontSize: 15, color: '#334155', fontWeight: '600' },
  experienceTextSelected: { color: theme.colors.primary },
  skillInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  addSkillBtn: { width: 50, height: 50, backgroundColor: theme.colors.primary, borderRadius: 12, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  skillChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, margin: 4, borderWidth: 1, borderColor: '#e0e7ff' },
  skillChipText: { fontSize: 14, color: '#334155', marginRight: 6 },
  dropdown: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  dropdownItemSelected: { backgroundColor: '#eef2ff' },
  dropdownText: { fontSize: 16, color: '#475569' },
  dropdownTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  listOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  listOptionSelected: { borderColor: theme.colors.primary, backgroundColor: '#eef2ff' },
  listOptionText: { fontSize: 16, color: '#475569' },
  listOptionTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12 },
  lockHintRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lockHintText: { marginLeft: 6, fontSize: 12, color: '#64748b' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 8, paddingHorizontal: 8 },
  searchClear: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  emptyState: { padding: 14, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 6 },
  emptyStateText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
});
