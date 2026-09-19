import Joi from 'joi';
import { Review } from '../models/Review.js';

const createSchema = Joi.object({
  courseCode: Joi.string().trim().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().allow('').optional(),
  reviewedBy: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
}).required();

const updateSchema = Joi.object({
  courseCode: Joi.string().trim(),
  rating: Joi.number().integer().min(1).max(5),
  comment: Joi.string().allow('').optional(),
  reviewedBy: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
}).min(1).required();

function serializeReview(doc) {
  const review = {
    id: doc._id.toString(),
    courseCode: doc.courseCode,
    rating: doc.rating,
    comment: doc.comment ?? '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };

  if (!doc.reviewedBy) {
    review.reviewedBy = null;
    return review;
  }

  if (typeof doc.reviewedBy === 'object' && doc.reviewedBy !== null && doc.reviewedBy._id) {
    review.reviewedBy = {
      id: doc.reviewedBy._id.toString(),
      name: doc.reviewedBy.name,
      email: doc.reviewedBy.email
    };
    return review;
  }

  review.reviewedBy = doc.reviewedBy.toString();
  return review;
}

// GET /api/reviews
export async function getAllReviews(req, res, next) {
  try {
    const reviews = await Review.find().populate('reviewedBy', 'name email').sort({ createdAt: -1 });
    res.json({ reviews: reviews.map(serializeReview) });
  } catch (err) { next(err); }
}

// GET /api/reviews/:id
export async function getReview(req, res, next) {
  try {
    const review = await Review.findById(req.params.id).populate('reviewedBy', 'name email');
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ review: serializeReview(review) });
  } catch (err) { next(err); }
}

// GET /api/reviews/summary?courseCode=CS101
export async function getCourseSummary(req, res, next) {
  try {
    const courseCode = (req.query.courseCode || '').trim().toUpperCase();
    if (!courseCode) {
      return res.status(400).json({ message: 'courseCode query parameter is required' });
    }

    const [summary] = await Review.aggregate([
      { $match: { courseCode } },
      {
        $group: {
          _id: '$courseCode',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          courseCode: '$_id',
          averageRating: { $round: ['$averageRating', 1] },
          reviewCount: 1
        }
      }
    ]);

    if (!summary) {
      return res.status(404).json({ message: `No reviews found for ${courseCode}` });
    }

    res.json(summary);
  } catch (err) { next(err); }
}

// POST /api/reviews
export async function createReview(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const review = await Review.create({
      ...value,
      courseCode: value.courseCode.trim().toUpperCase(),
      reviewedBy: value.reviewedBy || undefined
    });

    const populated = await review.populate('reviewedBy', 'name email');
    res.status(201).json({ review: serializeReview(populated) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A review for this user and course already exists' });
    }
    next(err);
  }
}

// PATCH /api/reviews/:id
export async function updateReview(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    if (value.courseCode) value.courseCode = value.courseCode.trim().toUpperCase();

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: value },
      { new: true, runValidators: true }
    ).populate('reviewedBy', 'name email');

    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ review: serializeReview(review) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A review for this user and course already exists' });
    }
    next(err);
  }
}

// DELETE /api/reviews/:id
export async function deleteReview(req, res, next) {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ ok: true, deletedId: req.params.id });
  } catch (err) { next(err); }
}
