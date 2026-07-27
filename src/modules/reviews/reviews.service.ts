import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';
import {
  ReviewAlreadySubmittedException,
  ReviewForbiddenException,
  ReviewOrderNotEligibleException,
  ReviewOrderNotFoundException,
} from './reviews.errors';

const REVIEWABLE: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.DELIVERED,
  OrderStatus.RELEASED,
]);

/** Pure eligibility check — used by service + unit tests. */
export function isOrderReviewable(
  status: OrderStatus,
  reviewerId: string,
  buyerId: string,
): 'ok' | 'not_eligible' | 'forbidden' {
  if (reviewerId !== buyerId) return 'forbidden';
  if (!REVIEWABLE.has(status)) return 'not_eligible';
  return 'ok';
}

export function nextRatingStats(
  currentAvg: Decimal | number,
  currentCount: number,
  rating: number,
): { ratingAvg: Decimal; ratingCount: number } {
  const avg =
    typeof currentAvg === 'number' ? currentAvg : Number(currentAvg.toString());
  const nextCount = currentCount + 1;
  const nextAvg = (avg * currentCount + rating) / nextCount;
  return {
    ratingAvg: new Decimal(nextAvg.toFixed(2)),
    ratingCount: nextCount,
  };
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reviewerId: string, orderId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { sellerId: true }, take: 1 },
        reviews: {
          where: { reviewerId },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!order) throw new ReviewOrderNotFoundException();

    const eligibility = isOrderReviewable(
      order.status,
      reviewerId,
      order.buyerId,
    );
    if (eligibility === 'forbidden') throw new ReviewForbiddenException();
    if (eligibility === 'not_eligible') {
      throw new ReviewOrderNotEligibleException();
    }
    if (order.reviews.length > 0) throw new ReviewAlreadySubmittedException();

    const revieweeId = order.items[0]?.sellerId;
    if (!revieweeId) throw new ReviewOrderNotFoundException();

    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            orderId,
            reviewerId,
            revieweeId,
            rating: dto.rating,
            comment: dto.comment?.trim() || null,
          },
        });

        const reviewee = await tx.user.findUniqueOrThrow({
          where: { id: revieweeId },
          select: { ratingAvg: true, ratingCount: true },
        });

        const stats = nextRatingStats(
          reviewee.ratingAvg,
          reviewee.ratingCount,
          dto.rating,
        );

        await tx.user.update({
          where: { id: revieweeId },
          data: {
            ratingAvg: stats.ratingAvg,
            ratingCount: stats.ratingCount,
          },
        });

        return created;
      });

      return {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ReviewAlreadySubmittedException();
      }
      throw err;
    }
  }
}
