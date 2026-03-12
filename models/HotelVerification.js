import mongoose from 'mongoose';

const hotelVerificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['not-submitted', 'pending', 'approved', 'rejected'],
      default: 'not-submitted',
    },
    // Core business identity (mirrors previous embedded structure)
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    address: {
      hotelAddress: { type: String, trim: true },
      city: { type: String, trim: true },
      province: { type: String, trim: true },
    },
    contact: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    },
    starRating: { type: Number, min: 1, max: 5 },
    averageRating: { type: Number, min: 1, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalRooms: { type: Number, min: 1 },
    amenities: [{ type: String }],
    checkInTime: { type: String, trim: true },
    checkOutTime: { type: String, trim: true },
    cancellationPolicy: { type: String, trim: true },
    documentKey: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    images: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    rejectionReason: { type: String, trim: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

/**
 * Lazy Migration / Data Healing Logic for Hotels
 * Ensures that old hotel verification records are automatically updated 
 * to the latest data shape when they are accessed.
 * @returns {boolean} True if the document was modified and needs to be saved.
 */
hotelVerificationSchema.methods.ensureConsistency = function () {
  let modified = false;

  // Migration V2: Ensure arrays are initialized if missing
  if (!this.amenities) {
    this.amenities = [];
    modified = true;
  }
  if (!this.images) {
    this.images = [];
    modified = true;
  }

  // Set latest schema version
  if (this.schemaVersion < 2) {
    this.schemaVersion = 2;
    modified = true;
  }

  return modified;
};

// Indexes for efficient querying
hotelVerificationSchema.index({ status: 1 });
hotelVerificationSchema.index({ userId: 1 });
hotelVerificationSchema.index({ 'address.city': 1 });
hotelVerificationSchema.index({ status: 1, 'address.city': 1 });

const HotelVerification = mongoose.model('HotelVerification', hotelVerificationSchema);

export default HotelVerification;
