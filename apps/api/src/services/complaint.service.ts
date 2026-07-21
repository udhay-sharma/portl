import prisma from '../lib/prisma.js';
import type { CreateComplaintInput } from '@portl/shared';
import type { Complaint } from '../generated/prisma/client.js';
import { assertValidComplaintTransition } from '@portl/shared';

export async function createComplaint(
  data: CreateComplaintInput,
  flatId: string,
  userId: string
): Promise<Complaint> {
  return prisma.complaint.create({
    data: {
      title: data.title,
      description: data.description,
      flatId,
      createdByUserId: userId,
      status: 'OPEN',
    },
  });
}

export async function getComplaintsByFlat(flatId: string): Promise<Complaint[]> {
  return prisma.complaint.findMany({
    where: { flatId },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: { name: true },
      },
    },
  });
}

export async function getComplaintsBySociety(societyId: string): Promise<Complaint[]> {
  return prisma.complaint.findMany({
    where: {
      flat: {
        tower: {
          societyId,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      flat: {
        select: { number: true, tower: { select: { name: true } } },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });
}

export async function updateComplaintStatus(
  complaintId: string,
  newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
): Promise<Complaint | null> {
  // 1. Fetch current status
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
  });

  if (!complaint) {
    return null; // 404
  }

  // 2. Validate transition
  // This throws InvalidComplaintTransitionError if invalid, which the route handler catches
  assertValidComplaintTransition(complaint.status, newStatus);

  // 3. Perform update
  return prisma.complaint.update({
    where: { id: complaintId },
    data: { status: newStatus },
  });
}
