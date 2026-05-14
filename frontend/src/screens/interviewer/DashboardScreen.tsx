import React, { useContext, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AuthContext } from '../../context/AuthContext';
import { AppCard } from '../../components/AppCard';
import { supabase } from '../../services/supabase/config';
import { getResults } from '../../services/interviewService';

// ── Fitment helpers ───────────────────────────────────────────────────────────
const FITMENT_COLOR: Record<string, string> = {
  'Job-Ready': '#10b981',
  'Requires Training': '#f59e0b',
  'Low Confidence': '#ef4444',
  'Requires Significant Upskilling': '#8b5cf6',
  'Requires Manual Verification': '#0ea5e9',
};

const FITMENT_BG: Record<string, string> = {
  'Job-Ready': '#f0fdf4',
  'Requires Training': '#fffbeb',
  'Low Confidence': '#fef2f2',
  'Requires Significant Upskilling': '#f5f3ff',
  'Requires Manual Verification': '#f0f9ff',
};

function scoreColor(s: number) {
  if (s >= 7.5) return '#10b981';
  if (s >= 5) return '#f59e0b';
  return '#ef4444';
}

// ── Mini score bar ────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const color = scoreColor(score);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={{ flex: 1, height: 5, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 99 }} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color, minWidth: 28 }}>{score.toFixed(1)}</Text>
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, bg, color }: any) {
  return (
    <AppCard style={[styles.statCard, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </AppCard>
  );
}

// ── Fitment bar chart (native, no recharts) ───────────────────────────────────
function FitmentChart({ data }: { data: { label: string; count: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={{ gap: 10 }}>
      {data.map(d => (
        <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, width: 110 }} numberOfLines={1}>{d.label}</Text>
          <View style={{ flex: 1, height: 18, backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
            <View style={{
              width: `${(d.count / max) * 100}%`,
              height: '100%',
              backgroundColor: d.color,
              borderRadius: 6,
              justifyContent: 'center',
              paddingLeft: 6,
            }}>
              {d.count > 0 && <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{d.count}</Text>}
            </View>
          </View>
          {d.count === 0 && <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>0</Text>}
        </View>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const InterviewerDashboardScreen = ({ navigation }: any) => {
  const { user, profile } = useContext(AuthContext);
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalInterviews: 0,
    jobReady: 0,
    requiresTraining: 0,
    flagged: 0,
    totalJobs: 0,
    totalApplicants: 0,
    avgScore: 0,
  });
  const [recentInterviews, setRecentInterviews] = useState<any[]>([]);
  const [fitmentBreakdown, setFitmentBreakdown] = useState<{ label: string; count: number; color: string }[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ label: string; count: number; color: string }[]>([]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch jobs owned by this user (admin sees all)
      const jobsQuery = supabase.from('jobs').select('id', { count: 'exact' });
      if (!isAdmin) jobsQuery.eq('created_by', user.id);
      const { data: jobsData, count: jobsCount } = await jobsQuery;
      const jobIds = (jobsData || []).map((j: any) => j.id);

      // Applications count
      let appCount = 0;
      if (jobIds.length > 0) {
        const { count } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .in('job_id', jobIds);
        appCount = count || 0;
      }

      let ivList: any[] = await getResults();

      if (!isAdmin) {
        if (jobIds.length > 0) {
          // Get user_ids of all applicants for this employer's jobs
          const { data: apps } = await supabase
            .from('applications').select('user_id').in('job_id', jobIds);
          const applicantIds = [...new Set((apps || []).map((a: any) => a.user_id).filter(Boolean))];
          if (applicantIds.length > 0) {
            ivList = ivList.filter((iv: any) => applicantIds.includes(iv.user_id) || jobIds.includes(iv.job_id));
          } else {
            // No applicants — empty interviews
            setStats({ totalInterviews: 0, jobReady: 0, requiresTraining: 0, flagged: 0, totalJobs: jobsCount || 0, totalApplicants: appCount, avgScore: 0 });
            setRecentInterviews([]);
            setFitmentBreakdown([]);
            setCategoryBreakdown([]);
            return;
          }
        } else {
          // No jobs posted yet
          setStats({ totalInterviews: 0, jobReady: 0, requiresTraining: 0, flagged: 0, totalJobs: 0, totalApplicants: 0, avgScore: 0 });
          setRecentInterviews([]);
          setFitmentBreakdown([]);
          setCategoryBreakdown([]);
          return;
        }
      }

      // Stats
      const jobReadyCount = ivList.filter((i: any) => i.fitment === 'Job-Ready').length;
      const trainingCount = ivList.filter((i: any) => i.fitment === 'Requires Training').length;
      const flaggedCount = ivList.filter((i: any) => i.integrity_flag).length;
      const scores = ivList.map((i: any) => Number(i.average_score || 0)).filter(s => s > 0);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

      setStats({
        totalInterviews: ivList.length,
        jobReady: jobReadyCount,
        requiresTraining: trainingCount,
        flagged: flaggedCount,
        totalJobs: jobsCount || 0,
        totalApplicants: appCount,
        avgScore,
      });

      // Recent 5
      setRecentInterviews(ivList.slice(0, 5));

      // Fitment breakdown
      const fitmentOrder = ['Job-Ready', 'Requires Training', 'Low Confidence', 'Requires Significant Upskilling', 'Requires Manual Verification'];
      setFitmentBreakdown(fitmentOrder.map(f => ({
        label: f === 'Requires Significant Upskilling' ? 'Needs Upskilling' : f === 'Requires Manual Verification' ? 'Manual Verification' : f,
        count: ivList.filter((i: any) => i.fitment === f).length,
        color: FITMENT_COLOR[f] ?? '#94a3b8',
      })));

      // Category breakdown
      const cats: Record<string, number> = {};
      ivList.forEach((i: any) => { const c = i.category || 'Unknown'; cats[c] = (cats[c] || 0) + 1; });
      const catColors: Record<string, string> = {
        'Blue-collar Trades': '#3b82f6',
        'Polytechnic-Skilled Roles': '#8b5cf6',
        'Semi-Skilled Workforce': '#f59e0b',
        'Unknown': '#94a3b8',
      };
      setCategoryBreakdown(Object.entries(cats).map(([label, count]) => ({
        label, count, color: catColors[label] ?? '#94a3b8',
      })));

    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {isAdmin ? '🏛️ Admin Dashboard' : `Welcome, ${profile?.full_name?.split(' ')[0] || 'Interviewer'}`}
            </Text>
            <Text style={styles.subtitle}>
              {isAdmin ? 'All candidates across the platform' : 'Your jobs and candidate assessments'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Ionicons name="person-circle" size={40} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard icon="mic" label="Interviews" value={stats.totalInterviews} bg="#eef2ff" color={theme.colors.primary} />
          <StatCard icon="checkmark-circle" label="Job-Ready" value={stats.jobReady} bg="#f0fdf4" color="#10b981" />
          <StatCard icon="school" label="Needs Training" value={stats.requiresTraining} bg="#fffbeb" color="#f59e0b" />
          <StatCard icon="warning" label="Flagged" value={stats.flagged} bg="#fef2f2" color="#ef4444" />
          <StatCard icon="briefcase" label="Jobs Posted" value={stats.totalJobs} bg="#f5f3ff" color="#8b5cf6" />
          <StatCard icon="trending-up" label="Avg Score" value={stats.avgScore > 0 ? `${stats.avgScore.toFixed(1)}/10` : '—'} bg="#f0f9ff" color="#0ea5e9" />
        </View>

        {/* Fitment breakdown */}
        {fitmentBreakdown.some(d => d.count > 0) && (
          <AppCard style={styles.chartCard}>
            <Text style={styles.chartTitle}>Fitment Breakdown</Text>
            <FitmentChart data={fitmentBreakdown} />
          </AppCard>
        )}

        {/* Category breakdown */}
        {categoryBreakdown.length > 0 && (
          <AppCard style={styles.chartCard}>
            <Text style={styles.chartTitle}>Category Breakdown</Text>
            <FitmentChart data={categoryBreakdown} />
          </AppCard>
        )}

        {/* Quick actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Applicants')}>
              <AppCard style={styles.actionCard} variant="outlined">
                <View style={[styles.actionIcon, { backgroundColor: '#eef2ff' }]}>
                  <Ionicons name="people" size={26} color={theme.colors.primary} />
                </View>
                <Text style={styles.actionText}>All Candidates</Text>
              </AppCard>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateJob')}>
              <AppCard style={styles.actionCard} variant="outlined">
                <View style={[styles.actionIcon, { backgroundColor: '#fdf2f8' }]}>
                  <Ionicons name="add-circle" size={26} color="#db2777" />
                </View>
                <Text style={styles.actionText}>Post New Job</Text>
              </AppCard>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Jobs')}>
              <AppCard style={styles.actionCard} variant="outlined">
                <View style={[styles.actionIcon, { backgroundColor: '#f0f9ff' }]}>
                  <Ionicons name="list" size={26} color="#0ea5e9" />
                </View>
                <Text style={styles.actionText}>My Jobs</Text>
              </AppCard>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('Applicants', { filterFlagged: true })}
            >
              <AppCard style={styles.actionCard} variant="outlined">
                <View style={[styles.actionIcon, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="shield-checkmark" size={26} color="#ef4444" />
                </View>
                <Text style={styles.actionText}>Flagged Cases</Text>
                {stats.flagged > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stats.flagged}</Text>
                  </View>
                )}
              </AppCard>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent interviews */}
        {recentInterviews.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Recent Interviews</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Applicants')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {recentInterviews.map((iv: any) => (
              <AppCard key={iv.id} style={styles.recentCard}>
                <View style={styles.recentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {iv.candidate_name || 'Unknown'}
                      {iv.integrity_flag && (
                        <Text style={{ color: '#f59e0b' }}> ⚑</Text>
                      )}
                    </Text>
                    <Text style={styles.recentSub}>
                      {iv.trade || '—'}{iv.district ? ` · ${iv.district}` : ''}{iv.language ? ` · ${iv.language}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.fitmentPill, { backgroundColor: FITMENT_BG[iv.fitment] ?? '#f1f5f9' }]}>
                      <Text style={[styles.fitmentPillText, { color: FITMENT_COLOR[iv.fitment] ?? '#64748b' }]}>
                        {iv.fitment ?? 'Pending'}
                      </Text>
                    </View>
                    {iv.average_score != null && (
                      <Text style={[styles.recentScore, { color: scoreColor(iv.average_score) }]}>
                        {Number(iv.average_score).toFixed(1)}/10
                      </Text>
                    )}
                  </View>
                </View>
              </AppCard>
            ))}
          </View>
        )}

        {stats.totalInterviews === 0 && (
          <AppCard style={styles.emptyCard}>
            <Ionicons name="mic-outline" size={48} color={theme.colors.border} />
            <Text style={styles.emptyTitle}>No interviews yet</Text>
            <Text style={styles.emptyText}>
              Once candidates complete voice interviews, their results will appear here.
            </Text>
          </AppCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 24,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, marginBottom: 20,
  },
  statCard: {
    width: '31%', padding: 12, alignItems: 'center',
    flexGrow: 1,
  },
  statValue: { fontSize: 18, fontWeight: '900', marginVertical: 4 },
  statLabel: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  chartCard: { marginBottom: 16, padding: 16 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 14 },
  section: { marginBottom: 20 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  seeAll: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47%' },
  actionCard: { padding: 14, alignItems: 'center', position: 'relative' },
  actionIcon: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  actionText: { fontSize: 13, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  badge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#ef4444', borderRadius: 99,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 2, borderColor: '#fff',
  },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '800' },
  recentCard: { marginBottom: 10, padding: 14 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recentName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  recentSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  recentScore: { fontSize: 13, fontWeight: '800' },
  fitmentPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
  },
  fitmentPillText: { fontSize: 10, fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
