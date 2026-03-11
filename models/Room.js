import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
  hotel: {
    type: mongoose.Schema.ObjectId,
    ref: 'HotelVerification',
    required: [true, 'Please specify the hotel'],
  },
  roomNumber: {
    type: String,
    required: [true, 'Please add a room number'],
    trim: true,
    maxlength: [10, 'Room number cannot be more than 10 characters']
  },
  roomType: {
    type: String,
    required: [true, 'Please select room type'],
    enum: ['single', 'double', 'twin', 'suite', 'deluxe', 'family']
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  pricePerNight: {
    type: Number,
    required: [true, 'Please add a price per night'],
    min: [0, 'Price cannot be negative']
  },
  maxGuests: {
    type: Number,
    required: [true, 'Please add maximum guests'],
    min: [1, 'Max guests must be at least 1']
  },
  amenities: [{
    type: String
  }],
  images: [{
    type: String
  }],
  isAvailable: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'maintenance', 'cleaning', 'unavailable'],
    default: 'available'
  },
  lastCleaned: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Sync isAvailable with status
RoomSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'available' || this.status === 'occupied' || this.status === 'cleaning' || this.status === 'maintenance') {
      this.isAvailable = true;
    } else if (this.status === 'unavailable') {
      this.isAvailable = false;
    }
  }
  next();
});

// Index for efficient searching
RoomSchema.index({ hotel: 1, isAvailable: 1 });
RoomSchema.index({ hotel: 1, roomNumber: 1 }, { unique: true });

// Cascade delete bookings when a room is deleted
RoomSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  console.log(`Bookings being removed from room ${this._id}`);
  await this.model('Booking').deleteMany({ room: this._id });
  next();
});

// Reverse populate with virtuals
RoomSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'room',
  justOne: false
});

export default mongoose.model('Room', RoomSchema);
