const { app } = require("@azure/functions");
// const { CosmosClient, PatchOperation } = require("@azure/cosmos");
// const { DefaultAzureCredential } = require("@azure/identity");
// const { postRequest } = require("../utils/sendApiRequests.js");
const { lookupBatchData, searchBatchData } = require("../utils/batchDataApis");
// const uuid = require("uuid");

app.http("callBatchDataApi", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "callBatchDataApi/{action}",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    /*==============================
        Parse request body
      ==============================*/
    if (request.params.action === "") {
      const error_message = JSON.stringify({
        error: "Missing action in the request URL: batchDataApi/{action}",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

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
      if (request.params.action === "lookup" && !Array.isArray(requestBody)) {
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

    let responseData;

    if (request.params.action === "lookup") {
      var batchDataRequestBody = {
        requests: requestBody,
        options: {
          skip: 0,
          take: 1,
          images: true,
        },
      };

      responseData = await lookupBatchData(context, batchDataRequestBody);

    } else if (request.params.action === "search") {
      var batchDataRequestBody = {
        searchCriteria: requestBody.searchCriteria,
        options: {
          skip: 0,
          take: 30,
          useDistance: true,
          distanceMiles: 2.0,
          images: true,
        },
      };

      // If the request body contains options, merge them with the default options
      if (requestBody.options) {
        Object.keys(requestBody.options).forEach((key) => {
          if (batchDataRequestBody.options.hasOwnProperty(key)) {
            batchDataRequestBody.options[key] = requestBody.options[key];
          }
        });
      }

      responseData = await searchBatchData(context, batchDataRequestBody);
      
    }

    context.log(
      `Successfully pulled BatchData ("lookup") on ${responseData.results.properties.length} items`
    );

    return { body: JSON.stringify(responseData.results) };
  },
});
