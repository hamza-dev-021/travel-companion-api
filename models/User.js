import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true },
    cnic: { type: String, trim: true },
    profileImage: { type: Buffer },
    profileImageType: { type: String },
    photoUrl: { type: String, default: null },
    role: {
      type: String,
      enum: ['traveller', 'service-provider', 'admin'],
      default: 'traveller',
    },
    isActive: {
      type: Boolean,
      default: true
    },
    preferences: {
      type: new mongoose.Schema({
        notifications: { type: Boolean, default: true },
        emails: { type: Boolean, default: true },
        publicProfilePhoto: { type: Boolean, default: false },
        currency: { type: String, enum: ['₨', '$'], default: '₨' }
      }, { _id: false }),
      default: () => ({ notifications: true, emails: true, publicProfilePhoto: false, currency: '₨' })
    },
    schemaVersion: {
      type: Number,
      default: 1
    }
  },
  { timestamps: true }
);

/**
 * Lazy Migration / Data Healing Logic
 * Ensures that old documents are automatically updated to the latest data shape
 * when they are accessed.
 * @returns {boolean} True if the document was modified and needs to be saved.
 */
userSchema.methods.ensureConsistency = function () {
  let modified = false;

  // Migration V2: Ensure preferences are initialized (for very old users)
  if (!this.preferences) {
    this.preferences = {
      notifications: true,
      emails: true,
      publicProfilePhoto: false,
      currency: '₨'
    };
    modified = true;
  }

  // Migration V2: Normalized currency symbols if they were somehow 'PKR' or 'USD'
  if (this.preferences.currency === 'PKR') {
    this.preferences.currency = '₨';
    modified = true;
  }
  if (this.preferences.currency === 'USD') {
    this.preferences.currency = '$';
    modified = true;
  }

  // Set latest schema version
  if (this.schemaVersion < 2) {
    this.schemaVersion = 2;
    modified = true;
  }

  return modified;
};

// Middleware to auto-hydrate photoUrl for older accounts that only have profileImage buffer
userSchema.post('init', function (doc) {
  if (doc.profileImage && !doc.photoUrl) {
    doc.photoUrl = `/api/profile/${doc._id}/photo`;
  }
});

const User = mongoose.model('User', userSchema);

export default User;
