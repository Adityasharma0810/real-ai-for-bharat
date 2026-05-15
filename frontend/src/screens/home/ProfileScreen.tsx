import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { theme } from '../../theme';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { PortfolioGallery } from '../../components/PortfolioGallery';

const LANGUAGES = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { id: 'hi', label: 'Hindi', native: 'हिंदी' },
];

export const ProfileScreen: React.FC<any> = ({ navigation }) => {
  const { user, profile, language, setLanguage, signOut, t } = useContext(AuthContext);
  const [langModalVisible, setLangModalVisible] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to logout');
    }
  };

  const handleLanguageChange = async (langId: string) => {
    await setLanguage(langId);
    setLangModalVisible(false);
  };

  const getTranslatedTrade = (trade: string) => {
    if (!trade) return t('not_provided' as any);
    const key = `trade_${trade.toLowerCase()}`;
    const translated = t(key as any);
    return translated === key ? trade : translated;
  };

  const getTranslatedExperience = (exp: string) => {
    if (!exp) return t('not_provided' as any);
    if (exp === 'Fresher') return t('exp_fresher' as any);
    return `${exp} ${t('years' as any)}`;
  };

  const currentLanguageLabel = LANGUAGES.find(l => l.id === language)?.native || 'English';

  const InfoRow = ({ label, value, icon }: { label: string; value?: string; icon: any }) => (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.infoTextContainer}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || t('not_provided' as any)}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile')}</Text>
        </View>

        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('EditProfile')}>
            {profile?.photo_url ? (
              <Image
                source={{ uri: profile.photo_url }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarText}>
                {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.userName}>{profile?.full_name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <TouchableOpacity 
            style={styles.editBadge}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Ionicons name="pencil" size={16} color="#fff" />
            <Text style={styles.editBadgeText}>{t('edit_profile')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('personal_details')}</Text>
          <AppCard style={styles.infoCard} variant="outlined">
            <InfoRow label={t('phone_label' as any)} value={profile?.phone} icon="call-outline" />
            <View style={styles.divider} />
            <InfoRow label={t('age_label' as any)} value={profile?.age} icon="calendar-outline" />
            <View style={styles.divider} />
            <InfoRow label={t('district_label' as any)} value={profile?.district} icon="location-outline" />
            <View style={styles.divider} />
            <InfoRow label={t('gender_label' as any)} value={profile?.gender} icon="person-outline" />
          </AppCard>
        </View>

        {profile?.role === 'candidate' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('work_skills')}</Text>
            <AppCard style={styles.infoCard} variant="outlined">
              <InfoRow label={t('trade_label' as any)} value={getTranslatedTrade(profile?.trade || '')} icon="hammer-outline" />
              <View style={styles.divider} />
              <InfoRow label={t('experience_label' as any)} value={getTranslatedExperience(profile?.experience_level || '')} icon="briefcase-outline" />
              <View style={styles.divider} />
              <InfoRow label={t('work_pref_label' as any)} value={profile?.work_preference} icon="time-outline" />
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="construct-outline" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('skills_label' as any)}</Text>
                  <View style={styles.skillBadgeContainer}>
                    {profile?.skills && profile.skills.length > 0 ? (
                      profile.skills.map((s, i) => (
                        <View key={i} style={styles.skillBadge}>
                          <Text style={styles.skillBadgeText}>{s}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.infoValue}>{t('no_skills_added' as any)}</Text>
                    )}
                  </View>
                </View>
              </View>
            </AppCard>
          </View>
        )}

        {profile?.role === 'candidate' && user?.id && (
          <View style={styles.section}>
            <PortfolioGallery userId={user.id} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings')}</Text>
          <AppCard style={styles.infoCard} variant="outlined">
            <TouchableOpacity style={styles.menuItem} onPress={() => setLangModalVisible(true)}>
              <View style={styles.infoIcon}>
                <Ionicons name="language-outline" size={20} color={theme.colors.secondary} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>{t('app_language')}</Text>
                <Text style={styles.infoValue}>{currentLanguageLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.border} />
            </TouchableOpacity>
          </AppCard>
        </View>

        <View style={styles.footer}>
          <AppButton 
            title={t('logout')} 
            variant="ghost" 
            onPress={handleLogout}
            textStyle={{ color: theme.colors.error }}
          />
        </View>
      </ScrollView>

      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setLangModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('app_language')}</Text>
            {LANGUAGES.map(item => (
              <TouchableOpacity 
                key={item.id} 
                style={[styles.langOption, language === item.id && styles.langOptionSelected]}
                onPress={() => handleLanguageChange(item.id)}
              >
                <Text style={[styles.langText, language === item.id && styles.langTextSelected]}>
                  {item.native} ({item.label})
                </Text>
                {language === item.id && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 24 },
  header: { marginBottom: 24, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  profileHeader: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16, overflow: 'hidden' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarText: { fontSize: 40, color: '#fff', fontWeight: 'bold' },
  userName: { fontSize: 24, fontWeight: '700', color: '#1e293b' },
  userEmail: { fontSize: 14, color: '#64748b', marginTop: 4 },
  editBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.secondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 12 },
  editBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#64748b', marginBottom: 12, marginLeft: 4 },
  infoCard: { padding: 0, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  infoIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  infoTextContainer: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  skillBadgeContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  skillBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 6, marginBottom: 6 },
  skillBadgeText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 68 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  footer: { marginTop: 12, marginBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 20, textAlign: 'center' },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  langOptionSelected: { backgroundColor: '#eff6ff', borderRadius: 12, paddingHorizontal: 12, marginHorizontal: -12 },
  langText: { fontSize: 16, color: '#475569' },
  langTextSelected: { color: theme.colors.primary, fontWeight: '600' },
});
