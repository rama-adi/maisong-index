import { Effect } from "effect";

interface CompareCoordinate {
    latitude: Number,
    longitude: Number,
}

/**
 * Calculates the haversine distance between two coordinates in meters
 */
function calculateHaversineDistance(
    coord1: CompareCoordinate,
    coord2: CompareCoordinate
): number {
    const R = 6371000; // Earth's radius in meters

    const lat1Rad = (coord1.latitude.valueOf() * Math.PI) / 180;
    const lat2Rad = (coord2.latitude.valueOf() * Math.PI) / 180;
    const deltaLatRad = ((coord2.latitude.valueOf() - coord1.latitude.valueOf()) * Math.PI) / 180;
    const deltaLonRad = ((coord2.longitude.valueOf() - coord1.longitude.valueOf()) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

export function haversine(data: { from: CompareCoordinate, coords: CompareCoordinate[], distanceMeter: Number })
    : Effect.Effect<CompareCoordinate[], never, never> {
    return Effect.gen(function* () {
        const { from, coords, distanceMeter } = data;

        // If no coordinates to compare, return empty array
        if (coords.length === 0) {
            return [];
        }

        const maxDistance = distanceMeter.valueOf();

        // Filter coordinates within the specified distance from the reference point
        const filteredCoords = coords.filter(coord => {
            const distance = calculateHaversineDistance(from, coord);
            return distance <= maxDistance;
        });

        return filteredCoords;
    });
}