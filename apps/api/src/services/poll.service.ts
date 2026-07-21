import prisma from '../lib/prisma.js';
import type { CreatePollInput, PollVoteInput } from '@portl/shared';
import type { Poll, PollVote } from '../generated/prisma/client.js';

export async function createPoll(
  data: CreatePollInput,
  societyId: string,
  userId: string
): Promise<Poll> {
  return prisma.poll.create({
    data: {
      question: data.question,
      options: data.options,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      societyId,
      createdByUserId: userId,
    },
  });
}

export async function getPolls(societyId: string) {
  const polls = await prisma.poll.findMany({
    where: { societyId },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: { name: true },
      },
    },
  });

  // We can fetch votes and tally them here
  const pollIds = polls.map((p) => p.id);
  
  // Get all votes for these polls
  const votes = await prisma.pollVote.groupBy({
    by: ['pollId', 'selectedOption'],
    where: { pollId: { in: pollIds } },
    _count: {
      id: true,
    },
  });

  // Map tallies back to polls
  return polls.map((poll) => {
    // Ensure we know it's an array of strings per our schema
    const optionsArray = (poll.options as string[]) || [];
    const results = optionsArray.map((opt) => {
      const voteCount = votes.find((v) => v.pollId === poll.id && v.selectedOption === opt)?._count.id || 0;
      return { option: opt, count: voteCount };
    });

    return {
      ...poll,
      results,
    };
  });
}

export async function castVote(
  pollId: string,
  userId: string,
  data: PollVoteInput
): Promise<PollVote | null> {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
  });

  if (!poll) {
    return null; // Signals 404
  }

  const optionsArray = (poll.options as string[]) || [];
  if (!optionsArray.includes(data.selectedOption)) {
    throw new Error('INVALID_OPTION');
  }

  if (poll.endsAt && new Date() > poll.endsAt) {
    throw new Error('POLL_ENDED');
  }

  // The DB `@@unique([pollId, userId])` constraint strictly prevents double voting.
  // We do NOT perform a pre-check query (e.g. `findFirst`) because of race conditions.
  // We simply try the insert and catch Prisma's unique constraint error (P2002).
  const vote = await prisma.pollVote.create({
    data: {
      pollId,
      userId,
      selectedOption: data.selectedOption,
    },
  });

  return vote;
}
