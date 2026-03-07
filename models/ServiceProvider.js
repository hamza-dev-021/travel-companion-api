import mongoose from 'mongoose';

const serviceProviderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // Services this provider offers, e.g. ['hotel', 'travel']
    services: [{ type: String }],
  },
  { timestamps: true }
);

const ServiceProvider = mongoose.model('ServiceProvider', serviceProviderSchema);

export default ServiceProvider;
