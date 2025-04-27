const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

app.http("queryStoredBatchData", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    /*=========================================================
        Parse request body
      ========================================================*/
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

    /*=========================================================
        Query Cosmos DB
      ========================================================*/
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

    let retrievedData = [];

    await Promise.all(
      requestBody.map(async (id) => {
        let query_string = `SELECT * FROM f where f.id = "${id}"`;
        const querySpec = {
          query: query_string,
        };

        try {
          const { resources: results } = await container.items
            .query(querySpec)
            .fetchAll();

          if (results) {
            retrievedData.push(...results); // Using spread operator to push individual items
          } else {
            context.log(`No results found for requested id "${id}"`);
          }
        } catch (error) {
          context.log(
            `Error querying Cosmos DB database: ${databaseName}. container: ${containerName}. ${error.message}`
          );
          throw error;
        }
      })
    );

    context.log(`Retrieved data: ${JSON.stringify(retrievedData)}`);

    return { body: JSON.stringify(retrievedData) };
  },
});
