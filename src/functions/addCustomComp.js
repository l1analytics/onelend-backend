const { app } = require("@azure/functions");
const { CosmosClient, PatchOperation } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const uuid = require("uuid");
const {
  fillCompAnalysisDataMapping,
} = require("../utils/fillReport/fillReportData");

/*==================================================s
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

app.http("addCustomComp", {
  methods: ["POST"],
  authLevel: "anonymous",
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
          error: "Request body must be a JSON object",
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

    //==============================
    //    Validate required fields
    //==============================
    const { report, newComp } = requestBody;

    if (!report) {
      const error_message = JSON.stringify({
        error: "report is required in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    if (!newComp) {
      const error_message = JSON.stringify({
        error: "newComp is required in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    //==============================
    //  Update report with newComp
    //==============================
    newComp.listing.status = "Custom";
    newComp.id = uuid.v4();
    if (!newComp.valuation) {
      newComp.valuation = {};
    }
    newComp.valuation.estimatedValue = newComp.listing.soldPrice;
    newComp.valuation.asOfDate = newComp.listing.soldDate;
    newComp.propertyRecordId = report.id;
    newComp.subjectPropertyRecordId = report.propertyRecordId;

    // Add compAnalysis property in compsData
    newComp.compAnalysis = fillCompAnalysisDataMapping(null, "", newComp);

    // Append newComp to report.compsData
    report.compsData.push(newComp);

    // Append newComp.propertyRecordId to report.compsRecordIds
    report.compsRecordIds.push(newComp.id);

    //===========================================================
    //  Upsert updated report data to CosmosDB
    //===========================================================
    let returnMessage;
    try {
      await containerReporting.items.upsert(report);
      returnMessage = `Report data upserted successfully for reportRecordId: ${report.reportRecordId}.`;
    } catch (error) {
      context.log(
        `Error upserting item to CosmosDB database: ${databaseName}. container: ${containerNameReporting}. Error: ${error.message}`
      );
      return {
        status: 500,
        body: JSON.stringify({
          error: `Failed to upsert report: ${error.message}`,
        }),
      };
    }

    return {
      status: 200,
      body: JSON.stringify(report),
    };
  },
});
