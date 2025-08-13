const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { postRequest } = require("../utils/sendApiRequests.js");
const { getMaxId } = require("../utils/getIds.js");
const { lookupBatchData, searchBatchData } = require("../utils/batchDataApis");
// const { ordersCreate } = require("./ordersUtils/ordersCreate.js");
const uuid = require("uuid");

/*==================================================
        Set up connection to Cosmos DB
  ==================================================*/
const endpointBatchData = process.env.ENDPOINT_BATCH_DATA;
const keyBatchData = process.env.KEY_BATCH_DATA;

if (!endpointBatchData || !keyBatchData) {
  console.log(
    `ENDPOINT_BATCH_DATA ${endpointBatchData} or KEY_BATCH_DATA ${keyBatchData} could not be retrieved from App Configuration.`
  );
}

const cosmosEndpoint = process.env.COSMOSDB_ENDPOINT;
const databaseName = process.env.DATABASE_NAME;

if (!cosmosEndpoint || !databaseName) {
  console.log(
    `COSMOSDB_ENDPOINT ${cosmosEndpoint} or DATABASE_NAME ${databaseName} could not be retrieved from App Configuration.`
  );
}

const containerNameTransactions = "transactions";
const containerNameOrders = "orders";
const containerNameReporting = "reporting";

const credential = new DefaultAzureCredential();
var client = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database = client.database(databaseName);
const containerTransactions = database.container(containerNameTransactions);
const containerOrders = database.container(containerNameOrders);
const containerReporting = database.container(containerNameReporting);

app.http("createOrder", {
  methods: ["POST"],
  authLevel: "anonymous",
  // route: "createOrder",
  handler: async (request, context) => {
    context.log(`Http function processed request for url "${request.url}"`);

    //==============================
    //    Parse request body
    //==============================
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
    //  Create Order
    //===========================

    // If a transaction ID is not submitted, create a new transaction record:
    let transactionRecord = {};

    if (
      !requestBody.transactionId ||
      requestBody.transactionId.toString().trim() === ""
    ) {
      // Check if required fields are sent over
      const requiredFields = [
        "clientId",
        "streetAddress",
        "city",
        "state",
        "zip",
        "productType",
      ];

      for (const field of requiredFields) {
        if (
          !requestBody[field] ||
          requestBody[field].toString().trim() === ""
        ) {
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

      // Get the max transactionId for this clientId
      const maxTransactionId = await getMaxId(
        context,
        requestBody.clientId,
        containerTransactions,
        "transactionId"
      );

      // Create a new transaction and save it to Cosmos DB
      transactionRecord.id = uuid.v4();
      transactionRecord.transactionId =
        typeof maxTransactionId === "undefined" ? 1 : maxTransactionId + 1; // Generate a new transaction ID
      transactionRecord.clientId = requestBody.clientId || null; // Optional field
      transactionRecord.clientOrderId = requestBody.clientOrderId || null; // Optional field
      transactionRecord.streetAddress = requestBody.streetAddress;
      transactionRecord.city = requestBody.city;
      transactionRecord.state = requestBody.state;
      transactionRecord.zip = requestBody.zip;
      transactionRecord.dateCreated = new Date().toISOString();
      transactionRecord.orderId = [];
      transactionRecord.productType = [];
    } else {
      const requiredFields = ["clientId", "productType"];

      for (const field of requiredFields) {
        if (
          !requestBody[field] ||
          requestBody[field].toString().trim() === ""
        ) {
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

      // If transactionId is submitted, pull the transaction record from Cosmos DB
      let query_string = `SELECT * FROM f where f.clientId = ${requestBody.clientId} and f.transactionId = ${requestBody.transactionId}`;
      const querySpec = {
        query: query_string,
      };

      try {
        const { resources: results } = await containerTransactions.items
          .query(querySpec)
          .fetchAll();

        if (results) {
          transactionRecord = results[0];
          if (results.length > 1) {
            context.log(
              `Warning: Multiple records found for clientId ${requestBody.clientId} and transactionId "${requestBody.transactionId}". Using the first one.`
            );
          }
        } else {
          context.log(
            `No results found for requested clientId ${requestBody.clientId} and transactionId "${requestBody.transactionId}"`
          );
        }
      } catch (error) {
        context.log(
          `Error querying Cosmos DB database: ${databaseName}. container: ${containerTransactions}. ${error.message}`
        );
        throw error;
      }
    }

    // Get the max orderId for this clientId
    const maxOrderId = await getMaxId(
      context,
      requestBody.clientId,
      containerOrders,
      "orderId"
    );

    // If the request contains a productType, create an order record
    const newOrder = {};
    // if (requestBody.productType && requestBody.productType.trim() != "") {
    newOrder.id = uuid.v4();
    newOrder.orderRecordId = newOrder.id;
    newOrder.orderId = typeof maxOrderId === "undefined" ? 1 : maxOrderId + 1; // Generate a new UUID for the order ID
    newOrder.clientId = transactionRecord.clientId; // Optional field
    newOrder.transactionId = transactionRecord.transactionId; // Optional field
    newOrder.clientOrderId = transactionRecord.clientOrderId || null; // Optional field
    newOrder.streetAddress = transactionRecord.streetAddress;
    newOrder.city = transactionRecord.city;
    newOrder.state = transactionRecord.state;
    newOrder.zip = transactionRecord.zip;
    newOrder.productType = requestBody.productType || null;
    newOrder.dateCreated = new Date().toISOString();
    newOrder.status =
      requestBody.productType == "Property Data" ? "Ordered" : "Pending";
    newOrder.fipsCodePlusApn = null;
    newOrder.propertyRecordId;
    newOrder.propertyRecordDate;
    newOrder.compsRecordIds = [];

    // Add this order to the transaction record
    transactionRecord.orderId.push(newOrder.orderId);
    transactionRecord.productType.push(newOrder.productType);
    // }

    //=================================================================================
    // Pull BatchData for subejct (lookup) and comps (search)
    // Note: Always pull BatchData for subject property when a new order is created,
    //       regardless of productType
    //=================================================================================
    // *********************************
    // Subject property data (lookup)
    // *********************************
    const batchDataRequestBody = {
      requests: [
        {
          address: {
            street: newOrder.streetAddress,
            city: newOrder.city,
            state: newOrder.state,
            zip: newOrder.zip,
          },
        },
      ],
      options: {
        skip: 0,
        take: 1,
        images: true,
      },
    };

    const responseBatchDataSubject = await lookupBatchData(
      context,
      batchDataRequestBody
    );
    newOrder.propertyRecordId =
      responseBatchDataSubject.results.properties[0].propertyRecordId;
    newOrder.fipsCodePlusApn =
      responseBatchDataSubject.results.properties[0].fipsCodePlusApn;
    newOrder.propertyRecordDate =
      responseBatchDataSubject.results.properties[0].dateRetrieved;

    transactionRecord.fipsCodePlusApn =
      responseBatchDataSubject.results.properties[0].fipsCodePlusApn;

    // *********************************
    //  Comps property data (search)
    // *********************************
    const today = new Date();
    const lastYear = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
    const compStartDate = lastYear.toISOString().split("T")[0];
    const maxDaysOnMarket = 730; // Maximum days on market for active comps

    // Purse comps options in request body
    // Default number of comps is 20.
    // Default compType is "Both" (ie, both Sold and List comps). 20 Sold comps and 20 List comps
    let numComps = 20;
    let compType = "Both";
    if (requestBody.compsOptions && requestBody.compsOptions.numComps) {
      numComps = requestBody.compsOptions.numComps;
    }

    if (requestBody.compsOptions && requestBody.compsOptions.compType) {
      compType = requestBody.compsOptions.compType;
    }

    let batchDataRequestBodyComps = {
      searchCriteria: {
        query: "",
        compAddress: batchDataRequestBody.requests[0].address,
        general: {
          propertyTypeCategory: {
            contains:
              responseBatchDataSubject.results.properties[0].general
                .propertyTypeCategory,
          },
          propertyTypeDetail: {
            contains:
              responseBatchDataSubject.results.properties[0].general
                .propertyTypeDetail,
          },
        },
        listing: {
          status: { inList: ["Sold"] },
          soldDate: { minDate: compStartDate },
        },
      },
      options: {
        skip: 0,
        take: numComps,
        useDistance: true,
        distanceMiles: 3.0,
        images: true,
      },
    };

    // Pull sold comps
    let responseBatchDataSoldComps;
    if (compType === "Sold" || compType === "Both") {
      responseBatchDataSoldComps = await searchBatchData(
        context,
        batchDataRequestBodyComps,
        responseBatchDataSubject.results.properties[0]
      );
      // Add the propertyRecordId to compsRecordIds for the order record
      for (
        let i = 0;
        i < responseBatchDataSoldComps.results.properties.length;
        i++
      ) {
        newOrder.compsRecordIds.push(
          responseBatchDataSoldComps.results.properties[i].propertyRecordId
        );
      }
    }

    // Pull active comps
    let responseBatchDataActiveComps;
    if (compType === "List" || compType === "Both") {
      batchDataRequestBodyComps.searchCriteria.listing = {
        listing: {
          status: { inList: ["Active", "Pending"] },
          daysOnMarket: { max: maxDaysOnMarket },
        },
      };
      responseBatchDataActiveComps = await searchBatchData(
        context,
        batchDataRequestBodyComps,
        responseBatchDataSubject.results.properties[0]
      );

      for (
        let i = 0;
        i < responseBatchDataActiveComps.results.properties.length;
        i++
      ) {
        newOrder.compsRecordIds.push(
          responseBatchDataActiveComps.results.properties[i].propertyRecordId
        );
      }
    }

    /*=========================================================
        Create a report record for order
    =========================================================*/
    if (requestBody.productType != "Property Data") {
      var reportRecord = JSON.parse(JSON.stringify(newOrder));
      reportRecord.id = uuid.v4();
      reportRecord.reportRecordId = reportRecord.id;
      delete reportRecord.status;
      reportRecord.propertyData =
        responseBatchDataSubject.results.properties[0];
      reportRecord.compsData = [
        ...(responseBatchDataSoldComps?.results?.properties || []),
        ...(responseBatchDataActiveComps?.results?.properties || []),
      ];

      // Save the report record to Cosmos DB
      try {
        await containerReporting.items.upsert(reportRecord);
      } catch (error) {
        context.log(
          `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameReporting}. data: ${reportRecord}  ${error.message}`
        );
        throw error;
      }

      // Add the reportRecordId to the order record
      newOrder.reportRecordId = reportRecord.reportRecordId;
    }

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

    // Order record
    try {
      await containerOrders.items.upsert(newOrder);
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameOrders}. data: ${newOrder}  ${error.message}`
      );
      throw error;
    }

    context.log(`Successfully created a new order with id ${newOrder.orderId}`);

    responseBody = {
      message: `Ordered successfully created OrderId ${"newOrder.orderId"}`,
      clientId: transactionRecord.clientId,
      transactionId: transactionRecord.transactionId,
      orderId: newOrder.orderId,
      productType: newOrder.productType,
      status: newOrder.status,
      clientOrderId: newOrder.clientOrderId,
      streetAddress: newOrder.streetAddress,
      city: newOrder.city,
      state: newOrder.state,
      zip: newOrder.zip,
      dateCreated: newOrder.dateCreated,
      numSoldComps:
        typeof responseBatchDataSoldComps == "object"
          ? responseBatchDataSoldComps.results.properties.length
          : 0,
      numActiveComps:
        typeof responseBatchDataActiveComps == "object"
          ? responseBatchDataActiveComps.results.properties.length
          : 0,
    };

    return { body: JSON.stringify(responseBody) };
  },
});
