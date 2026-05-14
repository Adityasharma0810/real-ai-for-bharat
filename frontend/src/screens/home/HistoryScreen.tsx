import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  TouchableOpacity, ScrollView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase/config';
import { AuthContext } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FITMENT_COLOR: Record<string, string> = {
  'Job-Ready': '#10b981',
  'Requires Training': '#f59e0b',
  'Low Confidence': '#ef4444',
  'Requires Significant Upskilling': '#8b5cf6',
  'Requires Manual Verification': '#0ea5e9',
};

const ADMIN_STATUS_COLOR: Record<string, string> = {
  shortlisted: '#16a34a',
  rejected: '#dc2626',
  marked_for_training: '#8b5cf6',
};

function scoreColor(s: number) {
  if (s >= 7.5) return '#10b981';
  if (s >= 5) return '#f59e0b';
  return '#ef4444';
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round((score / 10) * 100));
  const color = scoreColor(score);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
      <View style={{ flex: 1, height: 5, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as any, height: '100%', backgroundColor: color, borderRadius: 99 }} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color, minWidth: 32 }}>
        {score.toFixed(1)}/10
      </Text>
    </View>
  );
}

// ── Interview card ────────────────────────────────────────────────────────────
function InterviewCard({ item, navigation }: { item: any; navigation: any }) {
  const iv = item.interview;
  const fitmentColor = FITMENT_COLOR[iv?.fitment] ?? theme.colors.textSecondary;
  const adminStatus = iv?.admin_status;

  return (
    <View style={cardStyles.container}>
      {/* Header row */}
      <View style={cardStyles.header}>
        <View style={{ flex: 1 }}>
          {item.jobs ? (
            <>
              <Text style={cardStyles.title} numberOfLines={1}>{item.jobs.title}</Text>
              <Text style={cardStyles.subtitle}>{item.jobs.companies?.company_name}</Text>
            </>
          ) : (
            <>
              <Text style={cardStyles.title}>
                {iv?.trade ? `${iv.trade} Interview` : 'Practice Interview'}
              </Text>
              <Text style={cardStyles.subtitle}>Standalone Assessment</Text>
            </>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {/* Admin decision badge */}
          {adminStatus && (
            <View style={[cardStyles.adminBadge, { backgroundColor: ADMIN_STATUS_COLOR[adminStatus] }]}>
              <Text style={cardStyles.adminBadgeText}>
                {adminStatus === 'marked_for_training' ? 'TRAINING' : adminStatus.toUpperCase()}
              </Text>
            </View>
          )}
          {/* Date */}
          <Text style={cardStyles.date}>
            {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      </View>

      {/* Interview result — only if interview data exists */}
      {iv && (
        <>
          {/* Score + confidence row */}
          <View style={cardStyles.metricsRow}>
            <View style={cardStyles.metricBox}>
              <Text style={cardStyles.metricLabel}>Score</Text>
              <Text style={[cardStyles.metricValue, { color: scoreColor(iv.average_score ?? 0) }]}>
                {iv.average_score != null ? `${Number(iv.average_score).toFixed(1)}/10` : '—'}
              </Text>
            </View>
            <View style={cardStyles.metricDivider} />
            <View style={cardStyles.metricBox}>
              <Text style={cardStyles.metricLabel}>Confidence</Text>
              <Text style={[cardStyles.metricValue, { color: theme.colors.primary }]}>
                {iv.confidence_score != null ? `${Number(iv.confidence_score).toFixed(0)}%` : '—'}
              </Text>
            </View>
            <View style={cardStyles.metricDivider} />
            <View style={[cardStyles.metricBox, { flex: 2 }]}>
              <Text style={cardStyles.metricLabel}>Fitment</Text>
              <Text style={[cardStyles.metricValue, { color: fitmentColor, fontSize: 12 }]} numberOfLines={1}>
                {iv.fitment ?? '—'}
              </Text>
            </View>
          </View>

          {/* Per-question scores */}
          {iv.scores?.length > 0 && (
            <View style={cardStyles.section}>
              <Text style={cardStyles.sectionLabel}>Question Scores</Text>
              {iv.scores.map((s: number, i: number) => (
                <View key={i} style={cardStyles.scoreRow}>
                  <Text style={cardStyles.qLabel}>Q{i + 1}</Text>
                  <ScoreBar score={s} />
                </View>
              ))}
            </View>
          )}

          {/* Weak topics */}
          {iv.weak_topics?.length > 0 && (
            <View style={cardStyles.section}>
              <Text style={cardStyles.sectionLabel}>Topics to Review</Text>
              <View style={cardStyles.tagsRow}>
                {iv.weak_topics.map((t: string, i: number) => (
                  <View key={i} style={cardStyles.weakTag}>
                    <Text style={cardStyles.weakTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Strengths */}
          {iv.feedback?.strengths?.length > 0 && (
            <View style={cardStyles.section}>
              <Text style={cardStyles.sectionLabel}>Strengths</Text>
              {iv.feedback.strengths.map((s: string, i: number) => (
                <View key={i} style={cardStyles.feedbackRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                  <Text style={cardStyles.feedbackText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Improvements */}
          {iv.feedback?.improvements?.length > 0 && (
            <View style={cardStyles.section}>
              <Text style={cardStyles.sectionLabel}>Areas to Improve</Text>
              {iv.feedback.improvements.map((s: string, i: number) => (
                <View key={i} style={cardStyles.feedbackRow}>
                  <Ionicons name="alert-circle" size={14} color="#f59e0b" />
                  <Text style={cardStyles.feedbackText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Integrity flag */}
          {iv.integrity_flag && (
            <View style={cardStyles.flagRow}>
              <Ionicons name="warning" size={14} color="#92400e" />
              <Text style={cardStyles.flagText}>
                This interview has been flagged for manual review.
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      web: {
        boxShadow: '0px 1px 4px rgba(0,0,0,0.04)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      }
    }),
    elevation: 1,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 2 },
  subtitle: { fontSize: 13, color: theme.colors.primary, fontWeight: '600' },
  date: { fontSize: 11, color: theme.colors.textSecondary },
  adminBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  adminBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  metricsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 14,
  },
  metricBox: { flex: 1, alignItems: 'center' },
  metricLabel: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600', marginBottom: 3, textTransform: 'uppercase' },
  metricValue: { fontSize: 15, fontWeight: '800' },
  metricDivider: { width: 1, height: 32, backgroundColor: '#e2e8f0', marginHorizontal: 8 },

  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  qLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, width: 24 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weakTag: { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  weakTagText: { fontSize: 11, color: '#991b1b', fontWeight: '600' },

  feedbackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 5 },
  feedbackText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },

  flagRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#fffbeb', padding: 10, borderRadius: 8, marginTop: 4,
  },
  flagText: { flex: 1, fontSize: 12, color: '#92400e' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export const HistoryScreen = ({ navigation }: any) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile, user } = useContext(AuthContext);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fix 1.1: Query interviews table directly in Supabase so admin_status is always populated
      const { data: interviews, error: ivError } = await supabase
        .from('interviews')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ivError) throw ivError;

      // Fix 1.2: Include updated_at and join companies(company_name, logo_url)
      const { data: apps } = await supabase
        .from('applications')
        .select('job_id, status, updated_at, jobs(id, title, companies(company_name, logo_url))')
        .eq('user_id', user.id);

      const appMap: Record<string, any> = {};
      (apps || []).forEach((a: any) => {
        if (a.job_id) appMap[a.job_id] = a;
      });

      const merged = (interviews || []).map((iv: any) => {
        const app = iv.job_id ? appMap[iv.job_id] : null;
        return {
          id: iv.id,
          created_at: iv.created_at,
          jobs: app?.jobs ?? null,
          interview: iv,
        };
      });

      setItems(merged);
    } catch (err) {
      console.error('History fetch error:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Interviews</Text>
        <TouchableOpacity onPress={fetchHistory} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={({ item }) => <InterviewCard item={item} navigation={navigation} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="mic-outline" size={64} color={theme.colors.border} />
              <Text style={styles.emptyTitle}>No interviews yet</Text>
              <Text style={styles.emptyText}>
                Complete an interview to see your results here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  refreshBtn: { padding: 8 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 100, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
});
