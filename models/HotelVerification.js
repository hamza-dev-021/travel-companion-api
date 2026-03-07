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
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      province: { type: String, trim: true },
      postalCode: { type: String, trim: true },
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
  },
  { timestamps: true }
);

// Indexes for efficient querying
hotelVerificationSchema.index({ status: 1 });
hotelVerificationSchema.index({ userId: 1 });
hotelVerificationSchema.index({ 'address.city': 1 });
hotelVerificationSchema.index({ status: 1, 'address.city': 1 });

const HotelVerification = mongoose.model('HotelVerification', hotelVerificationSchema);

export default HotelVerification;
