import mongoose from 'mongoose';

const HotelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add hotel name'],
    trim: true,
    maxlength: [100, 'Hotel name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add hotel description'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  address: {
    street: {
      type: String,
      required: [true, 'Please add street address']
    },
    city: {
      type: String,
      required: [true, 'Please add city']
    },
    province: {
      type: String,
      required: [true, 'Please add province']
    },
    postalCode: {
      type: String,
      maxlength: [10, 'Postal code cannot be more than 10 characters']
    },
    coordinates: {
      latitude: {
        type: Number,
        required: [true, 'Please add latitude']
      },
      longitude: {
        type: Number,
        required: [true, 'Please add longitude']
      }
    }
  },
  contact: {
    phone: {
      type: String,
      required: [true, 'Please add phone number']
    },
    email: {
      type: String,
      required: [true, 'Please add email']
    },
    website: {
      type: String
    }
  },
  starRating: {
    type: Number,
    required: [true, 'Please add star rating'],
    min: [1, 'Star rating must be at least 1'],
    max: [5, 'Star rating cannot be more than 5']
  },
  priceRange: {
    minPrice: {
      type: Number,
      required: [true, 'Please add minimum price'],
      min: [0, 'Price cannot be negative']
    },
    maxPrice: {
      type: Number,
      required: [true, 'Please add maximum price'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR', 'USD', 'EUR']
    }
  },
  amenities: [{
    type: String
  }],
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: {
      type: String,
      maxlength: [100, 'Caption cannot be more than 100 characters']
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  facilities: {
    totalRooms: {
      type: Number,
      required: [true, 'Please add total number of rooms'],
      min: [1, 'Total rooms must be at least 1']
    },
    checkInTime: {
      type: String,
      default: '14:00'
    },
    checkOutTime: {
      type: String,
      default: '12:00'
    },
    languages: [{
      type: String
    }]
  },
  policies: {
    cancellationPolicy: {
      type: String,
      enum: ['Free cancellation', 'Non-refundable', 'Partial refund', 'Custom policy']
    },
    petPolicy: {
      type: String,
      enum: ['Pets allowed', 'Pets not allowed', 'Pets allowed with restrictions']
    },
    smokingPolicy: {
      type: String,
      enum: ['Smoking allowed', 'Non-smoking', 'Smoking in designated areas']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  averageRating: {
    type: Number,
    min: [0, 'Rating cannot be less than 0'],
    max: [5, 'Rating cannot be more than 5']
  },
  totalReviews: {
    type: Number,
    default: 0,
    min: [0, 'Total reviews cannot be negative']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for efficient searching
HotelSchema.index({ 
  'address.city': 1, 
  'address.province': 1, 
  'starRating': 1, 
  'priceRange.minPrice': 1 
});

HotelSchema.index({ 
  'address.coordinates.latitude': 1, 
  'address.coordinates.longitude': 1 
});

// Virtual for full address
HotelSchema.virtual('fullAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.province}, Pakistan`;
});

// Virtual for primary image
HotelSchema.virtual('primaryImage').get(function() {
  if (!this.images || !Array.isArray(this.images) || this.images.length === 0) {
    return null;
  }
  const primaryImg = this.images.find(img => img.isPrimary);
  return primaryImg ? primaryImg.url : this.images[0].url;
});

// Pre-save middleware to ensure only one primary image
HotelSchema.pre('save', function(next) {
  if (this.images && this.images.length > 0) {
    const primaryImages = this.images.filter(img => img.isPrimary);
    if (primaryImages.length > 1) {
      // Keep only the first primary image, set others to false
      for (let i = 1; i < primaryImages.length; i++) {
        primaryImages[i].isPrimary = false;
      }
    }
  }
  next();
});

export default mongoose.model('Hotel', HotelSchema);
