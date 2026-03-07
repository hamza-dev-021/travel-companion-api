import mongoose from 'mongoose';

const ReviewSchema = new mongoose.Schema({
    service: {
        type: mongoose.Schema.ObjectId,
        required: [true, 'Please add a service ID']
    },
    serviceType: {
        type: String,
        enum: ['hotel', 'car', 'bus'],
        required: [true, 'Please add a service type']
    },
    booking: {
        type: mongoose.Schema.ObjectId,
        ref: 'Booking',
        required: [true, 'Please add a booking ID']
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Please add a user']
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: [true, 'Please add a rating between 1 and 5']
    },
    comment: {
        type: String,
        maxlength: [1000, 'Comment cannot be more than 1000 characters']
    }
}, {
    timestamps: true
});

// Prevent user from submitting more than one review per booking
ReviewSchema.index({ booking: 1 }, { unique: true });
ReviewSchema.index({ service: 1, serviceType: 1 });

// Static method to get avg rating and save
ReviewSchema.statics.getAverageRating = async function (serviceId, serviceType) {
    const obj = await this.aggregate([
        {
            $match: { service: serviceId }
        },
        {
            $group: {
                _id: '$service',
                averageRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 }
            }
        }
    ]);

    try {
        const averageRating = obj[0] ? (Math.round(obj[0].averageRating * 10) / 10) : undefined;
        const totalReviews = obj[0] ? obj[0].totalReviews : 0;

        if (serviceType === 'hotel') {
            const Hotel = mongoose.models.Hotel || mongoose.model('Hotel');
            const HotelVerification = mongoose.models.HotelVerification || mongoose.model('HotelVerification');

            if (Hotel) {
                try {
                    await Hotel.findByIdAndUpdate(serviceId, { averageRating, totalReviews });
                } catch (e) { }
            }
            if (HotelVerification) {
                try {
                    await HotelVerification.findByIdAndUpdate(serviceId, { averageRating, totalReviews });
                } catch (e) { }
            }
        }
    } catch (err) {
        console.error(err);
    }
};

// Call getAverageRating after save
ReviewSchema.post('save', async function () {
    await this.constructor.getAverageRating(this.service, this.serviceType);
});

// Call getAverageRating after remove
ReviewSchema.post('deleteOne', { document: true, query: false }, async function () {
    await this.constructor.getAverageRating(this.service, this.serviceType);
});

export default mongoose.model('Review', ReviewSchema);
