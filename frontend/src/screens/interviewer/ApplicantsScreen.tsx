import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, ScrollView, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase/config';
import { AppCard } from '../../components/AppCard';
import { AuthContext } from '../../context/AuthContext';
import { getBlockedCandidates, getResults, updateInterviewAdminStatus } from '../../services/interviewService';

// ── Types ─────────────────────────────────────────────────────────────────────
type Candidate = {
  id: string;
  hasInterview: boolean;
  userId: string | null;
  jobId: string | null;
  applicationId: string | null;
  name: string;
  trade: string;
  district: string;
  language: string;
  category: string;
  score: number;
  confidence: number;
  fitment: string;
  integrityFlag: boolean;
  appStatus: string;
  interviewDate: string;
  weakTopics: string[];
  feedback: any;
  scores: number[];
  phoneNumber?: string;
};

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
const STATUS_COLOR: Record<string, string> = {
  shortlisted: '#10b981',
  rejected: '#ef4444',
  marked_for_training: '#8b5cf6',
  blocked: '#111827',
  applied: '#64748b',
  pending: '#64748b',
};

function scoreColor(s: number) {
  if (s >= 7.5) return '#10b981';
  if (s >= 5) return '#f59e0b';
  return '#ef4444';
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value?: string | null) {
  return (value || '').replace(/\D/g, '');
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const InterviewerApplicantsScreen = ({ route, navigation }: any) => {
  const { user, profile } = useContext(AuthContext);
  const isAdmin = profile?.role === 'admin';
  const { jobId, filterFlagged } = route.params || {};

  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterFitment, setFilterFitment] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterLanguage, setFilterLanguage] = useState('All');
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMinScore, setFilterMinScore] = useState('');
  const [filterMaxScore, setFilterMaxScore] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(filterFlagged ?? false);

  // Re-sync onlyFlagged when route params change (e.g. navigating from Dashboard)
  useEffect(() => {
    if (filterFlagged !== undefined) {
      setOnlyFlagged(filterFlagged);
    }
  }, [filterFlagged]);

  // Unique filter options derived from data
  const districts = useMemo(() => {
    const s = new Set(allCandidates.map(c => c.district).filter(Boolean));
    return ['All', ...Array.from(s).sort()];
  }, [allCandidates]);

  const languages = useMemo(() => {
    const s = new Set(allCandidates.map(c => c.language).filter(Boolean));
    return ['All', ...Array.from(s).sort()];
  }, [allCandidates]);

  const fetchCandidates = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let allowedJobIds: string[] | null = null;
      let allowedApplicantUserIds: string[] | null = null;

      if (!isAdmin) {
        const { data: myJobs } = await supabase
          .from('jobs').select('id').eq('created_by', user.id);
        allowedJobIds = (myJobs || []).map((j: any) => j.id);

        if (allowedJobIds.length > 0) {
          const { data: apps } = await supabase
            .from('applications').select('user_id').in('job_id', allowedJobIds);
          allowedApplicantUserIds = [...new Set((apps || []).map((a: any) => a.user_id).filter(Boolean))] as string[];

          if (allowedApplicantUserIds.length === 0) {
            setAllCandidates([]);
            setLoading(false);
            return;
          }
        } else {
          setAllCandidates([]);
          setLoading(false);
          return;
        }
      }

      let interviews = await getResults();
      const blockedRows = isAdmin ? await getBlockedCandidates().catch(() => []) : [];
      const blockedUserIds = new Set((blockedRows || []).map((row: any) => row.user_id).filter(Boolean));
      if (jobId) interviews = interviews.filter((iv: any) => iv.job_id === jobId);
      if (!isAdmin) {
        interviews = interviews.filter((iv: any) =>
          (iv.job_id && allowedJobIds?.includes(iv.job_id)) ||
          (iv.user_id && allowedApplicantUserIds?.includes(iv.user_id))
        );
      }

      // Fetch application statuses for matched user+job pairs
      const userJobPairs = (interviews || [])
        .filter((i: any) => i.user_id && i.job_id)
        .map((i: any) => ({ user_id: i.user_id, job_id: i.job_id }));

      let appMap: Record<string, string> = {};
      let appIdMap: Record<string, string> = {};
      if (userJobPairs.length > 0) {
        const userIds = [...new Set(userJobPairs.map(p => p.user_id))];
        const { data: apps } = await supabase
          .from('applications')
          .select('id, user_id, job_id, status')
          .in('user_id', userIds);
        (apps || []).forEach((a: any) => {
          const key = `${a.user_id}__${a.job_id}`;
          appMap[key] = a.status;
          appIdMap[key] = a.id;
        });
      }

      const candidates: Candidate[] = (interviews || []).map((iv: any) => {
        const key = `${iv.user_id}__${iv.job_id}`;
        return {
          id: iv.id,
          hasInterview: true,
          userId: iv.user_id,
          jobId: iv.job_id,
          applicationId: appIdMap[key] ?? null,
          name: iv.candidate_name || 'Unknown',
          trade: iv.trade || '—',
          district: iv.district || '—',
          language: iv.language || '—',
          category: iv.category || 'Unknown',
          score: Number(iv.average_score || 0),
          confidence: Number(iv.confidence_score || 0),
          fitment: iv.fitment || 'Pending',
          integrityFlag: iv.integrity_flag || blockedUserIds.has(iv.user_id) || false,
          // Use admin_status if set, otherwise fall back to application status
          appStatus: blockedUserIds.has(iv.user_id) ? 'blocked' : (iv.admin_status || appMap[key] || 'applied'),
          interviewDate: iv.interview_date ?? iv.created_at,
          weakTopics: iv.weak_topics || [],
          feedback: iv.feedback || null,
          scores: iv.scores || [],
          phoneNumber: iv.phone_number || '',
        };
      });

      if (isAdmin) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, phone, trade, district, role');

        if (profilesError) {
          console.warn('Admin profiles fetch failed:', profilesError.message);
        }

        const existingUserIds = new Set(candidates.map((c) => c.userId).filter(Boolean));
        const profileOnlyCandidates: Candidate[] = (profiles || [])
          .filter((p: any) => (p.role === 'candidate' || !p.role) && !existingUserIds.has(p.id))
          .map((p: any) => ({
            id: `profile_${p.id}`,
            hasInterview: false,
            userId: p.id,
            jobId: null,
            applicationId: null,
            name: p.full_name || 'Unknown',
            trade: p.trade || '—',
            district: p.district || '—',
            language: '—',
            category: 'No interview yet',
            score: 0,
            confidence: 0,
            fitment: 'Not Interviewed',
            integrityFlag: blockedUserIds.has(p.id),
            appStatus: blockedUserIds.has(p.id) ? 'blocked' : 'pending',
            interviewDate: '',
            weakTopics: [],
            feedback: null,
            scores: [],
            phoneNumber: p.phone || '',
          }));

        const unmatchedProfileOnlyCandidates = profileOnlyCandidates
          .filter((profileCandidate) => {
            const profilePhone = normalizePhone(profileCandidate.phoneNumber);
            const profileName = normalizeText(profileCandidate.name);
            const profileTrade = normalizeText(profileCandidate.trade);
            const matchedIndex = candidates.findIndex((candidate) => {
              if (candidate.userId && candidate.userId === profileCandidate.userId) return true;
              if (profilePhone && normalizePhone(candidate.phoneNumber) === profilePhone) return true;

              const candidateName = normalizeText(candidate.name);
              const candidateTrade = normalizeText(candidate.trade);
              const tradeMatches = !profileTrade || !candidateTrade || candidateTrade === profileTrade;
              return !!profileName && candidateName === profileName && tradeMatches;
            });

            if (matchedIndex >= 0) {
              const matched = candidates[matchedIndex];
              candidates[matchedIndex] = {
                ...matched,
                userId: matched.userId || profileCandidate.userId,
                district: matched.district || profileCandidate.district,
                phoneNumber: matched.phoneNumber || profileCandidate.phoneNumber || '',
              };
              return false;
            }

            return true;
          })
          .map((candidate) => ({
            ...candidate,
            category: 'No saved result',
            fitment: 'Result Missing',
          }));

        setAllCandidates([...candidates, ...unmatchedProfileOnlyCandidates]);
      } else {
        setAllCandidates(candidates);
      }
    } catch (err) {
      console.error('Error fetching candidates:', err);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, jobId]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchCandidates);
    return unsub;
  }, [navigation, fetchCandidates]);

  // Apply filters
  const filtered = useMemo(() => {
    return allCandidates.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
          !c.trade.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterFitment !== 'All' && c.fitment !== filterFitment) return false;
      if (filterCategory !== 'All' && c.category !== filterCategory) return false;
      if (filterLanguage !== 'All' && c.language !== filterLanguage) return false;
      if (filterDistrict !== 'All' && c.district !== filterDistrict) return false;
      if (filterStatus !== 'all' && c.appStatus !== filterStatus) return false;
      if (filterMinScore && c.score < parseFloat(filterMinScore)) return false;
      if (filterMaxScore && c.score > parseFloat(filterMaxScore)) return false;
      if (onlyFlagged && !c.integrityFlag) return false;
      return true;
    });
  }, [allCandidates, search, filterFitment, filterCategory, filterLanguage, filterDistrict, filterStatus, filterMinScore, filterMaxScore, onlyFlagged]);

  const activeFilterCount = [
    filterFitment !== 'All', filterCategory !== 'All', filterLanguage !== 'All',
    filterDistrict !== 'All', filterStatus !== 'all', !!filterMinScore, !!filterMaxScore, onlyFlagged,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterFitment('All'); setFilterCategory('All'); setFilterLanguage('All');
    setFilterDistrict('All'); setFilterStatus('all'); setFilterMinScore('');
    setFilterMaxScore(''); setOnlyFlagged(false);
  };

  const updateAppStatus = async (candidate: Candidate, status: string) => {
    // Optimistic update
    setAllCandidates(prev => prev.map(c =>
      c.id === candidate.id ? { ...c, appStatus: status } : c
    ));
    try {
      // Always write to interviews.admin_status — works without an application record
      await updateInterviewAdminStatus(candidate.id, status);

      // Also update applications table if a record exists (best-effort)
      if (candidate.applicationId) {
        await supabase.from('applications').update({ status }).eq('id', candidate.applicationId);
      } else if (candidate.userId && candidate.jobId) {
        const { data: app } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', candidate.userId)
          .eq('job_id', candidate.jobId)
          .maybeSingle();
        if (app?.id) {
          await supabase.from('applications').update({ status }).eq('id', app.id);
        }
      }
    } catch (err) {
      console.error('Status update failed:', err);
      // Rollback
      setAllCandidates(prev => prev.map(c =>
        c.id === candidate.id ? { ...c, appStatus: candidate.appStatus } : c
      ));
    }
  };

  const renderItem = ({ item, index }: { item: Candidate; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => navigation.navigate('CandidateDetail', {
        candidateId: item.userId,
        jobId: item.jobId,
        interviewId: item.hasInterview ? item.id : undefined,
      })}
    >
      <AppCard style={[
        styles.card,
        ...(item.integrityFlag ? [{ borderLeftWidth: 3, borderLeftColor: '#f59e0b' } as any] : []),
      ]}>
        {/* Rank + name row */}
        <View style={styles.cardTop}>
          <View style={styles.rankBox}>
            <Text style={[styles.rank, index < 3 && { color: theme.colors.primary }]}>#{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {item.integrityFlag && <Ionicons name="warning" size={13} color="#f59e0b" />}
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              {item.trade}
              {item.district !== '—' ? ` · ${item.district}` : ''}
              {item.language !== '—' ? ` · ${item.language}` : ''}
            </Text>
          </View>
          {/* Score */}
          <View style={[styles.scorePill, { backgroundColor: item.score >= 7.5 ? '#f0fdf4' : item.score >= 5 ? '#fffbeb' : '#fef2f2' }]}>
            <Text style={[styles.scoreText, { color: scoreColor(item.score) }]}>
              {item.score > 0 ? `${item.score.toFixed(1)}/10` : '—'}
            </Text>
          </View>
        </View>

        {/* Fitment + category + confidence */}
        <View style={styles.cardMid}>
          <View style={[styles.fitmentPill, { backgroundColor: FITMENT_BG[item.fitment] ?? '#f1f5f9' }]}>
            <Text style={[styles.fitmentText, { color: FITMENT_COLOR[item.fitment] ?? '#64748b' }]}>
              {item.fitment}
            </Text>
          </View>
          <Text style={styles.categoryText}>{item.category}</Text>
          {item.confidence > 0 && (
            <Text style={styles.confText}>Conf: {item.confidence.toFixed(0)}%</Text>
          )}
        </View>

        {/* Action buttons — show for all candidates that have a user_id */}
        {item.hasInterview && item.userId && (
          <View style={styles.cardActions}>
            {/* Status tag — shown when a decision has been made */}
            {item.appStatus !== 'not_applied' && item.appStatus !== 'applied' ? (
              <>
                <View style={[styles.statusTag, { backgroundColor: STATUS_COLOR[item.appStatus] ?? '#64748b' }]}>
                  <Text style={styles.statusTagText}>{item.appStatus.replace(/_/g, ' ').toUpperCase()}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f1f5f9' }]}
                  onPress={() => updateAppStatus(item, 'applied')}
                >
                  <Ionicons name="refresh" size={14} color={theme.colors.textSecondary} />
                  <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>Reset</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f0fdf4' }]}
                  onPress={() => updateAppStatus(item, 'shortlisted')}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={[styles.actionText, { color: '#10b981' }]}>Shortlist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f5f3ff' }]}
                  onPress={() => updateAppStatus(item, 'marked_for_training')}
                >
                  <Ionicons name="school" size={16} color="#8b5cf6" />
                  <Text style={[styles.actionText, { color: '#8b5cf6' }]}>Training</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]}
                  onPress={() => updateAppStatus(item, 'rejected')}
                >
                  <Ionicons name="close-circle" size={16} color="#ef4444" />
                  <Text style={[styles.actionText, { color: '#ef4444' }]}>Reject</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </AppCard>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {jobId && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 8 }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>
          {onlyFlagged ? '⚑ Flagged Cases' : 'Candidates'}
        </Text>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="options" size={18} color={activeFilterCount > 0 ? '#fff' : theme.colors.primary} />
          {activeFilterCount > 0 && (
            <Text style={styles.filterCount}>{activeFilterCount}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or trade..."
          placeholderTextColor={theme.colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeFilters} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {filterFitment !== 'All' && <Chip label={filterFitment} active onPress={() => setFilterFitment('All')} />}
          {filterCategory !== 'All' && <Chip label={filterCategory} active onPress={() => setFilterCategory('All')} />}
          {filterLanguage !== 'All' && <Chip label={filterLanguage} active onPress={() => setFilterLanguage('All')} />}
          {filterDistrict !== 'All' && <Chip label={filterDistrict} active onPress={() => setFilterDistrict('All')} />}
          {filterStatus !== 'all' && <Chip label={filterStatus} active onPress={() => setFilterStatus('all')} />}
          {onlyFlagged && <Chip label="⚑ Flagged" active onPress={() => setOnlyFlagged(false)} />}
          <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear all</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Count */}
      <Text style={styles.countText}>
        {filtered.length} of {allCandidates.length} candidates
      </Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={theme.colors.border} />
              <Text style={styles.emptyText}>No candidates match the current filters.</Text>
            </View>
          }
        />
      )}

      {/* Filter modal */}
      <Modal visible={showFilters} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilters(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Candidates</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>

            <Text style={styles.filterLabel}>Fitment / Classification</Text>
            <View style={styles.chipRow}>
              {[
                'All',
                'Job-Ready',
                'Requires Training',
                'Low Confidence',
                'Requires Significant Upskilling',
                'Requires Manual Verification',
              ].map(f => (
                <Chip
                  key={f}
                  label={f === 'Requires Significant Upskilling' ? 'Needs Upskilling' : f}
                  active={filterFitment === f}
                  onPress={() => setFilterFitment(f)}
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Category</Text>
            <View style={styles.chipRow}>
              {['All', 'Blue-collar Trades', 'Polytechnic-Skilled Roles', 'Semi-Skilled Workforce'].map(c => (
                <Chip key={c} label={c} active={filterCategory === c} onPress={() => setFilterCategory(c)} />
              ))}
            </View>

            <Text style={styles.filterLabel}>Language</Text>
            <View style={styles.chipRow}>
              {languages.map(l => (
                <Chip key={l} label={l} active={filterLanguage === l} onPress={() => setFilterLanguage(l)} />
              ))}
            </View>

            <Text style={styles.filterLabel}>District</Text>
            <View style={styles.chipRow}>
              {districts.map(d => (
                <Chip key={d} label={d} active={filterDistrict === d} onPress={() => setFilterDistrict(d)} />
              ))}
            </View>

            <Text style={styles.filterLabel}>Application Status</Text>
            <View style={styles.chipRow}>
              {['all', 'applied', 'shortlisted', 'marked_for_training', 'rejected', 'blocked'].map(s => (
                <Chip key={s} label={s === 'all' ? 'All' : s.replace('_', ' ')} active={filterStatus === s} onPress={() => setFilterStatus(s)} />
              ))}
            </View>

            <Text style={styles.filterLabel}>Score Range (0–10)</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterSubLabel}>Min</Text>
                <TextInput
                  style={styles.scoreInput}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={filterMinScore}
                  onChangeText={setFilterMinScore}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterSubLabel}>Max</Text>
                <TextInput
                  style={styles.scoreInput}
                  placeholder="10"
                  keyboardType="decimal-pad"
                  value={filterMaxScore}
                  onChangeText={setFilterMaxScore}
                />
              </View>
            </View>

            <Text style={styles.filterLabel}>Integrity</Text>
            <View style={styles.chipRow}>
              <Chip label="Show all" active={!onlyFlagged} onPress={() => setOnlyFlagged(false)} />
              <Chip label="⚑ Flagged only" active={onlyFlagged} onPress={() => setOnlyFlagged(true)} />
            </View>

          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.clearAllBtn} onPress={clearFilters}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
              <Text style={styles.applyText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: theme.colors.text },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: `${theme.colors.primary}15`,
    borderWidth: 1, borderColor: theme.colors.primary,
  },
  filterBtnActive: { backgroundColor: theme.colors.primary },
  filterCount: { fontSize: 12, fontWeight: '800', color: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  activeFilters: { maxHeight: 44, marginBottom: 4 },
  countText: {
    fontSize: 12, color: theme.colors.textSecondary,
    paddingHorizontal: 16, marginBottom: 8, fontWeight: '600',
  },
  list: { padding: 12, paddingBottom: 40 },
  card: { marginBottom: 10, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  rankBox: { width: 32, alignItems: 'center' },
  rank: { fontSize: 14, fontWeight: '800', color: theme.colors.textSecondary },
  name: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  scorePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  scoreText: { fontSize: 13, fontWeight: '800' },
  cardMid: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  fitmentPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  fitmentText: { fontSize: 11, fontWeight: '700' },
  categoryText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  confText: { fontSize: 11, color: theme.colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionText: { fontSize: 12, fontWeight: '700' },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusTagText: { fontSize: 10, color: '#fff', fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { backgroundColor: `${theme.colors.primary}15`, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: '#fee2e2' },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  modalContent: { padding: 20 },
  filterLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterSubLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 },
  scoreInput: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.text,
    backgroundColor: '#f8fafc',
  },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: 20,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  clearAllBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center',
  },
  clearAllText: { fontSize: 15, fontWeight: '700', color: theme.colors.textSecondary },
  applyBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: theme.colors.primary, alignItems: 'center',
  },
  applyText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
