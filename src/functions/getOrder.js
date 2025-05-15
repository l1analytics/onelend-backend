const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { postRequest } = require("../utils/sendApiRequests.js");
const { getMaxId } = require("../utils/getIds.js");
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

app.http("getOrder", {
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
    //  Get transactions
    //===========================

    // Check if clientId is sent over
    const requiredFields = ["clientId"];

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

    //========================================
    // Create array of requesteted clientIds
    //========================================

    let requestedClientIds = []; // Optional field

    // Check if orderId is a single number or an array
    if (typeof requestBody.clientId === "number") {
      // Handle the case where transactionId is a string
      requestedClientIds.push(requestBody.clientId);
    } else if (Array.isArray(requestBody.clientId)) {
      // Handle the case where orderId is an array
      // Validate that each value in the orderId array is a number
      if (!requestBody.clientId.every((id) => typeof id === "number")) {
        const error_message = JSON.stringify({
          error: "All elements in 'clientId' array must be numbers",
        });
        context.log(error_message);
        return {
          status: 400,
          body: error_message,
        };
      } else {
        requestedClientIds = requestBody.clientId;
      }
    } else {
      const error_message = JSON.stringify({
        error: "Field 'clientId' must be a number or an array of numbers",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    //========================================
    // Create array of requesteted orderIds
    //========================================
    let requestedOrderIds = []; // Optional field

    // Check if orderId is a single number or an array
    if (!requestBody.hasOwnProperty("orderId")) {
      requestedOrderIds = [];
    } else if (typeof requestBody.orderId === "number") {
      // Handle the case where transactionId is a string
      requestedOrderIds.push(requestBody.orderId);
    } else if (Array.isArray(requestBody.orderId)) {
      // Handle the case where orderId is an array
      // Validate that each value in the orderId array is a number
      if (!requestBody.orderId.every((id) => typeof id === "number")) {
        const error_message = JSON.stringify({
          error: "All elements in 'orderId' array must be numbers",
        });
        context.log(error_message);
        return {
          status: 400,
          body: error_message,
        };
      } else {
        requestedOrderIds = requestBody.orderId;
      }
    } else {
      const error_message = JSON.stringify({
        error: "Field 'orderId' must be a number or an array of numbers",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    //========================================================
    //   Read from Cosmos DB
    //========================================================

    // Transaction record
    let query_string;

    if (requestedOrderIds.length === 0) {
      query_string = `SELECT * FROM f where f.clientId IN (${requestedClientIds.join(
        ","
      )})`;
    } else {
      query_string = `SELECT * FROM f where f.clientId IN (${requestedClientIds.join(
        ","
      )}) and f.orderId IN (${requestedOrderIds.join(",")})`;
    }
    const querySpec = {
      query: query_string,
    };

    let orders;

    try {
      const { resources: output } = await containerOrders.items
        .query(querySpec)
        .fetchAll();
      console.log(output);

      if (output) {
        orders = output; // Using spread operator to push individual items
      } else {
        context.log(`No orders found for requested clientId "${clientId}"`);
      }
    } catch (error) {
      context.log(`Error: failed to pull requestedOrders. ${error.message}`);
      throw error;
    }

    const finalMessage = `Successfully retrieved ${orders.length} orders for clientId ${requestBody.clientId}`;
    context.log(finalMessage);

    responseMessage = {
      message: finalMessage,
      clientId: requestBody.clientId,
      dateCreated: new Date().toISOString(),
    };

    return {
      body: JSON.stringify(orders),
      message: JSON.stringify(responseMessage),
    };
  },
});
