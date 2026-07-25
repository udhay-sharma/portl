import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPolls, castVote, createPoll, updatePoll, deletePoll, endPoll, type Poll } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../lib/auth';
import { Plus, X, Settings, Trash2, Edit3, StopCircle } from 'lucide-react-native';
import { Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export function PollsScreen() {
  const { token: authToken, user } = useAuth();
  const navigation = useNavigation<any>();
  const token = authToken as string;
  const role = user?.role as 'RESIDENT' | 'ADMIN';
  const roleColor = role === 'ADMIN' ? 'admin' : 'resident';
  const headerBg = role === 'ADMIN' ? 'bg-admin' : 'bg-resident';
  const borderClass = role === 'ADMIN' ? 'border-admin' : 'border-resident';
  const textClassActive = role === 'ADMIN' ? 'text-admin' : 'text-resident';
  const bgClassActive = role === 'ADMIN' ? 'bg-admin' : 'bg-resident';
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set());
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [expandedPolls, setExpandedPolls] = useState<Set<string>>(new Set());

  // Admin Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchPolls = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await getPolls(token);
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPolls(data);

      // Detect which polls already have votes (total count > 0 means someone voted; 
      // we track user-voted locally after casting)
    } catch (err) {
      console.error('Failed to fetch polls:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch polls');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPolls();
  };

  const handleVote = async (pollId: string, selectedOption: string) => {
    setVotingPollId(pollId);
    try {
      await castVote(token, pollId, selectedOption);
      setVotedPolls((prev) => new Set(prev).add(pollId));
      // Re-fetch to get updated tallies
      await fetchPolls();
      Alert.alert('Success', 'Your vote has been recorded!');
    } catch (err) {
      Alert.alert('Vote Failed', err instanceof Error ? err.message : 'Failed to cast vote');
    } finally {
      setVotingPollId(null);
    }
  };

  const getTotalVotes = (poll: Poll) => {
    return poll.results.reduce((sum, r) => sum + r.count, 0);
  };

  const openCreateModal = () => {
    setEditingPoll(null);
    setQuestion('');
    setOptions(['', '']);
    setModalVisible(true);
  };

  const openEditModal = (poll: Poll) => {
    setEditingPoll(poll);
    setQuestion(poll.question);
    setOptions(poll.options);
    setModalVisible(true);
  };

  const handleSubmitPoll = async () => {
    const validOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim() || validOptions.length < 2) {
      Alert.alert('Error', 'Please provide a question and at least 2 valid options.');
      return;
    }
    setSubmitLoading(true);
    try {
      if (editingPoll) {
        await updatePoll(token, editingPoll.id, { question: question.trim(), options: validOptions });
      } else {
        await createPoll(token, { question: question.trim(), options: validOptions });
      }
      setModalVisible(false);
      setEditingPoll(null);
      setQuestion('');
      setOptions(['', '']);
      fetchPolls();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save poll');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeletePoll = (id: string) => {
    Alert.alert('Delete Poll', 'Are you sure you want to delete this poll?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deletePoll(token, id);
          fetchPolls();
        } catch (err) {
          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
        }
      }}
    ]);
  };

  const handleEndPoll = (id: string) => {
    Alert.alert('End Poll', 'Are you sure you want to declare the result and stop voting?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Poll', style: 'destructive', onPress: async () => {
        try {
          await endPoll(token, id);
          fetchPolls();
        } catch (err) {
          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to end poll');
        }
      }}
    ]);
  };

  const toggleExpand = (id: string) => {
    setExpandedPolls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateOption = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = text;
    setOptions(newOptions);
  };

  const addOption = () => {
    if (options.length >= 6) {
      Alert.alert('Limit Reached', 'Maximum 6 options allowed');
      return;
    }
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) {
      Alert.alert('Minimum Options', 'A poll must have at least 2 options');
      return;
    }
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
      <View className={`${headerBg} p-md pb-4 flex-row justify-between items-start`}>
        <View className="flex-1 mr-4">
          <Text className="text-white font-bold text-xl">Polls</Text>
          <Text className="text-white text-xs opacity-90 mt-1">
            {role === 'ADMIN' ? 'Create and manage community polls.' : 'Vote on active community polls.'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} className="bg-white/20 p-2 rounded-full">
          <Settings color="#ffffff" size={20} />
        </TouchableOpacity>
      </View>

      <View className="p-md">
        {fetchError ? (
          <Card className="py-6 items-center">
            <Text className="text-status-rejected font-bold mb-2">Network Error</Text>
            <Text className="text-muted text-center text-sm mb-4">{fetchError}</Text>
            <Button title="Retry" onPress={handleRefresh} roleColor={roleColor} />
          </Card>
        ) : loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" color={role === 'ADMIN' ? '#4F46E5' : '#C99A3C'} />
            <Text className="text-muted text-sm mt-3">Loading polls...</Text>
          </View>
        ) : polls.length === 0 ? (
          <EmptyState
            title="No polls yet"
            subtitle="Community polls will appear here when created."
          />
        ) : (
          polls.map((poll) => {
            const isEnded = poll.endsAt ? new Date(poll.endsAt) < new Date() : false;
            const hasVoted = votedPolls.has(poll.id);
            const totalVotes = getTotalVotes(poll);
            const showResults = isEnded || hasVoted || (role === 'ADMIN' && totalVotes > 0);

            return (
              <Card key={poll.id} className="mb-4">
                <View className="flex-row justify-between items-start mb-1">
                  <Text className="text-text font-bold text-base flex-1 pr-2">{poll.question}</Text>
                  {isEnded && (
                    <View className="bg-status-rejected/10 px-2 py-0.5 rounded-pill">
                      <Text className="text-status-rejected text-[10px] font-bold">CLOSED</Text>
                    </View>
                  )}
                </View>
                <Text className="text-muted text-xs mb-3">
                  {poll.createdBy?.name ? `By ${poll.createdBy.name} · ` : ''}
                  {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                </Text>

                {showResults ? (
                  // Results view — show tally bars
                  <View>
                    {poll.results.map((result) => {
                      const pct = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
                      const maxVotes = Math.max(...poll.results.map(r => r.count));
                      const isWinner = isEnded && maxVotes > 0 && result.count === maxVotes;

                      return (
                        <View key={result.option} className="mb-2">
                          <View className="flex-row justify-between mb-1">
                            <Text className={`text-sm ${isWinner ? 'text-status-checkedin font-bold' : 'text-text'}`}>
                              {result.option} {isWinner && '🏆'}
                            </Text>
                            <Text className="text-muted text-xs">{result.count} ({pct}%)</Text>
                          </View>
                          <View className="bg-border rounded-pill h-2 overflow-hidden">
                            <View
                              className={`${isWinner ? 'bg-status-checkedin' : bgClassActive} rounded-pill h-2`}
                              style={{ width: `${pct}%` }}
                            />
                          </View>
                        </View>
                      );
                    })}
                    {hasVoted && (
                      <Text className="text-status-checkedin text-xs mt-2 font-semibold">
                        ✓ You voted
                      </Text>
                    )}

                    {/* View Votes Breakdown for Admins */}
                    {role === 'ADMIN' && poll.votes && poll.votes.length > 0 && (
                      <View className="mt-4 pt-3 border-t border-border">
                        <TouchableOpacity onPress={() => toggleExpand(poll.id)}>
                          <Text className="text-admin text-xs font-semibold">
                            {expandedPolls.has(poll.id) ? 'Hide Votes Detail' : 'Show Votes Detail'}
                          </Text>
                        </TouchableOpacity>
                        {expandedPolls.has(poll.id) && (
                          <View className="mt-2">
                            {poll.votes.map((v, i) => (
                              <View key={i} className="flex-row items-center mb-1">
                                <View className="w-1.5 h-1.5 rounded-full bg-admin mr-2" />
                                <Text className="text-text text-xs font-medium">{v.user.name}</Text>
                                <Text className="text-muted text-xs ml-1">voted for</Text>
                                <Text className="text-text text-xs ml-1 font-semibold">{v.selectedOption}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                ) : (
                  // Voting view — show option buttons
                  <View>
                    {poll.options.map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => handleVote(poll.id, option)}
                        disabled={votingPollId !== null || isEnded}
                        className={`border ${borderClass} rounded-control px-3 py-2.5 mb-2 ${
                          votingPollId === poll.id ? 'opacity-60' : ''
                        }`}
                      >
                        <Text className={`${textClassActive} font-semibold text-sm text-center`}>
                          {option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Admin Actions */}
                {role === 'ADMIN' && (
                  <View className="flex-row justify-end items-center mt-4 border-t border-border pt-3">
                    {!isEnded && (
                      <TouchableOpacity onPress={() => handleEndPoll(poll.id)} className="flex-row items-center mr-4">
                        <StopCircle color="#B5544A" size={16} className="mr-1" />
                        <Text className="text-status-rejected font-bold text-xs">END POLL</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => openEditModal(poll)} className="flex-row items-center mr-4">
                      <Edit3 color="#C99A3C" size={16} className="mr-1" />
                      <Text className="text-admin font-bold text-xs">EDIT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeletePoll(poll.id)} className="flex-row items-center">
                      <Trash2 color="#ef4444" size={16} className="mr-1" />
                      <Text className="text-status-rejected font-bold text-xs">DELETE</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>

      {/* Admin FAB */}
      {user?.role === 'ADMIN' && (
        <TouchableOpacity
          onPress={openCreateModal}
          className="absolute bottom-6 right-6 bg-admin w-14 h-14 rounded-full items-center justify-center shadow-lg"
        >
          <Plus color="#ffffff" size={28} />
        </TouchableOpacity>
      )}

      {/* Admin Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl p-6 min-h-[60%]">
            <Text className="text-text font-bold text-xl mb-6">
              {editingPoll ? 'Edit Poll' : 'Create Poll'}
            </Text>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-1 ml-1">Question *</Text>
              <TextInput
                className="bg-bg text-text px-4 py-3 rounded-control border border-border"
                placeholder="e.g. Should we host a Diwali party?"
                placeholderTextColor="#64748b"
                value={question}
                onChangeText={setQuestion}
              />
            </View>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-2 ml-1">Options (min 2, max 6) *</Text>
              {options.map((opt, index) => (
                <View key={index} className="flex-row items-center mb-2">
                  <TextInput
                    className="flex-1 bg-bg text-text px-4 py-3 rounded-control border border-border"
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor="#64748b"
                    value={opt}
                    onChangeText={(text) => updateOption(index, text)}
                  />
                  {options.length > 2 && (
                    <TouchableOpacity
                      onPress={() => removeOption(index)}
                      className="ml-2 p-2 bg-bg border border-border rounded-control"
                    >
                      <X color="#ef4444" size={20} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {options.length < 6 && (
                <TouchableOpacity onPress={addOption} className="mt-2 py-2 items-center">
                  <Text className="text-admin font-semibold">+ Add another option</Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="flex-row justify-end space-x-3 mt-4">
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setQuestion('');
                  setOptions(['', '']);
                }}
                className="px-6 py-3 rounded-control"
              >
                <Text className="text-muted font-bold">CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitPoll}
                disabled={submitLoading}
                className="bg-admin px-6 py-3 rounded-control"
              >
                <Text className="text-bg font-bold">{submitLoading ? 'SAVING...' : 'SAVE'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
