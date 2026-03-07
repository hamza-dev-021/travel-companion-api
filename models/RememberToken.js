import mongoose from 'mongoose';

const { Schema } = mongoose;

const rememberTokenSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true,
});

// Optional: TTL index for automatic cleanup after expiration
rememberTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RememberToken = mongoose.model('RememberToken', rememberTokenSchema);

export default RememberToken;
