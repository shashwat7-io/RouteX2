import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from lhi_engine import LHIEngine
from geofence import GeofenceEngine
from router import RouterEngine
from fastapi.testclient import TestClient
from main import app

def test_system():
    print("--- 1. Testing LHIEngine & XGBoost/GB Model ---")
    lhi_engine = LHIEngine()
    
    # Test LHI calculation with critical values
    res = lhi_engine.calculate_lhi(slope_angle=45.0, rainfall_24h=145.0, soil_saturation=0.92)
    print(f"LHI Score: {res['lhi']} | Danger: {res['is_danger']} | Method: {res['calculation_method']}")
    assert res['lhi'] >= 0.75, "Expected critical LHI >= 0.75"
    assert lhi_engine.model is not None, "Expected ML model to be loaded"

    
    # Test safe values
    res_safe = lhi_engine.calculate_lhi(slope_angle=10.0, rainfall_24h=5.0, soil_saturation=0.15)
    print(f"Safe LHI Score: {res_safe['lhi']} | Danger: {res_safe['is_danger']}")
    assert res_safe['lhi'] < 0.40, "Expected low LHI for gentle slope and dry conditions"
    
    print("\n--- 2. Testing GeofenceEngine (Shapely & GeoPandas) ---")
    geofence_engine = GeofenceEngine(default_buffer_radius_m=800.0)
    points = [
        {"latitude": 30.4120, "longitude": 78.6850, "lhi": 0.864, "name": "Sector A"},
        {"latitude": 30.2000, "longitude": 78.4000, "lhi": 0.350, "name": "Safe Zone"}
    ]
    geofences = geofence_engine.generate_danger_geofences(points, threshold=0.75)
    print(f"Geofences Generated Count: {geofences['geofence_count']}")
    assert geofences['geofence_count'] == 1, "Expected exactly 1 danger geofence"
    assert len(geofences['features']) == 1, "Expected 1 GeoJSON feature"

    
    print("\n--- 3. Testing RouterEngine, Steps & Real-Time Navigation Functions ---")
    router_engine = RouterEngine()
    start = [78.2676, 30.0869]  # Rishikesh [lon, lat]
    end = [79.0669, 30.7346]    # Kedarnath/Rudraprayag corridor [lon, lat]
    
    primary_route = router_engine.get_route(start, end, include_steps=True)
    print(f"Primary Route Provider: {primary_route['provider']} | Distance: {primary_route['distance_km']} km | Points: {len(primary_route['coordinates'])}")
    print(f"Navigation Steps Generated: {len(primary_route.get('steps', []))}")
    assert len(primary_route['coordinates']) > 5, "Expected multi-point polyline"
    assert len(primary_route.get('steps', [])) > 0, "Expected turn-by-turn navigation steps"
    
    first_step = primary_route['steps'][0]
    print(f"Sample Step 1: '{first_step.get('instruction')}' ({first_step.get('distance_m')}m) [Icon: {first_step.get('icon')}]")
    assert "instruction" in first_step
    assert "icon" in first_step
    
    # Test perpendicular distance to route
    # Point very close to first coordinate
    c0 = primary_route['coordinates'][0]
    dist_on = router_engine.compute_distance_to_route([c0[0], c0[1]], primary_route['coordinates'])
    print(f"Distance to start point: {dist_on:.2f} meters")
    assert dist_on < 10.0, "Expected point on route to be < 10m away"
    
    # Point ~1 km away
    dist_off = router_engine.compute_distance_to_route([c0[0] + 0.01, c0[1] + 0.01], primary_route['coordinates'])
    print(f"Distance to offset point: {dist_off:.2f} meters")
    assert dist_off > 100.0, "Expected offset point to register > 100m away"
    
    # Test active step finding & remaining distance
    nav_progress = router_engine.find_active_step_and_progress(
        [c0[0], c0[1]],
        primary_route['steps'],
        primary_route['coordinates']
    )
    print(f"Active Step: {nav_progress.get('current_step', {}).get('instruction')} | Remaining km: {nav_progress.get('remaining_distance_km')} km")
    assert nav_progress['remaining_distance_km'] > 0, "Expected positive remaining distance"

    
    # Test hazard proximity check
    # Test hazard proximity check
    proximity_hazard = router_engine.check_hazard_proximity([c0[0], c0[1]], geofences, warning_radius_m=200000.0) # Check wide radius for test
    print(f"Hazard proximity result: {proximity_hazard}")
    assert proximity_hazard is not None, "Expected hazard proximity alert within 200km test radius"
    print(f"Warning detail: {proximity_hazard['hazard_name']} at {proximity_hazard['distance_m']}m")


    print("\n--- 4. Testing FastAPI API Endpoints via TestClient ---")
    client = TestClient(app)
    
    # 4a. Health check
    res_health = client.get("/health")
    assert res_health.status_code == 200
    print("Health Check: OK")
    
    # 4b. Geocode autocomplete
    res_geo = client.get("/api/geocode/autocomplete?q=Badrinath")
    assert res_geo.status_code == 200
    geo_data = res_geo.json()
    results = geo_data.get('results', [])
    print(f"Autocomplete 'Badrinath' count: {len(results)}")
    assert len(results) > 0, "Expected at least 1 result for Badrinath"
    first_geo = results[0]
    print(f"Geocoded: {first_geo.get('formatted')} at ({first_geo.get('latitude')}, {first_geo.get('longitude')})")
    
    # 4c. Geocode reverse
    res_rev = client.get("/api/geocode/reverse?lat=30.0869&lon=78.2676")
    assert res_rev.status_code == 200
    rev_data = res_rev.json()
    print(f"Reverse geocode: {rev_data.get('address')}")
    assert "address" in rev_data

    
    # 4d. POST /api/route
    route_payload = {
        "start": [78.2676, 30.0869],
        "end": [79.4938, 30.7433],
        "hazard_points": [
            {"latitude": 30.4120, "longitude": 78.6850, "slope_angle": 48.0, "rainfall_24h": 140.0, "soil_saturation": 0.90, "name": "Danger Zone Alpha"}
        ],
        "include_steps": True
    }
    res_route = client.post("/api/route", json=route_payload)
    assert res_route.status_code == 200
    route_resp = res_route.json()
    print(f"Safety: {route_resp.get('safety_status')} | Intersects Hazard: {route_resp.get('hazard_detected')}")
    print(f"Detour Reason: {route_resp.get('detour_reason')}")
    assert "primary_route" in route_resp
    assert "recalculated_safe_route" in route_resp
    assert "steps" in route_resp["primary_route"]
    
    # 4e. POST /api/navigation/check
    coords = route_resp["recalculated_safe_route"]["coordinates"]
    steps = route_resp["recalculated_safe_route"]["steps"]
    nav_payload = {
        "current_position": coords[0],
        "route_coordinates": coords,
        "steps": steps,
        "geofences": route_resp.get("geofences"),
        "recalculate_threshold_m": 60.0
    }
    res_nav = client.post("/api/navigation/check", json=nav_payload)
    assert res_nav.status_code == 200
    nav_data = res_nav.json()
    print(f"Navigation Check: is_off_route={nav_data.get('is_off_route')} | dist_m={nav_data.get('distance_to_route_m')} | remaining_km={nav_data.get('remaining_distance_km')}")
    assert nav_data.get("is_off_route") is False
    assert nav_data.get("distance_to_route_m") < 10.0

    
    print("\n=======================================================")
    print("🎉 ALL END-TO-END BACKEND & NAVIGATION TESTS PASSED! 🎉")
    print("=======================================================")

if __name__ == "__main__":
    test_system()
