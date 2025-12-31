const { app } = require("@azure/functions");
// const { CosmosClient, PatchOperation } = require("@azure/cosmos");
// const { DefaultAzureCredential } = require("@azure/identity");
// const { postRequest } = require("../utils/sendApiRequests.js");
const { lookupBatchData } = require("../utils/batchDataApis");
// const uuid = require("uuid");

app.http("lookupBatchDataApi", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    /*==============================
        Parse request body
      ==============================*/
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
      if (!Array.isArray(requestBody)) {
        const error_message = JSON.stringify({
          error: "Request body must be an array",
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

    /*==================================
        Send request to Batch Data API
      ==================================*/
    /*
    const endpointBatchData = process.env.BATCHDATA_ENDPOINT;
    const keyBatchData = process.env.BATCHDATA_KEY;

    if (!endpointBatchData || !keyBatchData) {
      context.log(
        `Required Batch Data API configuration values are missing: endpoint ${endpointBatchData}, key ${keyBatchData}`
      );
    }
    */
    let responseData;

    var batchDataRequestBody = {
      requests: requestBody,
      options: {
        skip: 0,
        take: 1,
        images: true,
      },
    };

    responseData = await lookupBatchData(
      context,
      batchDataRequestBody
    );

    /*=========================================================
        Save results to Cosmos DB
      ========================================================*/
      /*
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
        resultItem.fipsCodePlusApn =
          resultItem?.ids?.fipsCode + "+" + resultItem?.ids?.apn;
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
  */
    context.log(
      `Successfully pulled BatchData ("lookup") on ${responseData.results.properties.length} items`
    );

    return { body: JSON.stringify(responseData.results) };
  },
});
