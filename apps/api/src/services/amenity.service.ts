import prisma from '../lib/prisma.js';
import type { AmenityBookingInput } from '@portl/shared';
import type { AmenityBooking } from '../generated/prisma/client.js';

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
