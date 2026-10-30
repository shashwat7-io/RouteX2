
Act as a Senior Full-Stack Developer, AI/ML Engineer, GIS Specialist, and DevOps Engineer.

I have an existing project called ROUTEX AI 2.0.

PROJECT:
RouteX AI 2.0 is an AI-powered landslide hazard detection and smart navigation platform designed to help users identify potentially dangerous roads in landslide-prone regions and find safer alternative routes.

MY MAIN OBJECTIVE:

Transform my existing RouteX application into a fully functional, real-data-driven landslide hazard monitoring, prediction, and intelligent navigation platform.

I want to integrate the following technologies and data sources into ONE complete working system:

1. Geological Survey of India (GSI)
2. NASA Global Precipitation Measurement (GPM)
3. NASA IMERG rainfall datasets
4. XGBoost Machine Learning
5. Historical landslide datasets
6. Terrain and elevation datasets
7. GPS-based live location
8. OpenStreetMap
9. Smart route optimization
10. Dynamic landslide risk assessment

IMPORTANT FIRST INSTRUCTION:

Before writing or modifying any code:

- Inspect the entire existing repository.
- Understand the existing frontend and backend architecture.
- Identify whether the backend uses Flask or FastAPI.
- Identify the frontend framework.
- Inspect the existing XGBoost model, datasets, APIs, database, map integration and navigation system.
- Identify which features are already working.
- Identify missing features and bugs.
- Preserve the existing UI design, branding, functionality and working features.

DO NOT unnecessarily rebuild the application.
DO NOT remove existing features.
DO NOT replace working components with dummy implementations.
Make changes incrementally while maintaining backward compatibility.

==================================================
PART 1: GSI LANDSLIDE DATA INTEGRATION
==================================================

Integrate real landslide-related data from the Geological Survey of India.

OFFICIAL SOURCES:

https://bhukosh.gsi.gov.in/Bhukosh/Public
https://gsi.gov.in/

OBJECTIVES:

1. Identify publicly accessible GSI landslide datasets.
2. Obtain historical landslide inventory data.
3. Obtain landslide susceptibility maps where available.
4. Support formats such as:
   - CSV
   - GeoJSON
   - Shapefile
   - GeoTIFF

5. Extract available information:
   - Latitude
   - Longitude
   - Landslide occurrence date
   - Landslide type
   - Geographical location
   - Susceptibility classification

6. Build a reusable Python data ingestion pipeline.
7. Validate geographical coordinates.
8. Remove duplicate records.
9. Handle missing information.
10. Convert geographical data to a consistent coordinate reference system.

IMPORTANT:

GSI datasets may not provide a public API or automated downloads for every dataset.

If automated access is unavailable:
- Provide a manual dataset download and upload workflow.
- Allow administrators to import GSI datasets.
- Never fabricate records.
- Maintain source attribution and dataset metadata.

Distinguish historical landslide events from susceptibility maps.

==================================================
PART 2: NASA GPM RAINFALL INTEGRATION
==================================================

Integrate real NASA GPM IMERG precipitation data.

OFFICIAL SOURCES:

https://gpm.nasa.gov/data/imerg
https://www.earthdata.nasa.gov/
https://urs.earthdata.nasa.gov/

OBJECTIVES:

1. Integrate NASA GPM IMERG data.
2. Use officially supported NASA data access methods.
3. Support Earthdata authentication where required.
4. Retrieve rainfall observations for the geographical regions covered by RouteX.
5. Support geographical coordinates and bounding boxes.
6. Process rainfall observations into useful environmental features.

EXTRACT:

- Latitude
- Longitude
- Observation timestamp
- Precipitation rate
- Rainfall accumulation

CALCULATE WHERE DATA SUPPORTS IT:

- Last 30-minute rainfall
- Last 1-hour rainfall
- Last 24-hour rainfall
- Last 3-day rainfall
- Last 7-day rainfall

Respect the temporal resolution and availability of the selected IMERG product.

Create a Python service:

backend/services/nasa_gpm_service.py

Create APIs:

GET /api/rainfall/current
GET /api/rainfall/location
GET /api/rainfall/history
GET /api/rainfall/region

REQUIREMENTS:

- Cache downloaded satellite data.
- Avoid unnecessary repeated downloads.
- Store observation timestamps.
- Track data freshness.
- Handle API failures.
- Handle unavailable datasets.
- Never silently replace missing observations with fabricated rainfall values.
- Store NASA credentials securely in backend environment variables.

NASA GPM provides rainfall estimates, NOT direct landslide detections.

==================================================
PART 3: TERRAIN AND GEOGRAPHICAL DATA
==================================================

Integrate geographical information required for landslide hazard assessment.

Use suitable publicly accessible elevation and terrain datasets.

Potential source:

https://www.earthdata.nasa.gov/

Extract or calculate:

- Elevation
- Slope angle
- Terrain characteristics
- Geographical coordinates

Use appropriate GIS libraries such as:

- GeoPandas
- Rasterio
- Shapely
- GDAL
- NumPy

Ensure that coordinate systems and raster resolutions are handled correctly.

Do not invent terrain information.

==================================================
PART 4: XGBOOST MACHINE LEARNING ENGINE
==================================================

Upgrade the existing RouteX XGBoost landslide prediction system.

FIRST:

Inspect the current model and identify:
- Existing training dataset.
- Input features.
- Target labels.
- Preprocessing pipeline.
- Model evaluation metrics.
- Existing prediction API.

Then integrate compatible GSI, NASA GPM and terrain features.

POSSIBLE FEATURES:

1. Rainfall intensity.
2. Cumulative rainfall.
3. Slope angle.
4. Elevation.
5. Soil moisture, if available.
6. Soil type, if available.
7. Historical landslide information.
8. Susceptibility classification.

MACHINE LEARNING REQUIREMENTS:

- Clean and preprocess datasets.
- Handle missing values appropriately.
- Avoid data leakage.
- Match rainfall observations to geographical and temporal locations.
- Create properly labelled training samples.
- Avoid treating unrecorded landslide locations as confirmed negative samples.
- Distinguish historical events from susceptibility information.
- Use appropriate spatial and temporal validation.
- Compare the new model with the existing model.
- Preserve the previous model until the new model has been validated.

EVALUATION:

Calculate:

- Accuracy
- Precision
- Recall
- F1-score
- ROC-AUC where appropriate
- Confusion matrix

Do not fabricate performance metrics.

MODEL OUTPUT:

Provide:

- Hazard score.
- Hazard category.
- Input environmental parameters.
- Data sources.
- Observation timestamps.
- Model version.
- Uncertainty information where validated.

Possible categories:

- LOW
- MODERATE
- HIGH
- VERY HIGH

Determine classification thresholds through appropriate validation and calibration.

Create or update:

backend/ml/
backend/models/
backend/services/landslide_prediction.py

Create API:

POST /api/prediction/landslide

Input:

{
  "latitude": 30.3165,
  "longitude": 78.0322
}

The API should retrieve available environmental features and return an estimated hazard assessment.

Do not use example coordinates or hardcoded values as actual live predictions.

==================================================
PART 5: LIVE GPS AND SMART NAVIGATION
==================================================

Upgrade the existing RouteX navigation system.

FEATURES:

- Live GPS tracking.
- Current location detection.
- Destination autocomplete.
- Destination search.
- Route calculation.
- Distance and estimated travel time.
- Turn-by-turn navigation where supported.
- Alternative route suggestions.
- Off-route detection.
- Automatic rerouting where supported.

Use the existing map provider where possible.

If necessary, use:

- OpenStreetMap.
- MapLibre.
- OSRM or Valhalla.
- Browser Geolocation API.

Do not replace existing navigation unnecessarily.

==================================================
PART 6: LANDSLIDE-AWARE ROUTE OPTIMIZATION
==================================================

This is one of the most important features.

Whenever a user enters a destination:

1. Obtain the current GPS location.
2. Calculate candidate routes.
3. Divide the route into geographical segments.
4. Check the segments against GSI historical landslide records.
5. Check intersection with susceptibility zones.
6. Retrieve available NASA GPM rainfall information.
7. Obtain XGBoost hazard estimates where sufficient inputs exist.
8. Calculate a route-level hazard assessment.
9. Compare available alternative routes.
10. Recommend a suitable route balancing travel time, distance and estimated hazard exposure.

MAP VISUALIZATION:

Use the following visual categories:

- Green: Lower estimated hazard.
- Yellow: Moderate estimated hazard.
- Orange: High estimated hazard.
- Red: Very high estimated hazard.
- Grey: Insufficient or unavailable hazard information.

DISPLAY:

- Current location.
- Destination.
- Selected route.
- Alternative routes.
- Historical landslide locations.
- Susceptibility zones.
- Rainfall information.
- Predicted hazard areas.

ALERT EXAMPLES:

"Warning: This route intersects a high landslide susceptibility zone."

"Elevated rainfall has been observed near a section of your route."

"An alternative route with lower estimated hazard exposure is available."

"Insufficient environmental data is available to assess this route reliably."

IMPORTANT:

- Never claim a route is completely safe.
- Do not automatically declare a road closed without verified closure data.
- Do not invent real-time landslide events.
- Distinguish historical events, susceptibility, rainfall observations and model predictions.
- Do not assume missing data means low risk.
- Clearly show the time and source of observations.
- Recommend following official disaster warnings.

==================================================
PART 7: FRONTEND UI AND DASHBOARD
==================================================

Integrate all features into the existing RouteX interface.

Do not unnecessarily change the existing design.

Add or upgrade these dashboard components:

1. Landslide Monitoring Dashboard.
2. Live Rainfall Monitoring.
3. Historical Landslide Map.
4. Landslide Susceptibility Map.
5. AI Prediction Panel.
6. Live Navigation.
7. Route Risk Comparison.
8. Environmental Data Status.
9. Data Source Information.
10. Map Legend.

DASHBOARD SHOULD SHOW:

- Current rainfall.
- Rainfall history.
- Current location.
- Estimated hazard level.
- Nearby historical landslides.
- Susceptibility zones.
- Last data update.
- Model prediction details.
- Selected route risk assessment.

Use responsive layouts for desktop and mobile.

==================================================
PART 8: BACKEND AND API STRUCTURE
==================================================

Organize the backend into reusable modules.

Suggested structure:

backend/
  app.py
  requirements.txt

  services/
    gsi_service.py
    nasa_gpm_service.py
    terrain_service.py
    landslide_prediction.py
    route_risk_service.py

  ml/
    train_model.py
    evaluate_model.py
    preprocess_data.py

  models/
    xgboost_model.json

  datasets/
    landslides/
    rainfall/
    terrain/

  routes/
    landslide_routes.py
    rainfall_routes.py
    prediction_routes.py
    navigation_routes.py

  utils/
    geo_utils.py
    data_validation.py
    caching.py

Adapt this structure to my actual repository rather than blindly creating duplicate modules.

Provide proper API documentation and meaningful error responses.

==================================================
PART 9: SECURITY AND PERFORMANCE
==================================================

- Keep API credentials in environment variables.
- Never expose NASA credentials in frontend JavaScript.
- Add API request validation.
- Add error handling.
- Cache satellite observations.
- Avoid downloading large datasets on every user request.
- Use background processing for large data operations.
- Add logging.
- Validate external data before processing.
- Prevent duplicate dataset imports.
- Optimize geographical queries.
- Use appropriate rate limits.
- Ensure GPS works over HTTPS.

==================================================
PART 10: DEPLOYMENT
==================================================

Prepare the complete project for production deployment.

My source code is stored on GitHub.

Backend deployment:
Render.

Frontend deployment:
Render Static Sites or Vercel, depending on the existing framework.

Requirements:

- Create or update requirements.txt.
- Provide production start commands.
- Configure environment variables.
- Configure frontend API base URL.
- Add CORS configuration.
- Provide .env.example.
- Update .gitignore.
- Ensure secrets are not committed.
- Verify backend and frontend connectivity.
- Provide exact deployment instructions.

==================================================
PART 11: TESTING AND FINAL VERIFICATION
==================================================

Test the entire integrated application.

TEST:

1. GSI dataset import.
2. Historical landslide map.
3. Susceptibility zone visualization.
4. NASA GPM rainfall retrieval.
5. Rainfall calculations.
6. Terrain feature extraction.
7. XGBoost predictions.
8. Model evaluation.
9. GPS tracking.
10. Destination search.
11. Route calculation.
12. Hazard intersection detection.
13. Alternative route selection.
14. API responses.
15. Mobile responsiveness.
16. Production deployment.

For each feature, report:

- Working.
- Partially working.
- Not implemented.
- Requires manual data upload.
- Requires credentials.
- Blocked by unavailable source data.

Never mark a feature as complete unless it has actually been tested.

==================================================
FINAL INSTRUCTIONS
==================================================

I want a COMPLETE WORKING UPGRADE, not just a UI redesign.

Prioritize actual data integration over mock data.

Do not fabricate:
- Landslide records.
- Rainfall observations.
- Model accuracy.
- Prediction results.
- Road closures.
- Live disaster alerts.

If any external dataset cannot be accessed automatically, build a manual import workflow and document it.

Do not destroy my existing application.

Before finishing:

1. Summarize all changes.
2. List all files created or modified.
3. Explain all required API credentials.
4. Provide installation commands.
5. Provide local testing instructions.
6. Provide deployment commands.
7. Explain which features use real data.
8. Explain which features still need additional datasets or validation.

Make the existing RouteX AI 2.0 project a reliable, data-driven, landslide-aware navigation platform.
