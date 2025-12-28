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
const containerNameBatchData = "batchData";
const contiainerNameComps = "comps";

const credential = new DefaultAzureCredential();

// Create container connection for transactions
var client1 = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database1 = client1.database(databaseName);
const containerTransactions = database1.container(containerNameTransactions);

// Create container connection for orders
var client2 = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database2 = client2.database(databaseName);
const containerOrders = database2.container(containerNameOrders);

// Create container connection for batchData
var client3 = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database3 = client3.database(databaseName);
const containerBatchData = database3.container(containerNameBatchData);

// Create container connection for orders
var client4 = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database4 = client4.database(databaseName);
const containerComps = database2.container(contiainerNameComps);

app.http("getOrder", {
  methods: ["POST"],
  authLevel: "anonymous",
  // route: "createOrder",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    //==============================
    //    Run initial checks
    //==============================
    // Check if request body is present
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

    // Check if request body is a valid JSON
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

    // If propertyData == true, then it needs to provide orderId as well
    if (
      requestBody.hasOwnProperty("propertyData") &&
      requestBody.propertyData === true &&
      !requestBody.hasOwnProperty("orderId")
    ) {
      const error_message = JSON.stringify({
        error:
          "Field 'orderId' is required when 'propertyData' is set to true",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    } else if (
      requestBody.hasOwnProperty("propertyData") &&
      requestBody.propertyData === true &&
      typeof requestBody.orderId !== "number" &&
      !Array.isArray(requestBody.orderId)
    ) {
      const error_message = JSON.stringify({
        error: "Field 'orderId' must be a number or an array of numbers",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
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

    //============================================================================
    // Create array of requesteted orderIds
    // If orderId is not provided, return all orders for the requested clientIds
    //============================================================================

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
      )}) and f.productType not in ("Property Data")`;
    } else {
      query_string = `SELECT * FROM f where f.clientId IN (${requestedClientIds.join(
        ","
      )}) and f.orderId IN (${requestedOrderIds.join(",")}) and f.productType not in ("Property Data")`;
    }
    const querySpec = {
      query: query_string,
    };

    let orders;

    try {
      const { resources: output } = await containerOrders.items
        .query(querySpec)
        .fetchAll();
      console.log("Orders data successfully retrieved from Cosmos DB.");

      if (output) {
        orders = output; // Using spread operator to push individual items
      } else {
        context.log(`No orders found for requested clientId "${clientId}"`);
      }
    } catch (error) {
      context.log(`Error: failed to pull requestedOrders. ${error.message}`);
      throw error;
    }

    let finalMessage = `Successfully retrieved ${orders.length} orders for clientId ${requestBody.clientId}.`;
    context.log(finalMessage);

    //==============================================================================
    //   If propertyData is true, then retrieve property data and comps data
    //==============================================================================
    if (
      requestBody.hasOwnProperty("propertyData") &&
      requestBody.propertyData === true
    ) {
      for (const order of orders) {
        // Retrieve subject property data
        if (order.propertyRecordId) {
          let query_string_subject = `SELECT * FROM c WHERE c.propertyRecordId = "${order.propertyRecordId}"`;

          const querySpecSubject = {
            query: query_string_subject,
          };

          let propertyData;

          try {
            const { resources: output } = await containerBatchData.items
              .query(querySpecSubject)
              .fetchAll();
            console.log("Property data (batchData) successfully retrieved.");

            if (output) {
              propertyData = output; // Using spread operator to push individual items
              order.propertyData = propertyData; // Assuming you want the first item
            } else {
              context.log(
                `No property data found for requested orderId "${order.orderId}"`
              );
            }
          } catch (error) {
            context.log(
              `Error: failed to pull property data for orderId "${order.orderId}". ${error.message}`
            );
            throw error;
          }

          context.log(`Processing property data for orderId: ${order.orderId}`);
        } else {
          return {
            status: 400,
            body: `Property data for orderId ${order.orderId} is not available. You need to request property data first.`,
          };
        }

        // Retrieve comps data
        if (order.compsRecordIds && order.compsRecordIds.length > 0) {
          let query_string_comps = ""; //`SELECT * FROM c WHERE c.propertyRecordId = "${order.propertyRecordId}"`;

          query_string_comps = `SELECT * FROM f where f.propertyRecordId IN ('${order.compsRecordIds.join(
            "','"
          )}')`;

          const querySpecComps = {
            query: query_string_comps,
          };

          let compsData;

          try {
            const { resources: output } = await containerComps.items
              .query(querySpecComps)
              .fetchAll();
            console.log("Comps data successfully retrieved.");

            if (output) {
              compsData = output; // Using spread operator to push individual items
              order.compsData = compsData; // Assuming you want the first item
            } else {
              context.log(
                `No comps data found for requested orderId "${order.orderId}"`
              );
            }
          } catch (error) {
            context.log(
              `Error: failed to pull comps data for orderId "${order.orderId}". ${error.message}`
            );
            throw error;
          }

          context.log(`Processing comps data for orderId: ${order.orderId}`);
        } else {
          // return {
          //   status: 400,
          //   body: `Comps data for orderId ${order.orderId} is not available. You need to request comps data first.`,
          // };
          order.compsData = [];
          context.log(
            `Comps data for orderId ${order.orderId} is not available.`
          );
        }
      }
    }

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
