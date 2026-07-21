-- Enable btree_gist extension to allow indexing scalar types (like UUID/String) alongside ranges
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add the EXCLUDE constraint preventing overlapping time ranges for the same amenity
ALTER TABLE "AmenityBooking"
ADD CONSTRAINT "no_overlapping_bookings"
EXCLUDE USING gist (
  "amenityId" WITH =,
  tsrange("startTime", "endTime", '()') WITH &&
);