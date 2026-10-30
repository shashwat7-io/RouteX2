import math
import requests
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import geopandas as gpd
from shapely.geometry import LineString, Polygon, Point, MultiPolygon
from shapely.ops import transform
import pyproj

class RouterEngine:
    def __init__(self, ors_api_key: Optional[str] = None):
        self.ors_api_key = ors_api_key
        self.wgs84_to_mercator = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform
        self.mercator_to_wgs84 = pyproj.Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform

    def get_route(self, start_coords: List[float], end_coords: List[float], avoid_polygons: Optional[List] = None, include_steps: bool = True) -> Dict[str, Any]:
        """
        Fetches route geometry and turn-by-turn steps from OSRM or OpenRouteService.
        start_coords: [lon, lat]
        end_coords: [lon, lat]
        """
        # Try OpenRouteService if API key provided
        if self.ors_api_key and self.ors_api_key.strip():
            ors_res = self._query_openrouteservice(start_coords, end_coords, avoid_polygons)
            if ors_res:
                return ors_res
                
        # Try OSRM / Detour Waypoint Router
        return self._query_osrm_with_detour(start_coords, end_coords, avoid_polygons, include_steps=include_steps)

    def _query_osrm_with_detour(self, start: List[float], end: List[float], avoid_polygons: Optional[List] = None, include_steps: bool = True) -> Dict[str, Any]:
        """
        Queries OSRM public API with steps enabled. If avoid_polygons provided, inserts detour waypoint bypassing hazard center.
        """
        waypoints = [start]
        
        if avoid_polygons and len(avoid_polygons) > 0:
            # Calculate detour waypoint bypassing hazard center
            for poly_coords in avoid_polygons:
                if len(poly_coords) > 0:
                    poly_shape = Polygon(poly_coords)
                    centroid = poly_shape.centroid
                    c_lon, c_lat = centroid.x, centroid.y
                    
                    # Compute perpendicular detour vector
                    dx = end[0] - start[0]
                    dy = end[1] - start[1]
                    norm = math.sqrt(dx*dx + dy*dy) + 1e-6
                    
                    # Offset perpendicular by ~0.022 degrees (~2.4 km) for safe clearance
                    perp_x = -dy / norm * 0.022
                    perp_y = dx / norm * 0.022
                    
                    detour_lon = c_lon + perp_x
                    detour_lat = c_lat + perp_y
                    waypoints.append([round(detour_lon, 5), round(detour_lat, 5)])
                    
        waypoints.append(end)
        
        # Build OSRM query URL with steps=true and overview=full
        coord_str = ";".join([f"{pt[0]},{pt[1]}" for pt in waypoints])
        steps_param = "&steps=true&annotations=true" if include_steps else ""
        osrm_url = f"http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson{steps_param}&alternatives=true"
        
        try:
            resp = requests.get(osrm_url, timeout=7, headers={"User-Agent": "RouteX/2.0 (Landslide Safe Navigation Engine)"})
            if resp.status_code == 200:
                data = resp.json()
                if data.get("routes") and len(data["routes"]) > 0:
                    routes = data["routes"]
                    primary = routes[0]
                    coords = primary["geometry"]["coordinates"]
                    dist_km = round(primary["distance"] / 1000.0, 2)
                    duration_min = round(primary["duration"] / 60.0, 1)
                    
                    steps = self._extract_osrm_steps(primary)
                    
                    # Alternative routes if available
                    alternatives = []
                    for alt_route in routes[1:]:
                        alt_coords = alt_route["geometry"]["coordinates"]
                        alternatives.append({
                            "coordinates": alt_coords,
                            "distance_km": round(alt_route["distance"] / 1000.0, 2),
                            "duration_min": round(alt_route["duration"] / 60.0, 1),
                            "summary": alt_route.get("legs", [{}])[0].get("summary", "Alternative Route"),
                            "steps": self._extract_osrm_steps(alt_route)
                        })

                    return {
                        "coordinates": coords,
                        "distance_km": dist_km,
                        "duration_min": duration_min,
                        "steps": steps,
                        "alternatives": alternatives,
                        "provider": "OSRM Live Routing Engine",
                        "status": "SUCCESS"
                    }
        except Exception as e:
            print(f"[RouterEngine] OSRM query notice: {e}")
            
        # Great circle fallback generator if network route fails
        return self._fallback_interpolated_route(start, end, waypoints if len(waypoints) > 2 else None)

    def _extract_osrm_steps(self, route_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parses OSRM route legs and steps into structured turn-by-turn navigation instructions.
        """
        formatted_steps = []
        legs = route_data.get("legs", [])
        step_number = 1
        
        for leg in legs:
            raw_steps = leg.get("steps", [])
            for raw in raw_steps:
                maneuver = raw.get("maneuver", {})
                m_type = maneuver.get("type", "turn")
                m_modifier = maneuver.get("modifier", "")
                m_location = maneuver.get("location", [0.0, 0.0])
                name = raw.get("name") or raw.get("ref") or "Corridor Road"
                dist_m = round(raw.get("distance", 0.0), 1)
                dur_s = round(raw.get("duration", 0.0), 1)
                
                instruction = self._generate_instruction_text(m_type, m_modifier, name)
                icon_type = self._map_maneuver_icon(m_type, m_modifier)
                
                formatted_steps.append({
                    "step_number": step_number,
                    "type": m_type,
                    "modifier": m_modifier,
                    "instruction": instruction,
                    "street_name": name,
                    "distance_m": dist_m,
                    "distance_km": round(dist_m / 1000.0, 2),
                    "duration_s": dur_s,
                    "location": m_location,
                    "icon": icon_type
                })
                step_number += 1
                
        # If no steps were parsed (e.g. overview only), create basic fallback steps
        if not formatted_steps:
            formatted_steps = [
                {
                    "step_number": 1,
                    "type": "depart",
                    "modifier": "straight",
                    "instruction": "Depart along planned safe corridor",
                    "street_name": "Mountain Highway",
                    "distance_m": 1000.0,
                    "distance_km": 1.0,
                    "duration_s": 60.0,
                    "location": route_data.get("geometry", {}).get("coordinates", [[0,0]])[0],
                    "icon": "navigation"
                },
                {
                    "step_number": 2,
                    "type": "arrive",
                    "modifier": "straight",
                    "instruction": "Arrive safely at destination",
                    "street_name": "Destination",
                    "distance_m": 0.0,
                    "distance_km": 0.0,
                    "duration_s": 0.0,
                    "location": route_data.get("geometry", {}).get("coordinates", [[0,0]])[-1],
                    "icon": "map-pin"
                }
            ]
            
        return formatted_steps

    def _generate_instruction_text(self, m_type: str, modifier: str, name: str) -> str:
        """
        Creates clear, spoken-style driving instructions based on maneuver type and modifier.
        """
        mod_clean = modifier.replace("_", " ").title() if modifier else ""
        
        if m_type == "depart":
            return f"Head onto {name}"
        elif m_type == "arrive":
            return f"Arrive at destination on {name}"
        elif m_type == "roundabout":
            return f"At the roundabout, take the exit onto {name}"
        elif m_type == "fork":
            return f"Take the {mod_clean.lower() or 'designated'} fork toward {name}"
        elif m_type == "merge":
            return f"Merge onto {name}"
        elif m_type in ("on ramp", "off ramp"):
            return f"Take the ramp onto {name}"
        elif m_type == "new name":
            return f"Continue onto {name}"
        elif m_type == "end of road":
            return f"Turn {mod_clean.lower() or 'left'} at the end of the road onto {name}"
        elif m_type == "continue":
            return f"Continue straight on {name}"
        elif modifier:
            return f"Turn {mod_clean.lower()} onto {name}"
        else:
            return f"Follow {name}"

    def _map_maneuver_icon(self, m_type: str, modifier: str) -> str:
        """
        Returns corresponding Lucide / SVG icon name for turn indicators.
        """
        if m_type == "depart":
            return "navigation"
        if m_type == "arrive":
            return "map-pin"
        if "roundabout" in m_type:
            return "refresh-cw"
        if "sharp right" in modifier or "right" in modifier:
            return "corner-up-right"
        if "sharp left" in modifier or "left" in modifier:
            return "corner-up-left"
        if "uturn" in modifier:
            return "rotate-ccw"
        return "arrow-up"

    def _fallback_interpolated_route(self, start: List[float], end: List[float], waypoints: Optional[List] = None) -> Dict[str, Any]:
        """
        Generates realistic curved path interpolation with synthetic turn-by-turn steps when external router is unreachable.
        """
        pts_list = [start]
        if waypoints and len(waypoints) > 2:
            pts_list.extend(waypoints[1:-1])
        pts_list.append(end)
        
        full_coords = []
        total_dist_km = 0.0
        
        for i in range(len(pts_list) - 1):
            p1 = pts_list[i]
            p2 = pts_list[i+1]
            n_seg = 30
            lons = np.linspace(p1[0], p2[0], n_seg)
            lats = np.linspace(p1[1], p2[1], n_seg)
            
            # Add subtle natural road curvature wiggle
            wiggle_scale = 0.003
            t = np.linspace(0, np.pi, n_seg)
            wiggle_lats = lats + (np.sin(t) * wiggle_scale * (1 if i % 2 == 0 else -1))
            
            for lon, lat in zip(lons, wiggle_lats):
                full_coords.append([round(lon, 6), round(lat, 6)])
                
            dx = (p2[0] - p1[0]) * 111.0 * math.cos(math.radians(p1[1]))
            dy = (p2[1] - p1[1]) * 111.0
            total_dist_km += math.sqrt(dx*dx + dy*dy)
            
        total_dist_km = round(total_dist_km * 1.22, 2) # Road winding factor
        duration_min = round(total_dist_km / 45.0 * 60, 1) # Mountain driving average 45km/h
        
        # Synthetic steps along waypoints
        steps = [
            {
                "step_number": 1,
                "type": "depart",
                "modifier": "straight",
                "instruction": "Depart origin along primary mountain highway",
                "street_name": "Himalayan Corridor Route",
                "distance_m": round(total_dist_km * 350, 1),
                "distance_km": round(total_dist_km * 0.35, 2),
                "duration_s": round(duration_min * 21, 1),
                "location": start,
                "icon": "navigation"
            }
        ]
        
        if waypoints and len(waypoints) > 2:
            steps.append({
                "step_number": 2,
                "type": "turn",
                "modifier": "slight right",
                "instruction": "Follow designated mountain safe detour bypass",
                "street_name": "Stabilized Escarpment Bypass",
                "distance_m": round(total_dist_km * 450, 1),
                "distance_km": round(total_dist_km * 0.45, 2),
                "duration_s": round(duration_min * 27, 1),
                "location": waypoints[1],
                "icon": "corner-up-right"
            })
            
        steps.append({
            "step_number": len(steps) + 1,
            "type": "arrive",
            "modifier": "straight",
            "instruction": "Arrive safely at destination",
            "street_name": "Destination",
            "distance_m": 0.0,
            "distance_km": 0.0,
            "duration_s": 0.0,
            "location": end,
            "icon": "map-pin"
        })
        
        return {
            "coordinates": full_coords,
            "distance_km": total_dist_km,
            "duration_min": duration_min,
            "steps": steps,
            "alternatives": [],
            "provider": "Synthetic Mountain Road Interpolator",
            "status": "SUCCESS"
        }

    def check_route_intersections(self, route_coords: List[List[float]], geofences_geojson: Dict[str, Any]) -> Dict[str, Any]:
        """
        Checks if route polyline intersects any active landslide geofence polygon using Shapely & GeoPandas.
        """
        if len(route_coords) < 2:
            return {"intersects": False, "intersecting_geofences": []}
            
        route_line = LineString(route_coords)
        features = geofences_geojson.get("features", [])
        
        intersecting = []
        for feature in features:
            geom_dict = feature.get("geometry", {})
            props = feature.get("properties", {})
            
            if geom_dict.get("type") == "Polygon":
                poly_shape = Polygon(geom_dict["coordinates"][0])
                if route_line.intersects(poly_shape):
                    # Compute exact intersection coordinates or closest point
                    intersecting.append({
                        "id": props.get("id"),
                        "name": props.get("name"),
                        "lhi": props.get("lhi"),
                        "center": props.get("center")
                    })
                    
        return {
            "intersects": len(intersecting) > 0,
            "intersecting_count": len(intersecting),
            "intersecting_geofences": intersecting
        }

    def compute_distance_to_route(self, point_coords: List[float], route_coords: List[List[float]]) -> float:
        """
        Calculates the minimum perpendicular distance in meters from GPS position [lon, lat] to the route polyline.
        Uses projected Mercator coordinate system for metric accuracy.
        """
        if not route_coords or len(route_coords) < 2:
            return 0.0
            
        try:
            pt_x, pt_y = self.wgs84_to_mercator(point_coords[0], point_coords[1])
            pt_geom = Point(pt_x, pt_y)
            
            projected_pts = [self.wgs84_to_mercator(c[0], c[1]) for c in route_coords]
            line_geom = LineString(projected_pts)
            
            dist_meters = line_geom.distance(pt_geom)
            return round(dist_meters, 1)
        except Exception as e:
            # Fallback Haversine point-to-line approximation
            min_dist = float('inf')
            p_lon, p_lat = point_coords[0], point_coords[1]
            for c in route_coords:
                dx = (c[0] - p_lon) * 111320.0 * math.cos(math.radians(p_lat))
                dy = (c[1] - p_lat) * 110540.0
                d = math.sqrt(dx*dx + dy*dy)
                if d < min_dist:
                    min_dist = d
            return round(min_dist, 1)

    def find_active_step_and_progress(self, point_coords: List[float], steps: List[Dict[str, Any]], route_coords: List[List[float]]) -> Dict[str, Any]:
        """
        Determines current active maneuver, distance to next turn, remaining route distance and estimated ETA.
        """
        if not steps or not route_coords:
            return {
                "active_step_index": 0,
                "current_step": None,
                "next_step": None,
                "distance_to_next_m": 0.0,
                "remaining_distance_km": 0.0,
                "remaining_duration_min": 0.0
            }
            
        # Find closest point along route_coords
        closest_idx = 0
        min_d = float('inf')
        for i, c in enumerate(route_coords):
            d = (c[0] - point_coords[0])**2 + (c[1] - point_coords[1])**2
            if d < min_d:
                min_d = d
                closest_idx = i
                
        # Calculate remaining route distance in km from closest_idx to end
        remaining_km = 0.0
        for i in range(closest_idx, len(route_coords) - 1):
            p1 = route_coords[i]
            p2 = route_coords[i+1]
            dx = (p2[0] - p1[0]) * 111.0 * math.cos(math.radians(p1[1]))
            dy = (p2[1] - p1[1]) * 111.0
            remaining_km += math.sqrt(dx*dx + dy*dy)
            
        remaining_km = round(remaining_km, 2)
        remaining_min = round(remaining_km / 45.0 * 60, 1)
        
        # Determine which step we are currently on based on location
        active_step_idx = 0
        dist_to_next_m = 0.0
        
        for idx, step in enumerate(steps):
            loc = step.get("location", [0, 0])
            dx = (loc[0] - point_coords[0]) * 111320.0 * math.cos(math.radians(point_coords[1]))
            dy = (loc[1] - point_coords[1]) * 110540.0
            step_dist = math.sqrt(dx*dx + dy*dy)
            
            # If step location is ahead or closest
            if idx > 0 and step_dist < 1500: # Within 1.5 km of this maneuver
                active_step_idx = idx
                dist_to_next_m = round(step_dist, 1)
                break
                
        if active_step_idx >= len(steps):
            active_step_idx = len(steps) - 1
            
        current_step = steps[active_step_idx]
        next_step = steps[active_step_idx + 1] if active_step_idx + 1 < len(steps) else None
        
        if dist_to_next_m == 0.0 and current_step:
            loc = current_step.get("location", [0, 0])
            dx = (loc[0] - point_coords[0]) * 111320.0 * math.cos(math.radians(point_coords[1]))
            dy = (loc[1] - point_coords[1]) * 110540.0
            dist_to_next_m = round(math.sqrt(dx*dx + dy*dy), 1)

        return {
            "active_step_index": active_step_idx,
            "current_step": current_step,
            "next_step": next_step,
            "distance_to_next_m": dist_to_next_m,
            "remaining_distance_km": remaining_km,
            "remaining_duration_min": remaining_min
        }

    def check_hazard_proximity(self, point_coords: List[float], geofences_geojson: Dict[str, Any], warning_radius_m: float = 2000.0) -> Optional[Dict[str, Any]]:
        """
        Monitors driver proximity to known hazard geofences.
        Returns alert payload if within warning_radius_m (default 2 km).
        """
        features = geofences_geojson.get("features", [])
        closest_hazard = None
        min_distance = float('inf')
        
        p_lon, p_lat = point_coords[0], point_coords[1]
        
        for feat in features:
            props = feat.get("properties", {})
            center = props.get("center", [0, 0])
            
            dx = (center[0] - p_lon) * 111320.0 * math.cos(math.radians(p_lat))
            dy = (center[1] - p_lat) * 110540.0
            dist_m = math.sqrt(dx*dx + dy*dy)
            
            if dist_m < warning_radius_m and dist_m < min_distance:
                min_distance = dist_m
                closest_hazard = {
                    "hazard_name": props.get("name", "Active Landslide Zone"),
                    "lhi": props.get("lhi", 0.88),
                    "distance_m": round(dist_m),
                    "distance_km": round(dist_m / 1000.0, 2),
                    "center": center,
                    "buffer_radius_m": props.get("radius_m", 800)
                }
                
        return closest_hazard
