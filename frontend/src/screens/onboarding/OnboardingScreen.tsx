import React, { useState, useContext } from 'react';
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
  const { updateProfile, t } = useContext(AuthContext);
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
            <Text style={styles.title}>{t('work_trade')}</Text>
            <Text style={styles.label}>{t('select_trade')}</Text>
            {trade ? (
              <View style={styles.selectedTradeBox}>
                <Text style={styles.selectedTradeText}>{trade}</Text>
                <TouchableOpacity onPress={() => setTrade('')}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null}
            {TRADE_CATEGORIES.map(cat => (
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
            <Text style={styles.label}>{t('experience')}</Text>
            {EXPERIENCE_LEVELS.map(exp => (
              <TouchableOpacity key={exp.value} onPress={() => setExperience(exp.value)} style={styles.radioOption}>
                <View style={[styles.radio, experience === exp.value && styles.radioSelected]} />
                <Text style={styles.radioLabel}>{exp.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>{t('skills_edu')}</Text>
            <Text style={styles.label}>{t('skills')}</Text>
            <View style={styles.skillInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={t('add_skill')}
                value={skillInput}
                onChangeText={setSkillInput}
              />
              <TouchableOpacity onPress={addSkill} style={styles.addSkillBtn}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
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
            <Text style={styles.title}>{t('preferences')}</Text>
            <Text style={styles.label}>{t('age')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('age')}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
            />
            <Text style={styles.label}>{t('gender')}</Text>
            <View style={styles.row}>
              {GENDERS.map(g => (
                <TouchableOpacity key={g} onPress={() => setGender(g)} style={[styles.smallChip, gender === g && styles.selectedChip]}>
                  <Text style={[styles.chipText, gender === g && styles.selectedChipText]}>{g}</Text>
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
          {step > 1 && <TouchableOpacity onPress={() => setStep(step - 1)}><Text style={styles.backBtn}>{t('back')}</Text></TouchableOpacity>}
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
  container: { flex: 1, backgroundColor: '#fff' },
  progressHeader: { padding: 24, paddingTop: 12 },
  progressTrack: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 },
  headerInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepIndicator: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  backBtn: { color: theme.colors.primary, fontWeight: '600' },
  content: { padding: 24 },
  stepContainer: { flex: 1 },
  title: { fontSize: 24, fontWeight: '700', color: '#1e293b', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  input: { height: 50, backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#f1f5f9', margin: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  smallChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  selectedChip: { backgroundColor: '#eff6ff', borderColor: theme.colors.primary },
  chipText: { fontSize: 14, color: '#475569' },
  selectedChipText: { color: theme.colors.primary, fontWeight: '600' },
  categoryHeader: { fontSize: 13, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 6, marginLeft: 4 },
  selectedTradeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#eff6ff', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  selectedTradeText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary, flex: 1 },
  radioOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 12 },
  radioSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  radioLabel: { fontSize: 16, color: '#334155' },
  skillInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  addSkillBtn: { width: 50, height: 50, backgroundColor: theme.colors.primary, borderRadius: 12, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  skillChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, margin: 4 },
  skillChipText: { fontSize: 14, color: '#334155', marginRight: 6 },
  dropdown: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  dropdownItemSelected: { backgroundColor: '#eff6ff' },
  dropdownText: { fontSize: 16, color: '#475569' },
  dropdownTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  listOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  listOptionSelected: { borderColor: theme.colors.primary, backgroundColor: '#eff6ff' },
  listOptionText: { fontSize: 16, color: '#475569' },
  listOptionTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  footer: { padding: 24, paddingBottom: 40 }
});
