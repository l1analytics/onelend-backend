const { app } = require("@azure/functions");
const axios = require("axios");

/*==================================================
    Set up Azure Maps API configuration
  ==================================================*/

const azureMapsSubscriptionKey = "UnyAz4-299zRf2CL0qUlzUftjhn3t8HDuCp7AObisjU"; //process.env.AZURE_MAPS_SUBSCRIPTION_KEY;

if (!azureMapsSubscriptionKey) {
  console.log("AZURE_MAPS_SUBSCRIPTION_KEY could not be retrieved from environment variables.");
}

/*==================================================
    Helper function to calculate distance in miles
  ==================================================*/
function calculateDistance(coord1, coord2) {
  // coord1 and coord2 are [longitude, latitude]
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  
  const R = 3959; // Earth's radius in miles
  
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

app.http("geocodeAddress", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    //==============================
    //    Parse request body
    //==============================
    if (!request.body) {
      const error_message = JSON.stringify({
        error: "Request body is required",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    let requestBody;
    try {
      requestBody = await request.json();
      if (typeof requestBody !== "object") {
        const error_message = JSON.stringify({
          error: "Request body must be a JSON object",
        });
        context.log(error_message);
        return {
          status: 400,
          body: error_message,
        };
      }
    } catch (error) {
      const error_message = JSON.stringify({
        error: "Invalid JSON in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    //==============================
    //    Validate required fields
    //==============================
    const { address, subjectCoordinate } = requestBody;

    if (!address) {
      const error_message = JSON.stringify({
        error: "address is required in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    if (!subjectCoordinate) {
      const error_message = JSON.stringify({
        error: "subjectCoordinate is required in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    if (!Array.isArray(subjectCoordinate) || subjectCoordinate.length !== 2) {
      const error_message = JSON.stringify({
        error: "subjectCoordinate must be an array of [longitude, latitude]",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    //==============================
    //    Call Azure Maps Geocoding API
    //==============================
    try {
      const geocodeUrl = "https://atlas.microsoft.com/geocode";
      
      const config = {
        method: "get",
        url: geocodeUrl,
        params: {
          "api-version": "2025-01-01",
          "query": address,
        },
        headers: {
          "subscription-key": azureMapsSubscriptionKey,
        },
        timeout: 10000,
      };

      context.log(`Geocoding address: ${address}`);
      
      const response = await axios(config);
      
      context.log(`Successfully geocoded address: ${address}`);
      
      // Extract specific fields from response
      const features = response.data.features;
      if (!features || features.length === 0) {
        return {
          status: 404,
          body: JSON.stringify({
            error: "No geocoding results found for the provided address",
          }),
        };
      }
      
      const firstFeature = features[0];
      const geocodedCoordinates = firstFeature.geometry?.coordinates || null;
      
      // Calculate distance between subject property and geocoded address
      const distanceToSubjectInMiles = geocodedCoordinates 
        ? calculateDistance(subjectCoordinate, geocodedCoordinates)
        : null;
      
      const result = {
        coordinates: geocodedCoordinates,
        type: firstFeature.properties?.type || null,
        confidence: firstFeature.properties?.confidence || null,
        matchCode: firstFeature.properties?.matchCodes?.[0] || null,
        distanceToSubjectInMiles: distanceToSubjectInMiles,
      };
      
      // Return the extracted geocoding data
      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(result),
      };
      
    } catch (error) {
      if (error.response) {
        context.log(
          `Azure Maps API Error: ${error.response.status} - ${
            error.response.data?.error?.message || error.message
          }`
        );
        return {
          status: error.response.status,
          body: JSON.stringify({
            error: error.response.data?.error?.message || error.message,
            details: error.response.data,
          }),
        };
      } else if (error.request) {
        context.log(`Error: No response received from Azure Maps API`);
        return {
          status: 503,
          body: JSON.stringify({
            error: "Network error: No response received from Azure Maps API",
          }),
        };
      } else {
        context.log(`Error: Request failed. Error: ${error.message}`);
        return {
          status: 500,
          body: JSON.stringify({
            error: `Request failed: ${error.message}`,
          }),
        };
      }
    }
  },
});
