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
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

/**
 * Lazy Migration / Data Healing Logic for Travel Services
 * Ensures that old travel verification records are automatically updated 
 * to the latest data shape when they are accessed.
 * @returns {boolean} True if the document was modified and needs to be saved.
 */
travelVerificationSchema.methods.ensureConsistency = function () {
  let modified = false;

  // Migration V2: Ensure boolean flags are explicitly set if undefined
  if (this.offersCar === undefined) {
    this.offersCar = false;
    modified = true;
  }
  if (this.offersBus === undefined) {
    this.offersBus = false;
    modified = true;
  }

  // Set latest schema version
  if (this.schemaVersion < 2) {
    this.schemaVersion = 2;
    modified = true;
  }

  return modified;
};

const TravelVerification = mongoose.model('TravelVerification', travelVerificationSchema);

export default TravelVerification;
