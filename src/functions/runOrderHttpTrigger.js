const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { postRequest } = require("../utils/sendApiRequests.js");
const { getMaxId } = require("../utils/getIds.js");
const { lookupBatchData, searchBatchData } = require("../utils/batchDataApis");
const {
  fillCompAnalysis,
  fillReportData,
} = require("../utils/fillReport/fillReportData");
const { selectComps, computeValueEstimate } = require("../utils/selectComps");
// const { ordersCreate } = require("./ordersUtils/ordersCreate.js");
const uuid = require("uuid");
const { BlobServiceClient } = require("@azure/storage-blob");

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

const containerNameBatchData = "batchData";
const containerNameComps = "comps";
const containerNameReporting = "reporting";
const containerNameOrders = "orders";

const credential = new DefaultAzureCredential();
var client = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database = client.database(databaseName);
const containerBatchData = database.container(containerNameBatchData);
const containerComps = database.container(containerNameComps);
const containerReporting = database.container(containerNameReporting);
const containerOrders = database.container(containerNameOrders);

app.http("runOrder", {
  methods: ["POST"],
  authLevel: "anonymous",
  // route: "createOrder",
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

    //===========================================================
    //  Retrieve subject property and comps data for the order
    //===========================================================
    // Subject property data
    let query_string_subejct;

    query_string_subejct = `SELECT * FROM f where f.id = '${requestBody.propertyRecordId}'`;

    const querySpec = {
      query: query_string_subejct,
    };

    let subjectPropertyData;

    try {
      const { resources: output } = await containerBatchData.items
        .query(querySpec)
        .fetchAll();
      console.log(
        "Subject property data successfully retrieved from Cosmos DB."
      );

      if (output) {
        subjectPropertyData = output; // Using spread operator to push individual items
      } else {
        context.log(
          `No property data found for requested propertyRecordId "${requestBody.propertyRecordId}"`
        );
      }
    } catch (error) {
      context.log(
        `Error: failed to pull requested property data from Cosmos DB. ${error.message}`
      );
      throw error;
    }

    // Comps data
    let query_string_comps;

    if (requestBody.compsRecordIds.length === 0) {
      // return {
      //   status: 500,
      //   body: `No comps (compsRecordIds) found for this order: clientId: ${requestBody.clientId} orderId: ${requestBody.orderId}.`,
      // };
      returnMessage += "No comps (compsRecordIds) found for this order. ";
      context.log(returnMessage);
    } else {
      query_string_comps = `SELECT * FROM f where f.id IN ('${requestBody.compsRecordIds.join(
        "','"
      )}')`;
    }

    let compsData = [];

    // Pull comps data from Cosmos DB only if requestBody.compsRecordIds.length > 0
    if (requestBody.compsRecordIds.length > 0) {
      const querySpecComps = {
        query: query_string_comps,
      };

      try {
        const { resources: output } = await containerComps.items
          .query(querySpecComps)
          .fetchAll();
        console.log("Comps data successfully retrieved from Cosmos DB.");

        if (output) {
          compsData = output; // Using spread operator to push individual items
        } else {
          context.log(
            `No comps data found for requested clientId: ${requestBody.clientId} orderId: ${requestBody.orderId}`
          );
        }
      } catch (error) {
        context.log(
          `Error: failed to pull requested comps data. ${error.message}`
        );
        throw error;
      }
    }

    console.log(`Number of Subject Prop Data: ${subjectPropertyData.length}`);
    console.log(`Number of Comps Data: ${compsData.length}`);

    //===========================================================
    //  Run comp selection model
    //===========================================================
    let selectedComps = {};

    if (requestBody.compsRecordIds.length > 0) {
      const salesTypes = ["sold", "list"];
      selectedComps = await selectComps(
        subjectPropertyData[0],
        compsData,
        salesTypes,
        3
      );
    }

    //===========================================================
    //  Update report with selected comps in Cosmos DB
    //===========================================================

    let query_string;

    query_string = `SELECT * FROM f where f.id = '${requestBody.reportRecordId}'`;

    const querySpecReport = {
      query: query_string,
    };

    let reporting;

    // Fetch reporting data from Cosmos DB (which is intially created by createOrder API)
    try {
      const { resources: output } = await containerReporting.items
        .query(querySpecReport)
        .fetchAll();
      console.log("Report data successfully retrieved from Cosmos DB.");
      if (typeof output !== "undefined" && output.length > 0) {
        reporting = output[0]; // Using spread operator to push individual items
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

    // Add valuationEstimate to reporting data
    // reporting.valuationEstimate = selectedComps.finalvaluation;

    // Add selectedCompFlag to reporting.compsData
    let selectedCompsIds = {};

    if (
      reporting.compsData &&
      reporting.compsData.length > 0 &&
      Array.isArray(reporting.compsData)
    ) {
      ["sold", "list"].forEach((type) => {
        if (selectedComps[type] && Array.isArray(selectedComps[type])) {
          selectedCompsIds[type] = [];

          selectedComps[type].forEach((comp, index) => {
            for (let i = 0; i < reporting.compsData.length; i++) {
              if (
                reporting.compsData[i].propertyRecordId ===
                comp.propertyRecordId
              ) {
                reporting.compsData[i].selectedCompFlag =
                  type[0].toUpperCase() + String(index + 1);
                reporting.compsData[i].comp_level = comp.comp_level;

                let this_selectedComp = {};
                this_selectedComp[reporting.compsData[i].selectedCompFlag] =
                  comp.propertyRecordId;
                selectedCompsIds[type].push(this_selectedComp);
              } else if (
                !reporting.compsData[i].selectedCompFlag ||
                reporting.compsData[i].selectedCompFlag === ""
              ) {
                reporting.compsData[i].selectedCompFlag = "";
                reporting.compsData[i].comp_level = null;
              }
            }
          });
        }
      });
    }

    //===========================================================
    //  Fill reportData data fields
    //===========================================================
    // Add reportData to reporting. reportData contains all data elements that are used in valuation report
    const reportType = `${requestBody.productType}_${requestBody.productSubType}`;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = "pdf-report-templates";
    
    let reportData;
    try {
      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const mappingBlobName = `${reportType}-template.json`;
      const mappingBlobClient = containerClient.getBlobClient(mappingBlobName);
      
      // Check if blob exists
      const exists = await mappingBlobClient.exists();
      if (!exists) {
        const error_message = JSON.stringify({
          error: `Report template not found: ${mappingBlobName}`,
        });
        context.log(error_message);
        return {
          status: 404,
          body: error_message,
        };
      }
      
      const mappingDownloadResponse = await mappingBlobClient.download();
      const mappingBuffer = await streamToBuffer(
        mappingDownloadResponse.readableStreamBody
      );

      reportData = JSON.parse(mappingBuffer.toString());
    } catch (error) {
      const error_message = JSON.stringify({
        error: `Failed to retrieve report template from blob storage: ${error.message}`,
      });
      context.log(error_message);
      return {
        status: 500,
        body: error_message,
      };
    }

    // Set all values in reportData to empty strings: xxxx-template.json has data paths as values
    for (const key in reportData) {
      if (reportData.hasOwnProperty(key)) {
        reportData[key] = "";
      }
    }
    reporting.reportData = reportData;

    // Fill reportData.selectedComps:
    fillCompAnalysis(reporting, selectedCompsIds);

    //===========================================================
    //  Calculate final valuation
    //===========================================================
    /* Note: Need to do:
      1) Add BatchData valuation element to reportData.compAnalaysis subject and comps
      2) Modify computeValuesEstimate so that the final values are calculated off of 
        reportData.compAnalysis
    
    */

    reporting.valuationEstimate = computeValueEstimate(reporting);

    //===========================================================
    //  Fill out reporting.reportData
    //===========================================================
    await fillReportData(reporting, context);

    //===============================================================
    //  Copy valuationEstimate and reportData generated by model
    //  so that users can always revert back to the original results
    //===============================================================
    // Add selectedCompsIds to valuationEstimate
    reporting.valuationEstimate.selectedCompsIds = selectedCompsIds;
    reporting.valuationEstimate.createdBy = "Model";

    reporting.reportDataByModel = reporting.reportData;
    reporting.valuationEstimateByModel = reporting.valuationEstimate;

    //============================================================
    // Upsert updated reporting data back to Cosmos DB
    //============================================================
    try {
      await containerReporting.items.upsert(reporting);
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameReporting}. data: ${reporting}  ${error.message}`
      );
      throw error;
    }

    //=======================================================================
    //  Save order object in Cosmos DB with updated status & reportRecordId
    //=======================================================================
    requestBody.status = "Ready For Review";
    // requestBody.reportRecordId = reportingData.reportRecordId; // Set the reportRecordId to the same value as id

    try {
      await containerOrders.items.upsert(requestBody);
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameOrders}. data: ${requestBody}  ${error.message}`
      );
      throw error;
    }

    context.log(
      `Order processed successfully for orderRecordId ${reporting.orderRecordId}.`
    );

    return { body: JSON.stringify(reporting), status: 200 };
  },
});

// Helper function to convert stream to buffer
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
}
