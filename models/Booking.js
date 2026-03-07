import mongoose from 'mongoose';

const BookingSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.ObjectId,
    ref: 'Room',
    required: true
  },
  hotel: {
    type: mongoose.Schema.ObjectId,
    ref: 'HotelVerification',
    required: true
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  checkInDate: {
    type: Date,
    required: [true, 'Please add a check-in date']
  },
  checkOutDate: {
    type: Date,
    required: [true, 'Please add a check-out date']
  },
  numberOfGuests: {
    type: Number,
    required: [true, 'Please add number of guests'],
    min: [1, 'Number of guests must be at least 1']
  },
  totalPrice: {
    type: Number,
    required: [true, 'Please add total price']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'rejected', 'no-show'],
    default: 'pending'
  },
  specialRequests: {
    type: String,
    maxlength: [500, 'Special requests cannot be more than 500 characters']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'partially-refunded', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['credit-card', 'debit-card', 'paypal', 'cash', 'bank-transfer', 'other'],
    default: 'credit-card'
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paidAt: {
    type: Date
  },
  cancellationDate: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  isRefundable: {
    type: Boolean,
    default: true
  },
  bookingReference: {
    type: String,
    unique: true,
    required: true
  },
  guestDetails: {
    firstName: {
      type: String,
      required: [true, 'Please add guest first name']
    },
    lastName: {
      type: String,
      required: [true, 'Please add guest last name']
    },
    email: {
      type: String,
      required: [true, 'Please add guest email']
    },
    phone: {
      type: String,
      required: [true, 'Please add guest phone']
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isReviewed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate booking reference before saving
BookingSchema.pre('save', function (next) {
  if (this.isNew && !this.bookingReference) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.bookingReference = `BK${timestamp}${random}`;
  }
  next();
});

// Calculate number of nights
BookingSchema.virtual('numberOfNights').get(function () {
  const diffTime = Math.abs(new Date(this.checkOutDate) - new Date(this.checkInDate));
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Calculate total price based on room price and number of nights
BookingSchema.pre('save', async function (next) {
  // Only calculate if checkInDate or checkOutDate is modified
  if (this.isModified('checkInDate') || this.isModified('checkOutDate') || this.isNew) {
    const Room = mongoose.model('Room');
    const room = await Room.findById(this.room);

    if (room) {
      const nights = (new Date(this.checkOutDate) - new Date(this.checkInDate)) / (1000 * 60 * 60 * 24);
      this.totalPrice = room.pricePerNight * Math.ceil(nights);
    }
  }
  next();
});

// Update room availability when booking status changes
BookingSchema.post('save', async function () {
  const Room = mongoose.model('Room');

  if (this.status === 'confirmed' || this.status === 'checked-in') {
    await Room.findByIdAndUpdate(this.room, {
      isAvailable: false,
      status: 'occupied'
    });
  } else if (this.status === 'checked-out' || this.status === 'cancelled' || this.status === 'rejected') {
    await Room.findByIdAndUpdate(this.room, {
      isAvailable: true,
      status: 'available',
      lastCleaned: Date.now()
    });
  }
});

// Indexes for efficient querying
BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ hotel: 1, checkInDate: 1, checkOutDate: 1 });

export default mongoose.model('Booking', BookingSchema);
