import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { getPolls, castVote, type Poll } from '../lib/api';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';

interface PollsScreenProps {
  token: string;
}

export function PollsScreen({ token }: PollsScreenProps) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set());
  const [votingPollId, setVotingPollId] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    try {
      const data = await getPolls(token);
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPolls(data);

      // Detect which polls already have votes (total count > 0 means someone voted; 
      // we track user-voted locally after casting)
    } catch (err) {
      console.error('Failed to fetch polls:', err);
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

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View className="bg-resident p-md pb-4">
        <Text className="text-white font-bold text-xl">Polls</Text>
        <Text className="text-white text-xs opacity-90 mt-1">
          Vote on active community polls.
        </Text>
      </View>

      <View className="p-md">
        {loading ? (
          <Text className="text-muted text-sm italic py-4">Loading polls...</Text>
        ) : polls.length === 0 ? (
          <EmptyState
            title="No polls yet"
            subtitle="Community polls will appear here when created."
          />
        ) : (
          polls.map((poll) => {
            const hasVoted = votedPolls.has(poll.id);
            const totalVotes = getTotalVotes(poll);
            const showResults = hasVoted || totalVotes > 0;

            return (
              <Card key={poll.id} className="mb-4">
                <Text className="text-text font-bold text-base mb-1">{poll.question}</Text>
                <Text className="text-muted text-xs mb-3">
                  {poll.createdBy?.name ? `By ${poll.createdBy.name} · ` : ''}
                  {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                </Text>

                {showResults ? (
                  // Results view — show tally bars
                  <View>
                    {poll.results.map((result) => {
                      const pct = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
                      return (
                        <View key={result.option} className="mb-2">
                          <View className="flex-row justify-between mb-1">
                            <Text className="text-text text-sm">{result.option}</Text>
                            <Text className="text-muted text-xs">{result.count} ({pct}%)</Text>
                          </View>
                          <View className="bg-border rounded-pill h-2 overflow-hidden">
                            <View
                              className="bg-resident rounded-pill h-2"
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
                  </View>
                ) : (
                  // Voting view — show option buttons
                  <View>
                    {poll.options.map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => handleVote(poll.id, option)}
                        disabled={votingPollId !== null}
                        className={`border border-resident rounded-control px-3 py-2.5 mb-2 ${
                          votingPollId === poll.id ? 'opacity-60' : ''
                        }`}
                      >
                        <Text className="text-resident font-semibold text-sm text-center">
                          {option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
