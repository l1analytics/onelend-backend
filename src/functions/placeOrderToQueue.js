const { app, output } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

const queueOutput = output.storageQueue({
  queueName: "valuationorderqueue",
  connection: "AZURE_STORAGE_CONNECTION_STRING", // Name of the app setting
});

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

const containerNameOrders = "orders";

const credential = new DefaultAzureCredential();
var client = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database = client.database(databaseName);
const containerOrders = database.container(containerNameOrders);

app.http("placeOrderToQueue", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  extraOutputs: [queueOutput], // Register the output binding
  // Inside the handler function for either Storage Queue or Service Bus
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    let returnMessage = "";

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

    // Extract data from the request
    const message = `${JSON.stringify(requestBody)}`;

    // Place the message on the queue using the binding reference
    context.extraOutputs.set(queueOutput, message); // Use 'queueOutput' or 'serviceBusOutput' variable

    // Update status to "Processing"
    requestBody.status = "Processing";

    // Upsert the updated order back to CosmosDB
    try {
      await containerOrders.items.upsert(requestBody);
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameOrders}. data: ${requestBody}  ${error.message}`
      );
      throw error;
    }

    // Return an HTTP response
    return {
      body: `Created queue item for orderRecordId: ${requestBody.orderRecordId}`,
    };
  },
});
