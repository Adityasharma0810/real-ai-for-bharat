import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase/config';
import { AppCard } from '../../components/AppCard';
import { getResults, updateInterviewAdminStatus } from '../../services/interviewService';

const FITMENT_COLOR: Record<string, string> = {
  'Job-Ready': '#10b981',
  'Requires Training': '#f59e0b',
  'Low Confidence': '#ef4444',
  'Requires Significant Upskilling': '#8b5cf6',
  'Requires Manual Verification': '#0ea5e9',
};

const STATUS_COLOR: Record<string, string> = {
  shortlisted: '#16a34a',
  rejected: '#dc2626',
  marked_for_training: '#8b5cf6',
  blocked: '#111827',
};

export const InterviewerCandidateDetailScreen = ({ route, navigation }: any) => {
  const { candidateId, jobId, interviewId } = route.params;
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; content: string; timestamp?: number }[] | null>(null);
  const [transcriptText, setTranscriptText] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    fetchCandidateDetails();
  }, [candidateId, interviewId]);

  const fetchCandidateDetails = async () => {
    try {
      // ── 1. Fetch interview (always available, has district/trade/language from voice bot) ──
      let interviewData: any = null;
      const backendInterviews = await getResults();
      if (interviewId) {
        interviewData = backendInterviews.find((iv: any) => iv.id === interviewId) ?? null;
      } else if (candidateId && jobId) {
        interviewData = backendInterviews.find((iv: any) => iv.user_id === candidateId && iv.job_id === jobId) ?? null;
      } else if (candidateId) {
        interviewData = backendInterviews.find((iv: any) => iv.user_id === candidateId) ?? null;
      }

      // ── 2. Fetch profile (optional — enriches with onboarding data) ──
      let profileData: any = null;
      const resolvedUserId = candidateId || interviewData?.user_id;
      if (resolvedUserId) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email, phone, age, gender, district, trade, experience_level, skills, education, work_preference')
          .eq('id', resolvedUserId)
          .maybeSingle();
        if (error) console.warn('Profile fetch (non-fatal):', error.message);
        profileData = data;
      }

      // ── 3. Merge — interview data is the ground truth for assessment fields ──
      // Profile enriches with onboarding details where available
      if (!profileData && !interviewData) {
        setCandidate(null);
        return;
      }

      const merged = {
        // Identity
        full_name: profileData?.full_name || interviewData?.candidate_name || 'Unknown',
        trade: profileData?.trade || interviewData?.trade || null,
        experience_level: profileData?.experience_level || null,
        // Contact
        phone: profileData?.phone || interviewData?.phone_number || null,
        email: profileData?.email || null,
        // Personal details — profile first, interview district as fallback
        district: profileData?.district || interviewData?.district || null,
        education: profileData?.education || null,
        work_preference: profileData?.work_preference || null,
        age: profileData?.age || null,
        gender: profileData?.gender || null,
        skills: profileData?.skills?.length > 0 ? profileData.skills : [],
        // Interview data
        interview: interviewData || null,
        // Status — use admin_status from interview (works without application record)
        adminStatus: interviewData?.admin_status || null,
      };

      setCandidate(merged);

      // ── 4. Fetch transcript from Supabase interviews table ──────────────
      if (interviewData?.id) {
        const { data: ivRow } = await supabase
          .from('interviews')
          .select('transcript, transcript_text')
          .eq('id', interviewData.id)
          .maybeSingle();
        if (ivRow?.transcript) setTranscript(ivRow.transcript);
        if (ivRow?.transcript_text) setTranscriptText(ivRow.transcript_text);
      }
    } catch (err) {
      console.error('Error fetching candidate:', err);
    } finally {
      setLoading(false);
    }
  };

  // Save decision directly to the interviews table — no application record needed
  const updateStatus = async (status: string) => {
    if (!candidate?.interview?.id) {
      Alert.alert('Error', 'No interview record found for this candidate.');
      return;
    }

    const prevStatus = candidate.adminStatus;
    // Optimistic update
    setCandidate((prev: any) => ({ ...prev, adminStatus: status }));
    setUpdating(true);

    try {
      await updateInterviewAdminStatus(candidate.interview.id, status);

      // Also update applications table if a record exists (best-effort)
      if (candidateId && jobId) {
        const { data: app } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', candidateId)
          .eq('job_id', jobId)
          .maybeSingle();
        if (app?.id) {
          await supabase.from('applications').update({ status }).eq('id', app.id);
        }
      }

      Alert.alert(
        'Updated',
        `Candidate marked as ${status === 'marked_for_training' ? 'Training' : status}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('Status update failed:', err);
      setCandidate((prev: any) => ({ ...prev, adminStatus: prevStatus }));
      Alert.alert('Error', err.message || 'Failed to update. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const resetStatus = async () => {
    if (!candidate?.interview?.id) return;
    setCandidate((prev: any) => ({ ...prev, adminStatus: null }));
    setUpdating(true);
    try {
      await updateInterviewAdminStatus(candidate.interview.id, null);
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!candidate) return null;

  const iv = candidate.interview;
  const fitmentColor = FITMENT_COLOR[iv?.fitment] ?? theme.colors.textSecondary;

  // Build personal details rows — only include fields that have data
  const personalRows: { label: string; value: string }[] = [];
  if (candidate.district) personalRows.push({ label: 'District', value: candidate.district });
  if (candidate.education) personalRows.push({ label: 'Education', value: candidate.education });
  if (candidate.experience_level) personalRows.push({ label: 'Experience', value: candidate.experience_level });
  if (candidate.work_preference) personalRows.push({ label: 'Work Preference', value: candidate.work_preference });
  if (candidate.age) personalRows.push({ label: 'Age', value: candidate.age });
  if (candidate.gender) personalRows.push({ label: 'Gender', value: candidate.gender });
  if (candidate.phone) personalRows.push({ label: 'Phone', value: candidate.phone });
  if (candidate.email) personalRows.push({ label: 'Email', value: candidate.email });
  // Fallback: if profile has nothing, show interview-sourced fields
  if (personalRows.length === 0) {
    if (iv?.district) personalRows.push({ label: 'District', value: iv.district });
    if (iv?.language) personalRows.push({ label: 'Language', value: iv.language });
    if (iv?.trade) personalRows.push({ label: 'Trade', value: iv.trade });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Candidate Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Profile header ── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {candidate.full_name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.name}>{candidate.full_name}</Text>
          {candidate.trade && (
            <Text style={styles.tradeText}>
              {candidate.trade}{candidate.experience_level ? ` · ${candidate.experience_level}` : ''}
            </Text>
          )}
          {/* Decision badge — only when a decision has been made */}
          {candidate.adminStatus && (
            <View style={[styles.decisionBadge, { backgroundColor: STATUS_COLOR[candidate.adminStatus] ?? '#64748b' }]}>
              <Text style={styles.decisionBadgeText}>
                {candidate.adminStatus === 'marked_for_training' ? 'TRAINING'
                  : candidate.adminStatus.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ── Score cards ── */}
        {iv && (
          <View style={styles.scoreRow}>
            <AppCard style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Avg Score</Text>
              <Text style={[styles.scoreValue, { color: theme.colors.primary }]}>
                {iv.average_score != null ? `${Number(iv.average_score).toFixed(1)}/10` : '—'}
              </Text>
            </AppCard>
            <AppCard style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Confidence</Text>
              <Text style={[styles.scoreValue, { color: theme.colors.secondary }]}>
                {iv.confidence_score != null ? `${Number(iv.confidence_score).toFixed(0)}%` : '—'}
              </Text>
            </AppCard>
          </View>
        )}

        {/* ── Interview summary ── */}
        {iv && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interview Summary</Text>
            <AppCard variant="outlined" style={styles.summaryCard}>

              {iv.fitment && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Fitment</Text>
                  <Text style={[styles.summaryValue, { color: fitmentColor }]}>{iv.fitment}</Text>
                </View>
              )}

              {iv.category && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Category</Text>
                    <Text style={styles.summaryValue}>{iv.category}</Text>
                  </View>
                </>
              )}

              {iv.language && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Language</Text>
                    <Text style={styles.summaryValue}>{iv.language}</Text>
                  </View>
                </>
              )}

              {/* Weak topics */}
              {iv.weak_topics?.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={[styles.summaryLabel, { marginBottom: 8 }]}>Weak Topics</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {iv.weak_topics.map((t: string, i: number) => (
                      <View key={i} style={styles.weakTag}>
                        <Text style={styles.weakTagText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Feedback */}
              {iv.feedback?.strengths?.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={[styles.summaryLabel, { marginBottom: 8 }]}>Strengths</Text>
                  {iv.feedback.strengths.map((s: string, i: number) => (
                    <View key={i} style={styles.feedbackRow}>
                      <Ionicons name="checkmark-circle" size={15} color="#16a34a" />
                      <Text style={styles.feedbackText}>{s}</Text>
                    </View>
                  ))}
                </>
              )}

              {iv.feedback?.improvements?.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={[styles.summaryLabel, { marginBottom: 8 }]}>Areas to Improve</Text>
                  {iv.feedback.improvements.map((s: string, i: number) => (
                    <View key={i} style={styles.feedbackRow}>
                      <Ionicons name="alert-circle" size={15} color="#f59e0b" />
                      <Text style={styles.feedbackText}>{s}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* Integrity flag */}
              {iv.integrity_flag && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.flagRow}>
                    <Ionicons name="warning" size={15} color="#92400e" />
                    <Text style={styles.flagText}>
                      Flagged for manual review — suspicious interview pattern detected.
                    </Text>
                  </View>
                </>
              )}
            </AppCard>
          </View>
        )}

        {/* ── Interview Transcript ── */}
        {(transcript || transcriptText) && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.transcriptToggle}
              onPress={() => setShowTranscript((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={styles.transcriptToggleLeft}>
                <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>Interview Transcript</Text>
              </View>
              <Ionicons
                name={showTranscript ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            {showTranscript && (
              <AppCard variant="outlined" style={styles.transcriptCard}>
                {transcript && transcript.length > 0 ? (
                  transcript.map((msg, i) => (
                    <View
                      key={i}
                      style={[
                        styles.transcriptBubble,
                        msg.role === 'user' ? styles.userBubble : styles.aiBubble,
                      ]}
                    >
                      <Text style={styles.transcriptSpeaker}>
                        {msg.role === 'assistant' ? '🤖 Priya (AI)' : '👤 Candidate'}
                      </Text>
                      <Text style={styles.transcriptText}>{msg.content}</Text>
                      {msg.timestamp && (
                        <Text style={styles.transcriptTime}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </Text>
                      )}
                    </View>
                  ))
                ) : transcriptText ? (
                  <Text style={styles.transcriptRawText}>{transcriptText}</Text>
                ) : null}
              </AppCard>
            )}
          </View>
        )}

        {/* ── Technical Skills — only if data exists ── */}        {candidate.skills?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Skills</Text>
            <View style={styles.skillsRow}>
              {candidate.skills.map((skill: string, i: number) => (
                <View key={i} style={styles.skillBadge}>
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Personal Details — only if at least one field has data ── */}
        {personalRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Details</Text>
            <View style={styles.detailsGrid}>
              {personalRows.map((row, i) => (
                <View key={i} style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{row.label}</Text>
                  <Text style={styles.detailValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Footer actions ── */}
      {iv ? (
        <View style={styles.footer}>
        {candidate.adminStatus ? (
          // Decision already made — show it with a reset option
          <View style={styles.decisionRow}>
            <View style={[styles.decisionPill, { backgroundColor: STATUS_COLOR[candidate.adminStatus] + '18' }]}>
              <Ionicons
                name={candidate.adminStatus === 'shortlisted' ? 'checkmark-circle'
                  : candidate.adminStatus === 'marked_for_training' ? 'school' : 'close-circle'}
                size={20}
                color={STATUS_COLOR[candidate.adminStatus]}
              />
              <Text style={[styles.decisionPillText, { color: STATUS_COLOR[candidate.adminStatus] }]}>
                {candidate.adminStatus === 'marked_for_training' ? 'Marked for Training'
                  : candidate.adminStatus === 'shortlisted' ? 'Shortlisted' : 'Rejected'}
              </Text>
            </View>
            <TouchableOpacity style={styles.resetBtn} onPress={resetStatus} disabled={updating}>
              <Text style={styles.resetBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // No decision yet — show action buttons
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#fef2f2' }, updating && styles.btnDisabled]}
              onPress={() => updateStatus('rejected')}
              disabled={updating}
            >
              <Ionicons name="close-circle" size={22} color="#dc2626" />
              <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#f5f3ff' }, updating && styles.btnDisabled]}
              onPress={() => updateStatus('marked_for_training')}
              disabled={updating}
            >
              <Ionicons name="school" size={22} color="#8b5cf6" />
              <Text style={[styles.actionBtnText, { color: '#8b5cf6' }]}>Training</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#f0fdf4' }, updating && styles.btnDisabled]}
              onPress={() => updateStatus('shortlisted')}
              disabled={updating}
            >
              <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
              <Text style={[styles.actionBtnText, { color: '#16a34a' }]}>Shortlist</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      ) : (
        <View style={styles.footer}>
          <Text style={styles.noInterviewText}>No completed interview yet.</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, height: 60,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },

  content: { padding: 24, paddingBottom: 40 },

  profileHeader: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  name: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginBottom: 4, textAlign: 'center' },
  tradeText: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600', marginBottom: 8 },
  decisionBadge: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, marginTop: 4,
  },
  decisionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  scoreCard: { width: '48%', alignItems: 'center', paddingVertical: 16 },
  scoreLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6, fontWeight: '600' },
  scoreValue: { fontSize: 24, fontWeight: '800' },

  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 14 },

  summaryCard: { padding: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },

  weakTag: { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  weakTagText: { fontSize: 12, color: '#991b1b', fontWeight: '600' },

  feedbackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  feedbackText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },

  flagRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fffbeb', padding: 10, borderRadius: 8,
  },
  flagText: { flex: 1, fontSize: 13, color: '#92400e' },

  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  skillText: { fontSize: 13, color: '#475569', fontWeight: '600' },

  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  detailItem: { width: '45%' },
  detailLabel: {
    fontSize: 11, color: theme.colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3,
  },
  detailValue: { fontSize: 15, fontWeight: '700', color: theme.colors.text },

  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff',
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  actionBtnText: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  btnDisabled: { opacity: 0.5 },

  decisionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  decisionPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
  },
  decisionPillText: { fontSize: 15, fontWeight: '700' },
  resetBtn: {
    marginLeft: 10, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
  },
  resetBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  noInterviewText: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },

  // Transcript
  transcriptToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, marginBottom: 8,
  },
  transcriptToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  transcriptCard: { padding: 0, overflow: 'hidden' },
  transcriptBubble: {
    padding: 12, marginBottom: 2,
  },
  aiBubble: { backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  userBubble: { backgroundColor: '#eff6ff', borderLeftWidth: 3, borderLeftColor: theme.colors.secondary },
  transcriptSpeaker: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 4, textTransform: 'uppercase' },
  transcriptText: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  transcriptTime: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4 },
  transcriptRawText: { fontSize: 13, color: theme.colors.text, lineHeight: 20, padding: 12, fontFamily: 'monospace' },
});
