import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import type { InterviewResult } from '../../services/interviewService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FITMENT_COLORS: Record<string, string> = {
  'Job-Ready': '#10b981',
  'Requires Training': '#f59e0b',
  'Low Confidence': '#ef4444',
  'Requires Significant Upskilling': '#8b5cf6',
  'Requires Manual Verification': '#0ea5e9',
};

function scoreColor(score: number): string {
  if (score >= 7.5) return '#10b981';
  if (score >= 5) return '#f59e0b';
  return '#ef4444';
}

// ── Score circle ──────────────────────────────────────────────────────────────
function ScoreCircle({ value, label, unit, color }: { value: string; label: string; unit: string; color: string }) {
  return (
    <View style={circleStyles.block}>
      <Text style={circleStyles.label}>{label}</Text>
      <View style={[circleStyles.circle, { borderColor: color }]}>
        <Text style={[circleStyles.value, { color }]}>{value}</Text>
        <Text style={circleStyles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const circleStyles = StyleSheet.create({
  block: { alignItems: 'center' },
  label: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  circle: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  value: { fontSize: 22, fontWeight: '900', lineHeight: 26 },
  unit: { fontSize: 11, color: theme.colors.textSecondary, lineHeight: 14 },
});

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round((score / 10) * 100));
  const color = scoreColor(score);
  return (
    <View style={barStyles.wrap}>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[barStyles.label, { color }]}>{score.toFixed(1)}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  track: { flex: 1, height: 6, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  label: { fontSize: 12, fontWeight: '700', minWidth: 28, textAlign: 'right' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export const ResultScreen: React.FC<any> = ({ navigation, route }) => {
  const { resultData } = route.params || {};
  const result: InterviewResult | null = resultData ?? null;

  // No result yet — this shouldn't happen since we pass it directly,
  // but handle gracefully just in case
  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Interview Result</Text>
          <TouchableOpacity onPress={() => navigation.navigate('HomeTabs')}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Ionicons name="hourglass-outline" size={56} color={theme.colors.textSecondary} />
          <Text style={styles.noResultTitle}>Results are being processed</Text>
          <Text style={styles.noResultSub}>
            Your interview is being evaluated. Check back in a moment or view your history.
          </Text>
          <AppButton
            title="Go to Home"
            variant="primary"
            onPress={() => navigation.navigate('HomeTabs')}
            style={{ marginTop: 24, width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const fitmentColor = FITMENT_COLORS[result.fitment] ?? theme.colors.accent;
  const avgScore = result.average_score ?? 0;
  const confidencePct = result.confidence_score != null ? Math.round(result.confidence_score) : null;
  const scores = result.scores ?? [];
  const weakTopics = result.weak_topics ?? [];
  const strengths = result.feedback?.strengths ?? [];
  const improvements = result.feedback?.improvements ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Interview Result</Text>
        <TouchableOpacity onPress={() => navigation.navigate('HomeTabs')}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Top card: fitment + scores ── */}
        <AppCard style={[styles.topCard, { borderColor: fitmentColor, borderWidth: 2 }]} variant="outlined">
          {/* Fitment badge */}
          <View style={[styles.fitmentBadge, { backgroundColor: fitmentColor }]}>
            <Text style={styles.fitmentText}>{result.fitment}</Text>
          </View>

          {/* Score circles */}
          <View style={styles.scoreRow}>
            <ScoreCircle
              value={avgScore.toFixed(1)}
              label="Interview Score"
              unit="/10"
              color={scoreColor(avgScore)}
            />
            {confidencePct != null && (
              <ScoreCircle
                value={String(confidencePct)}
                label="Confidence"
                unit="%"
                color={theme.colors.primary}
              />
            )}
          </View>

          {/* Tags */}
          <View style={styles.tagRow}>
            {result.category ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{result.category}</Text>
              </View>
            ) : null}
            {result.language ? (
              <View style={[styles.tag, { backgroundColor: '#ede9fe' }]}>
                <Text style={[styles.tagText, { color: '#5b21b6' }]}>{result.language}</Text>
              </View>
            ) : null}
            {result.trade ? (
              <View style={[styles.tag, { backgroundColor: '#f0fdf4' }]}>
                <Text style={[styles.tagText, { color: '#065f46' }]}>{result.trade}</Text>
              </View>
            ) : null}
          </View>
        </AppCard>

        {/* ── Per-question scores ── */}
        {scores.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Question Scores</Text>
            <AppCard>
              {scores.map((s, i) => (
                <View key={i} style={styles.questionRow}>
                  <Text style={styles.questionLabel}>Q{i + 1}</Text>
                  <ScoreBar score={s} />
                  <Text style={[styles.questionScore, { color: scoreColor(s) }]}>{s}/10</Text>
                </View>
              ))}
            </AppCard>
          </View>
        )}

        {/* ── Weak topics ── */}
        {weakTopics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Topics to Review</Text>
            <View style={styles.tagRow}>
              {weakTopics.map((t, i) => (
                <View key={i} style={[styles.tag, { backgroundColor: '#fee2e2' }]}>
                  <Text style={[styles.tagText, { color: '#991b1b' }]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Strengths ── */}
        {strengths.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Strengths</Text>
            {strengths.map((s, i) => (
              <View key={i} style={[styles.feedbackItem, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                <Text style={styles.feedbackText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Improvements ── */}
        {improvements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Areas to Improve</Text>
            {improvements.map((s, i) => (
              <View key={i} style={[styles.feedbackItem, { backgroundColor: '#fffbeb' }]}>
                <Ionicons name="alert-circle" size={18} color="#f59e0b" />
                <Text style={styles.feedbackText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Integrity warning ── */}
        {result.integrity_flag && (
          <View style={styles.warningCard}>
            <Ionicons name="warning" size={18} color="#92400e" />
            <Text style={styles.warningText}>
              This interview has been flagged for manual review. Our team will verify your results shortly.
            </Text>
          </View>
        )}

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <AppButton
            title="Back to Dashboard"
            variant="primary"
            onPress={() => navigation.navigate('HomeTabs')}
            style={styles.actionBtn}
          />
          <AppButton
            title="Retake Interview"
            variant="outline"
            onPress={() => navigation.navigate('InterviewIntro')}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, height: 60,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  scroll: { padding: theme.spacing.lg, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noResultTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 16, textAlign: 'center' },
  noResultSub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  // Top card
  topCard: { alignItems: 'center', paddingVertical: 28, marginBottom: 24 },
  fitmentBadge: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, marginBottom: 24,
  },
  fitmentText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },
  scoreRow: { flexDirection: 'row', gap: 32, marginBottom: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tag: { backgroundColor: '#dbeafe', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99 },
  tagText: { fontSize: 12, fontWeight: '600', color: '#1e40af' },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },

  // Question scores
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  questionLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, width: 28 },
  questionScore: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },

  // Feedback
  feedbackItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 12, marginBottom: 8,
  },
  feedbackText: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '500', lineHeight: 20 },

  // Warning
  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#fde68a', marginBottom: 24,
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },

  // Actions
  actions: { paddingTop: 8 },
  actionBtn: { marginBottom: 12 },
});
