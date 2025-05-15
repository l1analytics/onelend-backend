const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { postRequest } = require("../utils/sendApiRequests.js");
const { getMaxId } = require("../utils/getIds.js");
const { lookupBatchData } = require("../utils/batchDataApis");
// const { ordersCreate } = require("./ordersUtils/ordersCreate.js");
const uuid = require("uuid");

/*==================================================
        Set up connection to Cosmos DB
  ==================================================*/

const cosmosEndpoint = process.env.COSMOSDB_ENDPOINT;
const databaseName = process.env.DATABASE_NAME;

if (!cosmosEndpoint || !databaseName) {
  context.log(
    `COSMOSDB_ENDPOINT ${cosmosEndpoint} or DATABASE_NAME ${databaseName} could not be retrieved from App Configuration.`
  );
}

const containerNameTransactions = "transactions";
const containerNameOrders = "orders";

const credential = new DefaultAzureCredential();
var client1 = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database1 = client1.database(databaseName);
const containerTransactions = database1.container(containerNameTransactions);

var client2 = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database2 = client2.database(databaseName);
const containerOrders = database2.container(containerNameOrders);

const containers = {
  transactions: containerTransactions,
  orders: containerOrders,
};

app.http("createTransaction", {
  methods: ["POST"],
  authLevel: "anonymous",
  // route: "createOrder",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    //==============================
    //    Parse request body
    //==============================
    // if (request.params.action === "") {
    //   const error_message = JSON.stringify({
    //     error: "Need action in the request URL",
    //   });
    //   context.log(error_message);
    //   return {
    //     status: 400,
    //     body: error_message,
    //   };
    // }

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

    //===========================
    //  Action: "create"
    //===========================

    const maxTransactionId = await getMaxId(
      context,
      requestBody.clientId,
      containerTransactions,
      "transactionId"
    );

    // Check if required address fields are sent over
    const requiredFields = [
      "clientId",
      "streetAddress",
      "city",
      "state",
      "zip",
    ];

    for (const field of requiredFields) {
      if (!requestBody[field] || requestBody[field].toString().trim() === "") {
        const error_message = JSON.stringify({
          error: `Field '${field}' is required and cannot be blank`,
        });
        context.log(error_message);
        return {
          status: 400,
          body: error_message,
        };
      }
    }

    // If a transaction ID is not submitted, create a new transaction record:
    let transactionRecord = {};

    // Create a new transaction and save it to Cosmos DB
    transactionRecord.id = uuid.v4();
    transactionRecord.transactionId =
      typeof maxTransactionId === "undefined" ? 1 : maxTransactionId + 1; // Generate a new transaction ID
    transactionRecord.clientId = requestBody.clientId || null; // Optional field
    transactionRecord.clientOrderId = requestBody.clientOrderId || null; // Optional field
    transactionRecord.streetAddress = requestBody.streetAddress;
    transactionRecord.city = requestBody.city;
    transactionRecord.state = requestBody.state;
    transactionRecord.zip = requestBody.zipCode;
    transactionRecord.dateCreated = new Date().toISOString();
    transactionRecord.orderId = [];
    transactionRecord.productType = [];
    transactionRecord.propertyRecordId;
    transactionRecord.fipsCodePlusApn;

    // Pull Batch Data for subject property
    /*
    const endpointBatchData = process.env.ENDPOINT_BATCH_DATA;
    const keyBatchData = process.env.KEY_BATCH_DATA;

    if (!endpointBatchData || !keyBatchData) {
      context.log(
        `ENDPOINT_BATCH_DATA ${endpointBatchData} or KEY_BATCH_DATA ${keyBatchData} could not be retrieved from App Configuration.`
      );
    }

    const batchDataRequestBody = {
      requests: [
        {
          address: {
            street: requestBody.streetAddress,
            city: requestBody.city,
            state: requestBody.state,
            zip: requestBody.zip,
          },
        },
      ],
      options: {
        skip: 0,
        take: 1,
        images: true,
      },
    };

    responseBatchData = await lookupBatchData(context, batchDataRequestBody);

    transactionRecord.propertyRecordId =
      responseBatchData.results.properties[0].propertyRecordId;
    transactionRecord.fipsCodePlusApn =
      responseBatchData.results.properties[0].fipsCodePlusApn;
*/
    //========================================================
    //        Save results to Cosmos DB
    //========================================================

    // Transaction record
    try {
      await containerTransactions.items.upsert(transactionRecord);
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameTransactions}. data: ${transactionRecord}  ${error.message}`
      );
      throw error;
    }

    context.log(
      `Successfully created a new trasaction with id ${transactionRecord.transactionId}`
    );

    responseBody = {
      message: `Ordered successfully created OrderId ${"newOrder.orderId"}`,
      clientId: transactionRecord.clientId,
      transactionId: transactionRecord.transactionId,
      streetAddress: transactionRecord.streetAddress,
      city: transactionRecord.city,
      state: transactionRecord.state,
      zipCode: transactionRecord.zipCode,
      dateCreated: transactionRecord.dateCreated,
    };

    return { body: JSON.stringify(responseBody) };
  },
});
