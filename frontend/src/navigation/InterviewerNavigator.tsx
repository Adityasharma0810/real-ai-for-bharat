import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { InterviewerStackParamList, InterviewerTabParamList } from './types';

import { InterviewerDashboardScreen } from '../screens/interviewer/DashboardScreen';
import { InterviewerJobsScreen } from '../screens/interviewer/JobsScreen';
import { InterviewerApplicantsScreen } from '../screens/interviewer/ApplicantsScreen';
import { ProfileScreen } from '../screens/home/ProfileScreen';
import { CreateJobScreen } from '../screens/interviewer/CreateJobScreen';
import { InterviewerCandidateDetailScreen } from '../screens/interviewer/CandidateDetailScreen';

const Tab = createBottomTabNavigator<InterviewerTabParamList>();
const Stack = createNativeStackNavigator<InterviewerStackParamList>();

const InterviewerTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Jobs') {
            iconName = focused ? 'briefcase' : 'briefcase-outline';
          } else if (route.name === 'Applicants') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        headerShown: false,
        tabBarStyle: {
          height: 85,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingBottom: 25,
          paddingTop: 10,
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={InterviewerDashboardScreen} />
      <Tab.Screen name="Jobs" component={InterviewerJobsScreen} />
      <Tab.Screen name="Applicants" component={InterviewerApplicantsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export const InterviewerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="InterviewerTabs" component={InterviewerTabNavigator} />
    <Stack.Screen name="CreateJob" component={CreateJobScreen} />
    <Stack.Screen name="JobApplicants" component={InterviewerApplicantsScreen} />
    <Stack.Screen name="CandidateDetail" component={InterviewerCandidateDetailScreen} />
  </Stack.Navigator>
);
