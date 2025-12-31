const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const uuid = require("uuid");
const { postRequest } = require("./sendApiRequests");

const lookupBatchData = async (context, batchDataRequestBody) => {
  const endpointBatchData = process.env.BATCHDATA_ENDPOINT;
  // const keyBatchData = process.env.BATCHDATA_KEY;
  const keyBatchData = "bAvjToxKsdPSjltgFTjw0uVf92Rjr3KPdwOBMfuE";

  if (!endpointBatchData || !keyBatchData) {
    context.log(
      `Required Batch Data API configuration values are missing: endpoint ${endpointBatchData}, key ${keyBatchData}`
    );
  }

  let responseData;

  context.log(`@@@@@@ Inside lookupBatchData @@@@@@`);
  context.log('@@@@@@ request body:', JSON.stringify(batchDataRequestBody));
  
  try {
    responseData = await postRequest(
      context,
      endpointBatchData + "property/lookup/all-attributes",
      batchDataRequestBody,
      {
        headers: {
          Accept: "application/json, application/xml",
          Authorization: "Bearer " + keyBatchData,
        },
      }
    );
  } catch (error) {
    context.log(
      `Batch Data API request (lookup) failed for request body: ${batchDataRequestBody}: `,
      error
    );
    return {
      status: 502,
      body: JSON.stringify({
        error: "Failed to retrieve data from Batch Data API (lookup)",
        details: error.message,
      }),
    };
  }

  // If no property data returned from BatchData, return empty array
  if (responseData.results.properties.length == 0) {
    return responseData;
  }

  //========================================================
  //      Save results to Cosmos DB
  //========================================================
  const cosmosEndpoint = process.env.COSMOSDB_ENDPOINT;
  const databaseName = process.env.DATABASE_NAME;

  if (!cosmosEndpoint || !databaseName) {
    context.log(
      `COSMOSDB_ENDPOINT ${cosmosEndpoint} or DATABASE_NAME ${databaseName} could not be retrieved from App Configuration.`
    );
  }

  const containerName = "batchData";

  const credential = new DefaultAzureCredential();
  var client = new CosmosClient({
    endpoint: cosmosEndpoint,
    aadCredentials: credential,
  });

  const database = client.database(databaseName);
  const container = database.container(containerName);

  await Promise.all(
    responseData.results.properties.map((resultItem) => {
      // container.items.create(itemDef)
      resultItem.id = uuid.v4(); // Generate a new UUID for the item
      resultItem.propertyRecordId = resultItem.id;
      resultItem.fipsCodePlusApn =
        resultItem?.ids?.fipsCode + "+" + resultItem?.ids?.apn;
      resultItem.dateRetrieved = new Date().toISOString();
      try {
        container.items.upsert(resultItem);
      } catch (error) {
        context.log(
          `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerName}. data: ${resultItem}  ${error.message}`
        );
        throw error;
      }
    })
  );

  return responseData;
};

const searchBatchData = async (
  context,
  batchDataRequestBody,
  batchDataPropertySubject
) => {
  const endpointBatchData = process.env.BATCHDATA_ENDPOINT;
  // const keyBatchData = process.env.BATCHDATA_KEY;
  const keyBatchData = "bAvjToxKsdPSjltgFTjw0uVf92Rjr3KPdwOBMfuE";

  if (!endpointBatchData || !keyBatchData) {
    context.log(
      `Required Batch Data API configuration values are missing: endpoint ${endpointBatchData}, key ${keyBatchData}`
    );
  }

  let responseData;
  let fetchedActualData;

  let requestBody = batchDataRequestBody;
  const requestedNumComps = requestBody.options.take;
  requestBody.options.take = 0;
  requestBody.options.distanceMiles = 0.5;
  let requestedNumCompsFound = false;

  while (!requestedNumCompsFound && requestBody.options.distanceMiles < 5.0) {
    try {
      responseData = await postRequest(
        context,
        endpointBatchData + "property/search",
        requestBody,
        {
          headers: {
            Accept: "application/json, application/xml",
            Authorization: "Bearer " + keyBatchData,
          },
        }
      );
    } catch (error) {
      context.log(
        `Batch Data API request (search) failed for request body: ${batchDataRequestBody}: `,
        error
      );
      return {
        status: 502,
        body: JSON.stringify({
          error: "Failed to retrieve data from Batch Data API (search)",
          details: error.message,
        }),
      };
    }

    // If at least the requested number of comps are found, pull the data and break the loop
    if (responseData.results.meta.results.resultsFound >= requestedNumComps) {
      requestBody.options.take = requestedNumComps;
      try {
        fetchedActualData = await postRequest(
          context,
          endpointBatchData + "property/search",
          requestBody,
          {
            headers: {
              Accept: "application/json, application/xml",
              Authorization: "Bearer " + keyBatchData,
            },
          }
        );
      } catch (error) {
        context.log(
          `Batch Data API request (search) failed for request body: ${batchDataRequestBody}: `,
          error
        );
        return {
          status: 502,
          body: JSON.stringify({
            error: "Failed to retrieve data from Batch Data API (search)",
            details: error.message,
          }),
        };
      }

      requestedNumCompsFound = true;
    } else {
      requestBody.options.distanceMiles += 0.5;
    }
  }

  // If no property data returned from BatchData, return empty array
  if (
    !fetchedActualData ||
    responseData.results.meta.results.resultsFound > 0
  ) {
    requestBody.options.take = requestedNumComps;
    try {
      fetchedActualData = await postRequest(
        context,
        endpointBatchData + "property/search",
        requestBody,
        {
          headers: {
            Accept: "application/json, application/xml",
            Authorization: "Bearer " + keyBatchData,
          },
        }
      );
    } catch (error) {
      context.log(
        `Batch Data API request (search) failed for request body: ${batchDataRequestBody}: `,
        error
      );
      return {
        status: 502,
        body: JSON.stringify({
          error: "Failed to retrieve data from Batch Data API (search)",
          details: error.message,
        }),
      };
    }
  }

  //========================================================
  //      Save results to Cosmos DB
  //========================================================
  const cosmosEndpoint = process.env.COSMOSDB_ENDPOINT;
  const databaseName = process.env.DATABASE_NAME;

  if (!cosmosEndpoint || !databaseName) {
    context.log(
      `COSMOSDB_ENDPOINT ${cosmosEndpoint} or DATABASE_NAME ${databaseName} could not be retrieved from App Configuration.`
    );
  }

  const containerName = "comps";

  const credential = new DefaultAzureCredential();
  var client = new CosmosClient({
    endpoint: cosmosEndpoint,
    aadCredentials: credential,
  });

  const database = client.database(databaseName);
  const container = database.container(containerName);
  const lonSubject = batchDataPropertySubject?.address?.longitude;
  const latSubject = batchDataPropertySubject?.address?.latitude;

  await Promise.all(
    fetchedActualData.results.properties.map((resultItem) => {
      // container.items.create(itemDef)
      resultItem.id = uuid.v4(); // Generate a new UUID for the item
      resultItem.propertyRecordId = resultItem.id;
      resultItem.fipsCodePlusApn =
        resultItem?.ids?.fipsCode + "+" + resultItem?.ids?.apn;
      resultItem.dateRetrieved = new Date().toISOString();
      resultItem.subjectPropertyRecordId =
        batchDataPropertySubject.propertyRecordId;
      resultItem.distanceToSubejct = calculateDistance(
        latSubject,
        lonSubject,
        resultItem?.address?.latitude,
        resultItem?.address?.longitude,
        true
      );
      try {
        container.items.upsert(resultItem);
      } catch (error) {
        context.log(
          `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerName}. data: ${resultItem}  ${error.message}`
        );
        throw error;
      }
    })
  );

  return fetchedActualData;
};

const calculateDistance = (lat1, lon1, lat2, lon2, inMiles = false) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const R = 6371; // Radius of the Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  let distance = R * c; // Distance in kilometers

  if (inMiles) {
    distance *= 0.621371; // Convert kilometers to miles
  }

  return Number(distance.toFixed(2));
};

module.exports = {
  lookupBatchData,
  searchBatchData,
};
