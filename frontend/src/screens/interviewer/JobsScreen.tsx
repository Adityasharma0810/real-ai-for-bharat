import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase/config';
import { AppCard } from '../../components/AppCard';
import { AuthContext } from '../../context/AuthContext';

export const InterviewerJobsScreen = ({ navigation }: any) => {
  const { user } = useContext(AuthContext);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchMyJobs();
  }, [user]);

  const fetchMyJobs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, applications(count)')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (jobId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', jobId);

      if (error) throw error;
      fetchMyJobs();
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    Alert.alert(
      'Delete Job Posting',
      'Are you sure you want to permanently delete this job? This will also remove all candidate applications for this job.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('jobs')
                .delete()
                .eq('id', jobId);

              if (error) throw error;
              fetchMyJobs();
            } catch (err) {
              console.error('Error deleting job:', err);
            }
          }
        }
      ]
    );
  };

  const renderJobItem = ({ item }: { item: any }) => (
    <AppCard 
      style={styles.jobCard} 
      onPress={() => navigation.navigate('JobApplicants', { jobId: item.id })}
    >
      <View style={styles.jobHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.jobTitle}>{item.title}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.locationText}>{item.location}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, item.status === 'open' ? styles.openBadge : styles.closedBadge]}>
          <Text style={[styles.statusText, item.status === 'open' ? styles.openText : styles.closedText]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      
      <View style={styles.jobFooter}>
        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[styles.iconBtn, { backgroundColor: '#f1f5f9' }]}
            onPress={() => handleToggleStatus(item.id, item.status)}
          >
            <Ionicons 
              name={item.status === 'open' ? "pause-circle" : "play-circle"} 
              size={18} 
              color={item.status === 'open' ? "#ea580c" : "#16a34a"} 
            />
            <Text style={[styles.iconBtnText, { color: item.status === 'open' ? "#ea580c" : "#16a34a" }]}>
              {item.status === 'open' ? "Close" : "Open"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.iconBtn, { backgroundColor: '#fef2f2' }]}
            onPress={() => handleDeleteJob(item.id)}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={[styles.iconBtnText, { color: '#dc2626' }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.viewBtn}
          onPress={() => navigation.navigate('JobApplicants', { jobId: item.id })}
        >
          <Text style={styles.viewBtnText}>Candidates</Text>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    </AppCard>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Job Openings</Text>
        <TouchableOpacity 
          style={styles.addBtn}
          onPress={() => navigation.navigate('CreateJob')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          renderItem={renderJobItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={theme.colors.border} />
              <Text style={styles.emptyText}>You haven't posted any jobs yet.</Text>
              <TouchableOpacity 
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('CreateJob')}
              >
                <Text style={styles.emptyBtnText}>Post First Job</Text>
              </TouchableOpacity>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 24,
    paddingTop: 8,
  },
  jobCard: {
    marginBottom: 16,
    padding: 16,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  openBadge: {
    backgroundColor: '#f0fdf4',
  },
  closedBadge: {
    backgroundColor: '#fef2f2',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  openText: {
    color: '#16a34a',
  },
  closedText: {
    color: '#dc2626',
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  iconBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    marginRight: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
