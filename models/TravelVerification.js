import mongoose from 'mongoose';

const travelVerificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: {
      type: String,
      enum: ['not-submitted', 'pending', 'approved', 'rejected'],
      default: 'not-submitted',
    },
    companyName: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    offersCar: { type: Boolean, default: false },
    offersBus: { type: Boolean, default: false },
    documentKey: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true }
);

const TravelVerification = mongoose.model('TravelVerification', travelVerificationSchema);

export default TravelVerification;
