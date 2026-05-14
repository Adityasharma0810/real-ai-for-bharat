import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase/config';
import { AppCard } from '../../components/AppCard';
import { AuthContext } from '../../context/AuthContext';

export const JobBrowsingScreen = ({ navigation }: any) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { t, user, profile } = useContext(AuthContext);

  useEffect(() => {
    fetchJobs();
  }, [profile?.trade]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      // Fix 1.5: Guard the blocked_candidates query — only run when user.id is defined
      let blockedCompanyIds: string[] = [];
      if (user?.id) {
        const { data: blockedData } = await supabase
          .from('blocked_candidates')
          .select('company_id')
          .eq('user_id', user.id);
        blockedCompanyIds = blockedData?.map(b => b.company_id) || [];
      }

      let query = supabase
        .from('jobs')
        .select('*, companies(company_name)')
        .eq('status', 'open');
      
      if (blockedCompanyIds.length > 0) {
        query = query.not('company_id', 'in', `(${blockedCompanyIds.join(',')})`);
      }

      // Filter by candidate's trade — only show jobs matching their trade.
      // If trade is 'Other' or not set, show all jobs.
      const candidateTrade = profile?.trade;
      if (candidateTrade && candidateTrade.toLowerCase() !== 'other') {
        query = query.ilike('trade', candidateTrade);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTranslatedTrade = (trade: string) => {
    if (!trade) return '';
    const key = `trade_${trade.toLowerCase()}`;
    const translated = t(key as any);
    return translated === key ? trade : translated;
  };

  const getTranslatedExperience = (exp: string) => {
    if (!exp) return '';
    if (exp === 'Fresher') return t('exp_fresher' as any);
    return exp.replace('years', t('years' as any));
  };

  const filteredJobs = jobs.filter(job => 
    job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.trade.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.companies.company_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderJobItem = ({ item }: { item: any }) => (
    <AppCard 
      style={styles.jobCard} 
      onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}
    >
      <View style={styles.jobHeader}>
        <View>
          <Text style={styles.jobTitle}>{item.title}</Text>
          <Text style={styles.companyName}>{item.companies?.company_name}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{getTranslatedTrade(item.trade)}</Text>
        </View>
      </View>
      
      <View style={styles.jobInfo}>
        <View style={styles.infoItem}>
          <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.infoText}>{item.location}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="briefcase-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.infoText}>{getTranslatedExperience(item.experience_required)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.salaryText}>{item.openings} {t('openings' as any)}</Text>
        <TouchableOpacity 
          style={styles.applyBtn}
          onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}
        >
          <Text style={styles.applyBtnText}>{t('view_details' as any)}</Text>
        </TouchableOpacity>
      </View>
    </AppCard>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('available_jobs' as any)}</Text>
        <Text style={styles.headerSubtitle}>{t('find_opportunity' as any)}</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder' as any)}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredJobs}
          renderItem={renderJobItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="briefcase-outline" size={48} color={theme.colors.border} />
              <Text style={styles.emptyText}>{t('no_jobs_found' as any)}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.md,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  jobCard: {
    marginBottom: theme.spacing.md,
    padding: 16,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  companyName: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: theme.colors.secondary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  jobInfo: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  salaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  applyBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
});
