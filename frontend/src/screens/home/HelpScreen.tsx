import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AuthContext } from '../../context/AuthContext';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  return (
    <TouchableOpacity 
      style={styles.faqCard} 
      onPress={toggleExpand}
      activeOpacity={0.7}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Ionicons 
          name={expanded ? "chevron-up" : "chevron-down"} 
          size={20} 
          color={theme.colors.textSecondary} 
        />
      </View>
      {expanded && (
        <View style={styles.faqAnswerContainer}>
          <Text style={styles.faqAnswer}>{answer}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export const HelpScreen = ({ navigation }: any) => {
  const { profile, t } = useContext(AuthContext);
  const isCandidate = profile?.role === 'candidate';
  const supportEmail = 'support@skillfit.com';

  const candidateGuide = [
    { icon: 'person-add-outline', text: t('guide_profile' as any) },
    { icon: 'play-outline', text: t('guide_start' as any) },
    { icon: 'mic-outline', text: t('guide_voice' as any) },
    { icon: 'stats-chart-outline', text: t('guide_results' as any) },
  ];

  const interviewerGuide = [
    { icon: 'add-circle-outline', text: t('guide_post_job' as any) },
    { icon: 'people-outline', text: t('guide_manage_app' as any) },
    { icon: 'ribbon-outline', text: t('guide_review_ai' as any) },
    { icon: 'checkmark-done-outline', text: t('guide_shortlist' as any) },
  ];

  const commonFAQs = [
    {
      question: t('faq_q1' as any),
      answer: t('faq_a1' as any)
    },
    {
      question: t('faq_q2' as any),
      answer: t('faq_a2' as any)
    },
    {
      question: t('faq_q3' as any),
      answer: t('faq_a3' as any)
    },
    {
      question: t('faq_q4' as any),
      answer: t('faq_a4' as any)
    },
  ];

  const roleFAQs = isCandidate ? [
    {
      question: t('faq_candidate_q1' as any),
      answer: t('faq_candidate_a1' as any)
    }
  ] : [
    {
      question: t('faq_interviewer_q1' as any),
      answer: t('faq_interviewer_a1' as any)
    },
    {
      question: t('faq_interviewer_q2' as any),
      answer: t('faq_interviewer_a2' as any)
    }
  ];

  const handleContactSupport = async () => {
    const subject = 'AI SkillFit Support Request';
    const body = [
      'Hello Support Team,',
      '',
      'I need assistance with AI SkillFit.',
      '',
      `Name: ${profile?.full_name ?? 'N/A'}`,
      `Role: ${profile?.role ?? 'N/A'}`,
      `Email: ${profile?.email ?? 'N/A'}`,
      `Phone: ${profile?.phone ?? 'N/A'}`,
      `Platform: ${Platform.OS}`,
      '',
      'Issue Description:',
      '- Please describe the issue, steps to reproduce, and any error messages.',
      '',
      'Thank you,',
    ].join('\n');

    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (!canOpen) {
        Alert.alert(t('help' as any), t('support_soon' as any));
        return;
      }
      await Linking.openURL(mailtoUrl);
    } catch (error) {
      Alert.alert(t('help' as any), t('support_soon' as any));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('help_support' as any)}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{t('quick_guide' as any)}</Text>
          </View>
          <AppCard variant="outlined" style={styles.guideCard}>
            {(isCandidate ? candidateGuide : interviewerGuide).map((item, index) => (
              <View key={index} style={styles.guideItem}>
                <View style={styles.guideIcon}>
                  <Ionicons name={item.icon as any} size={20} color={theme.colors.primary} />
                </View>
                <Text style={styles.guideText}>{item.text}</Text>
              </View>
            ))}
          </AppCard>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="help-circle-outline" size={22} color={theme.colors.secondary} />
            <Text style={styles.sectionTitle}>{t('faqs' as any)}</Text>
          </View>
          {[...commonFAQs, ...roleFAQs].map((faq, index) => (
            <FAQItem key={index} question={faq.question} answer={faq.answer} />
          ))}
        </View>

        <View style={styles.contactSection}>
          <AppCard style={styles.contactCard}>
            <Ionicons name="chatbubbles-outline" size={48} color="#fff" style={{ marginBottom: 12 }} />
            <Text style={styles.contactTitle}>{t('still_need_help' as any)}</Text>
            <Text style={styles.contactSubtitle}>{t('contact_support_desc' as any)}</Text>
            <AppButton 
              title={t('contact_support_btn' as any)} 
              variant="primary" 
              style={styles.contactBtn}
              textStyle={{ color: theme.colors.primary }}
              onPress={handleContactSupport}
            />
          </AppCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  guideCard: {
    padding: 16,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  guideIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  guideText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    paddingRight: 8,
  },
  faqAnswerContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  faqAnswer: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  contactSection: {
    marginBottom: 40,
  },
  contactCard: {
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    padding: 24,
  },
  contactTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  contactSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  contactBtn: {
    backgroundColor: '#fff',
    width: '100%',
  }
});
