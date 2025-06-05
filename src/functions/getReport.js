const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

// const { ordersCreate } = require("./ordersUtils/ordersCreate.js");
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

app.http("getReport", {
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

    //===========================================================
    //  Retrieve subject property and comps data for the order
    //===========================================================
    // Subject property data
    let query_string;

    query_string = `SELECT * FROM f where f.id = '${requestBody.reportRecordId}'`;

    const querySpec = {
      query: query_string,
    };

    let reportData;

    try {
      const { resources: output } = await containerReporting.items
        .query(querySpec)
        .fetchAll();
      console.log("Report data successfully retrieved from Cosmos DB.");

      if (output) {
        reportData = output[0]; // Using spread operator to push individual items
      } else {
        context.log(
          `No report data found for requested reportRecordId "${requestBody.reportRecordId}"`
        );
      }
    } catch (error) {
      context.log(
        `Error: failed to pull requested report data. ${error.message}`
      );
      throw error;
    }

    return { body: JSON.stringify(reportData) };
  },
});
