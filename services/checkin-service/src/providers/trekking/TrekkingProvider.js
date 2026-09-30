/**
 * TrekkingProvider — interface/base class cho trekking data.
 *
 * Định nghĩa contract mà MockTrekkingProvider và HttpTrekkingProvider
 * phải implement. Business logic check-in chỉ phụ thuộc interface này,
 * không biết implementation cụ thể.
 *
 * getMilestoneCheckinContext(milestoneId) → trả về:
 * {
 *   milestoneId: string,
 *   trekkingRouteId: string,
 *   trekkingPlaceId: string,
 *   provinceId: string,       // ObjectId string của Province trong checkin_db
 *   name: string,
 *   type: string,             // SUMMIT | START | FINISH | CHECKPOINT | ...
 *   location: { type: 'Point', coordinates: [lng, lat] },
 *   checkinRadiusMeters: number,
 *   qualifiesPlaceVisit: boolean,
 * }
 * Trả về null nếu milestone không tồn tại.
 */
class TrekkingProvider {
  // eslint-disable-next-line require-await
  async getMilestoneCheckinContext(_milestoneId) {
    throw new Error('TrekkingProvider.getMilestoneCheckinContext() must be implemented');
  }
}

module.exports = TrekkingProvider;
