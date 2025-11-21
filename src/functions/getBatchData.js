/*==============================================================================
   getBatchData API:
   Get BatchData for subject property and comps
   Built to speed up BatchData order and sent back resutls to ALFRed quickly
   Saves order, BatchData, and comps to Cosmos DB (not transaction)
  ==============================================================================*/

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
const keyBatchData = "bAvjToxKsdPSjltgFTjw0uVf92Rjr3KPdwOBMfuE"; //process.env.KEY_BATCH_DATA;

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

app.http("getBatchData", {
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

    context.log(`@@@@@@ Create Order @@@@@@`);

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

    context.log(`@@@@@@ getMaxId @@@@@@`);
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
    newOrder.clientId = requestBody.clientId || null; // Optional field
    newOrder.transactionId = requestBody.transactionId || null; // Optional field
    newOrder.clientOrderId = requestBody.clientOrderId || null; // Optional field
    newOrder.streetAddress = requestBody.streetAddress;
    newOrder.city = requestBody.city;
    newOrder.state = requestBody.state;
    newOrder.zip = requestBody.zip;
    newOrder.productType = requestBody.productType || null;
    newOrder.dateCreated = new Date().toISOString();
    newOrder.status =
      requestBody.productType == "Property Data" ? "Ordered" : "Pending";
    newOrder.fipsCodePlusApn = null;
    newOrder.propertyRecordId;
    newOrder.propertyRecordDate;
    newOrder.compsRecordIds = [];

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

    context.log(`@@@@@@ lookupBatchData @@@@@@`);
    const responseBatchDataSubject = await lookupBatchData(
      context,
      batchDataRequestBody
    );

    // If there is no property data returned from BatchData, return the message
    if (responseBatchDataSubject.results.properties.length == 0) {
      responseBody = {
        message: `No subject property data returned from BatchData`,
        clientId: newOrder.clientId,
        orderId: newOrder.orderId,
        productType: newOrder.productType,
        status: newOrder.status,
        clientOrderId: newOrder.clientOrderId,
        streetAddress: newOrder.streetAddress,
        city: newOrder.city,
        state: newOrder.state,
        zip: newOrder.zip,
        dateCreated: newOrder.dateCreated,
        propertyData: [],
        compsDataSold:[],
        compsDataActive: [],
      };

      return { body: JSON.stringify(responseBody) };
    }

    newOrder.propertyRecordId =
      responseBatchDataSubject.results.properties[0].propertyRecordId;
    newOrder.fipsCodePlusApn =
      responseBatchDataSubject.results.properties[0].fipsCodePlusApn;
    newOrder.propertyRecordDate =
      responseBatchDataSubject.results.properties[0].dateRetrieved;

    // *********************************
    //  Comps property data (search) 
    // *********************************
    const today = new Date();
    const lastYear = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
    const compStartDate = lastYear.toISOString().split("T")[0];
    const maxDaysOnMarket = 365; // Maximum days on market for active comps

    // Purse comps options in request body
    // Default number of comps is 20.
    // Default compType is "Both" (ie, both Sold and Active comps). 20 Sold comps and 20 Active comps
    let numComps = 5;
    let compType = "Sold";
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
    if (compType === "Active" || compType === "Both") {
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

    //========================================================
    //        Save results to Cosmos DB
    //========================================================

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
      clientId: newOrder.clientId,
      orderId: newOrder.orderId,
      productType: newOrder.productType,
      status: newOrder.status,
      clientOrderId: newOrder.clientOrderId,
      streetAddress: newOrder.streetAddress,
      city: newOrder.city,
      state: newOrder.state,
      zip: newOrder.zip,
      dateCreated: newOrder.dateCreated,
      propertyData: responseBatchDataSubject.results.properties,
      compsDataSold:
        typeof responseBatchDataSoldComps == "object"
          ? responseBatchDataSoldComps.results.properties
          : [],
      compsDataActive:
        typeof responseBatchDataActiveComps == "object"
          ? responseBatchDataActiveComps.results.properties
          : [],
    };

    return { body: JSON.stringify(responseBody) };
  },
});
