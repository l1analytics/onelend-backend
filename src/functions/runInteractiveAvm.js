const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { selectComps, computeValueEstimate } = require("../utils/selectComps");
const uuid = require("uuid");

/*==================================================
        Set up connection to Cosmos DB
  ==================================================*/
const cosmosEndpoint = process.env.COSMOSDB_ENDPOINT;
const databaseName = process.env.DATABASE_NAME;

if (!cosmosEndpoint || !databaseName) {
  console.log(
    `COSMOSDB_ENDPOINT ${cosmosEndpoint} or DATABASE_NAME ${databaseName} could not be retrieved from App Configuration.`
  );
}
const containerNameReporting = "reporting";

const credential = new DefaultAzureCredential();
var client = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database = client.database(databaseName);
const containerReporting = database.container(containerNameReporting);

app.http("runInteractiveAvm", {
  methods: ["POST"],
  authLevel: "anonymous",
  // route: "createOrder",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

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
          error: "Request body must be a JSON",
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

    /*===========================================================
        Get report data from request body
      ===========================================================*/
    const reportingData = requestBody;
    const selectedCompsIds = JSON.parse(JSON.stringify(reportingData.valuationEstimate.selectedCompsIds));
    reportingData.valuationEstimate = computeValueEstimate(reportingData);
    reportingData.valuationEstimate.selectedCompsIds = selectedCompsIds;
    reportingData.valuationEstimate.createdBy = "";

    //===========================================================
    //  Upsert report data to CosmosDB
    //===========================================================
    let returnMessage;
    try {
      await containerReporting.items.upsert(reportingData);
      returnMessage = `Report data upserted successfully for reportRecordId: ${reportingData.reportRecordId}.`;
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameReporting}. data: ${reportingData}  ${error.message}`
      );
      throw error;
    }

    return {
      status: 200,
      headers: {
      'Content-Type': 'application/json'
      },
      body: JSON.stringify(reportingData)
    };
  },
});
