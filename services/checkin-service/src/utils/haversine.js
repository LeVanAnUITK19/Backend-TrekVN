/**
 * Haversine formula — tính khoảng cách giữa hai điểm GPS (tính bằng mét).
 *
 * @param {number} lat1 - latitude điểm 1 (độ)
 * @param {number} lon1 - longitude điểm 1 (độ)
 * @param {number} lat2 - latitude điểm 2 (độ)
 * @param {number} lon2 - longitude điểm 2 (độ)
 * @returns {number} khoảng cách tính bằng mét
 */
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // bán kính Trái Đất tính bằng mét
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

module.exports = { haversineMeters };
