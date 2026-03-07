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
      notifications: { type: Boolean, default: true },
      emails: { type: Boolean, default: true },
    }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;
