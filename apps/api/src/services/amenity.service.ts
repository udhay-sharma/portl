import prisma from '../lib/prisma.js';
import type { AmenityBookingInput, CreateAmenityInput, UpdateAmenityInput } from '@portl/shared';
import type { AmenityBooking, Amenity } from '../generated/prisma/client.js';

export async function bookAmenity(
  amenityId: string,
  societyId: string,
  userId: string,
  data: AmenityBookingInput
): Promise<AmenityBooking | null> {
  // We can just attempt the insert. If it overlaps, the DB EXCLUDE constraint throws.
  const amenity = await prisma.amenity.findUnique({
    where: { id: amenityId },
  });

  if (!amenity || amenity.societyId !== societyId) {
    return null; // 404
  }

  // Insert the booking.
  // We do NOT use prisma.$transaction with findFirst anymore because the database
  // EXCLUDE constraint perfectly enforces the time range uniqueness at the DB engine level.
  const booking = await prisma.amenityBooking.create({
    data: {
      amenityId,
      societyId,
      bookedByUserId: userId,
      date: new Date(data.date),
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
    },
  });

  return booking;
}

export async function createAmenity(
  societyId: string,
  data: CreateAmenityInput
): Promise<Amenity> {
  return prisma.amenity.create({
    data: {
      ...data,
      societyId,
    },
  });
}

export async function updateAmenity(
  id: string,
  societyId: string,
  data: UpdateAmenityInput
): Promise<Amenity | null> {
  const existing = await prisma.amenity.findFirst({
    where: { id, societyId },
  });
  if (!existing) return null;

  return prisma.amenity.update({
    where: { id },
    data,
  });
}

export async function deleteAmenity(
  id: string,
  societyId: string
): Promise<boolean> {
  const existing = await prisma.amenity.findFirst({
    where: { id, societyId },
  });
  if (!existing) return false;

  await prisma.amenity.delete({
    where: { id },
  });
  return true;
}
