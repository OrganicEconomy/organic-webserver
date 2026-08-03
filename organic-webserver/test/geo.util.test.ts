import assert from "assert"
import { haversineDistanceKm } from "../app/utils/geo.util.js"

describe("haversineDistanceKm", () => {
    it("should return 0 for the same point", () => {
        assert.equal(haversineDistanceKm(48.8566, 2.3522, 48.8566, 2.3522), 0)
    })

    it("should return ~111.2km for one degree of latitude", () => {
        const d = haversineDistanceKm(0, 0, 1, 0)
        assert.ok(Math.abs(d - 111.19) < 1, `expected ~111.19, got ${d}`)
    })

    it("should return ~111.2km for one degree of longitude at the equator", () => {
        const d = haversineDistanceKm(0, 0, 0, 1)
        assert.ok(Math.abs(d - 111.19) < 1, `expected ~111.19, got ${d}`)
    })

    it("should be symmetric", () => {
        const a = haversineDistanceKm(48.8566, 2.3522, 45.75, 4.85)
        const b = haversineDistanceKm(45.75, 4.85, 48.8566, 2.3522)
        assert.equal(a, b)
    })
})
