import math
import time
from typing import List, Dict, Any, Optional, Tuple
from services.gsi_service import GSILandslideService
from services.nasa_gpm_service import NASAGPMService
from services.landslide_prediction import LandslidePredictionService


class RouteRiskAssessmentService:
    """
    Landslide-Aware Route Risk Assessment and Segment Optimizer.
    Segments candidate routes, evaluates GSI historical slides & susceptibility zones,
    retrieves NASA GPM rainfall, and generates multi-tier color-coded hazard segments.
    """

    def __init__(self, gsi_service: GSILandslideService,
                 gpm_service: NASAGPMService,
                 prediction_service: LandslidePredictionService):
        self.gsi = gsi_service
        self.gpm = gpm_service
        self.prediction = prediction_service
        self._risk_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._cache_ttl: float = 900.0  # 15 minutes

    def analyze_route_risk(self, route_coords: List[List[float]],
                           route_distance_km: float = 0.0,
                           route_duration_min: float = 0.0) -> Dict[str, Any]:
        """
        Performs comprehensive segmental landslide risk analysis along a route polyline.
        route_coords is [[lon, lat], ...].
        """
        if not route_coords or len(route_coords) < 2:
            return {
                "route_hazard_index": 0.15,
                "route_safety_status": "NORMAL",
                "segments": [],
                "alerts": [],
                "gsi_records_near_route": [],
                "intersecting_susceptibility_zones": []
            }

        # Cache check for identical route polyline segment
        cache_key = f"{len(route_coords)}_{route_coords[0][0]:.4f}_{route_coords[0][1]:.4f}_{route_coords[-1][0]:.4f}_{route_coords[-1][1]:.4f}_{round(route_distance_km, 2)}"
        now = time.time()
        if cache_key in self._risk_cache:
            ts, cached_res = self._risk_cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached_res

        # 1. Spatial intersection with GSI historical landslides
        gsi_near = self.gsi.find_records_near_route(route_coords, buffer_km=4.0)

        # 2. Intersection with GSI NLSM susceptibility zones
        zones_intersected = self.gsi.find_susceptibility_zones_intersecting(route_coords)

        # 3. Partition route into segments of roughly 5 to 10 points
        total_pts = len(route_coords)
        segment_count = min(12, max(4, total_pts // 8))
        pts_per_seg = max(2, total_pts // segment_count)

        segments = []
        segment_hazard_scores = []

        # Get corridor-level baseline rainfall observation once
        corridor_mid = route_coords[len(route_coords) // 2]
        corridor_rain = self.prediction.gpm.get_current_rainfall(corridor_mid[1], corridor_mid[0])
        base_r24 = corridor_rain.get("last_24h_mm", 12.0)

        # Pre-batch fetch all segment elevations in 1 fast network request
        all_terrain_pts = []
        delta = 0.002
        for s_idx in range(segment_count):
            start_i = s_idx * pts_per_seg
            end_i = min(total_pts, (s_idx + 1) * pts_per_seg) if s_idx < segment_count - 1 else total_pts
            if start_i >= total_pts:
                break
            seg_coords = route_coords[start_i:end_i]
            if len(seg_coords) >= 2:
                m_pt = seg_coords[len(seg_coords) // 2]
                m_lon, m_lat = m_pt[0], m_pt[1]
                all_terrain_pts.extend([
                    (m_lat, m_lon),
                    (m_lat + delta, m_lon),
                    (m_lat - delta, m_lon),
                    (m_lat, m_lon + delta),
                    (m_lat, m_lon - delta)
                ])

        if hasattr(self.prediction.terrain, "fetch_elevation_batch") and all_terrain_pts:
            self.prediction.terrain.fetch_elevation_batch(all_terrain_pts)

        for s_idx in range(segment_count):
            start_i = s_idx * pts_per_seg
            end_i = min(total_pts, (s_idx + 1) * pts_per_seg) if s_idx < segment_count - 1 else total_pts
            if start_i >= total_pts:
                break

            seg_coords = route_coords[start_i:end_i]
            if len(seg_coords) < 2:
                continue

            # Calculate segment midpoint
            mid_pt = seg_coords[len(seg_coords) // 2]
            mid_lon, mid_lat = mid_pt[0], mid_pt[1]

            # Calculate segment length in km
            seg_dist_km = 0.0
            for k in range(len(seg_coords) - 1):
                p1, p2 = seg_coords[k], seg_coords[k + 1]
                dx = (p2[0] - p1[0]) * 111.0 * math.cos(math.radians(mid_lat))
                dy = (p2[1] - p1[1]) * 111.0
                seg_dist_km += math.sqrt(dx * dx + dy * dy)

            # Evaluate ML prediction for segment midpoint using corridor satellite base
            hazard_eval = self.prediction.predict_hazard(mid_lat, mid_lon, override_r24=base_r24)
            h_score = hazard_eval["hazard_score"]
            segment_hazard_scores.append(h_score)

            # Check if this segment is near a GSI historical slide
            seg_gsi_matches = [
                g for g in gsi_near
                if math.hypot((g["longitude"] - mid_lon) * 111.0, (g["latitude"] - mid_lat) * 111.0) < 3.5
            ]

            # Categorize segment visual color
            # Green (Lower), Yellow (Moderate), Orange (High), Red (Very High), Grey (Insufficient)
            if h_score >= 0.80 or any(g.get("susceptibility_class", "").startswith("Very High") for g in seg_gsi_matches):
                cat = "VERY_HIGH"
                color = "#ef4444"
                label = "Red (Very High Risk Sector)"
            elif h_score >= 0.60:
                cat = "HIGH"
                color = "#f97316"
                label = "Orange (High Risk Sector)"
            elif h_score >= 0.35:
                cat = "MODERATE"
                color = "#eab308"
                label = "Yellow (Moderate Monitored Sector)"
            else:
                cat = "LOW"
                color = "#10b981"
                label = "Green (Lower Estimated Hazard)"

            segments.append({
                "segment_index": s_idx + 1,
                "coordinates": seg_coords,
                "length_km": round(seg_dist_km, 2),
                "midpoint": [mid_lon, mid_lat],
                "hazard_score": h_score,
                "hazard_category": cat,
                "color": color,
                "color_label": label,
                "factor_of_safety": hazard_eval["factor_of_safety"],
                "gsi_historical_matches": len(seg_gsi_matches),
                "gsi_zone_name": hazard_eval["gsi_context"].get("zone_name"),
                "rainfall_24h_mm": hazard_eval["input_parameters"]["rainfall_24h_mm"]
            })

        # Calculate overall route hazard score (weighted max and mean)
        if segment_hazard_scores:
            max_h = max(segment_hazard_scores)
            avg_h = sum(segment_hazard_scores) / len(segment_hazard_scores)
            route_h_index = round(0.65 * max_h + 0.35 * avg_h, 3)
        else:
            route_h_index = 0.20

        # Generate contextual alerts
        alerts = []
        if zones_intersected:
            highest_zone = max(zones_intersected, key=lambda z: z.get("zone_numeric", 1))
            alerts.append({
                "type": "GSI_ZONE_INTERSECTION",
                "severity": "HIGH" if highest_zone.get("zone_numeric", 1) >= 3 else "MEDIUM",
                "message": f"Route traverses {highest_zone.get('name', 'Himalayan Escarpment')} ({highest_zone.get('susceptibility_class')} Susceptibility - GSI NLSM Zone {highest_zone.get('zone_numeric')})."
            })

        if gsi_near:
            alerts.append({
                "type": "HISTORICAL_LANDSLIDES_NEAR",
                "severity": "MEDIUM",
                "message": f"{len(gsi_near)} verified GSI historical landslide zones mapped within 4 km of this corridor."
            })

        critical_segs = [s for s in segments if s["hazard_category"] in ["HIGH", "VERY_HIGH"]]
        if critical_segs:
            alerts.append({
                "type": "CRITICAL_SLOPE_HAZARD",
                "severity": "CRITICAL",
                "message": f"Autonomous hazard detection flagged {len(critical_segs)} elevated slope sectors. Alternative detour recommended."
            })

        # Advisory disclaimer
        disclaimer = "DISASTER ADVISORY: Hazard assessments are derived from satellite rainfall (NASA GPM), GSI susceptibility, and DEM terrain gradients. Mountain conditions can change rapidly. Always monitor state disaster authority (SDMA/NDMA) travel bulletins."

        # Safety status
        if route_h_index >= 0.70:
            status = "CRITICAL_HAZARD_BLOCKED"
        elif route_h_index >= 0.50:
            status = "ELEVATED_RISK_CAUTION"
        elif route_h_index >= 0.30:
            status = "MODERATE_MONITORED"
        else:
            status = "LOWER_ESTIMATED_HAZARD"

        result = {
            "route_hazard_index": route_h_index,
            "route_safety_status": status,
            "total_segments": len(segments),
            "critical_segment_count": len(critical_segs),
            "segments": segments,
            "alerts": alerts,
            "disclaimer": disclaimer,
            "gsi_records_near_route": gsi_near[:6],
            "intersecting_susceptibility_zones": zones_intersected
        }
        if len(self._risk_cache) > 100:
            oldest = next(iter(self._risk_cache))
            self._risk_cache.pop(oldest, None)
        self._risk_cache[cache_key] = (now, result)
        return result
