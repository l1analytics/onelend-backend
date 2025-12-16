const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient } = require("@azure/storage-blob");

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

// Helper function to get value from object using dot notation path
function getValueByPath(obj, path) {
  return path.split(".").reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

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

const credential = new DefaultAzureCredential();
var client = new CosmosClient({
  endpoint: cosmosEndpoint,
  aadCredentials: credential,
});
const database = client.database(databaseName);
const appraisalContainer = database.container("appraisalData");

/*========================================================================================
    fillReportDvr:
    Populates the reportData object with values from appraisal data and property data
    for DVR (Desk Value Review) report types.
    
    This function performs the following steps:
    1. Downloads a JSON template mapping file from Azure Blob Storage that defines
       how to map data sources to PDF report fields
    2. Queries CosmosDB for appraisal data using clientId and orderId
    3. Iterates through each field in reportData and populates it based on:
       - Template mapping configurations (either direct paths or page-specific paths)
       - Appraisal data from CosmosDB (primary source)
       - Property data from the reporting object (fallback if appraisal data not found)
    4. Adds hardcoded comments for specific pages (P2 and P4)
    
    Template Mapping Format:
    - Direct path: "fieldName": "path.to.data" - extracts from appraisalData directly
    - Page-specific: "fieldName": {"pageNumber": 1, "path": "data.field"} - extracts
      from a specific page within the appraisalData array
    - Empty string or no mapping: field is skipped
    
    @param {Object} reporting - Object containing report and property data
    @param {string} reporting.clientId - Client identifier for database query
    @param {string} reporting.orderId - Order identifier for database query
    @param {string} reporting.productType - The type of report product
    @param {string} reporting.productSubType - The subtype of report product
    @param {Object} reporting.reportData - Object to be populated with report field values
    @param {Object} reporting.propertyData - Fallback data source if appraisal data not found
    @param {Object} context - Azure Function context for logging
    
    @returns {Promise<void>} Modifies reporting.reportData in place
  =========================================================================================*/

const fillReportDvr = async (reporting, context) => {
  const reportType = `${reporting.productType}_${reporting.productSubType}`;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = "pdf-report-templates";

  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const mappingBlobName = `${reportType}-template.json`;
  const mappingBlobClient = containerClient.getBlobClient(mappingBlobName);
  const mappingDownloadResponse = await mappingBlobClient.download();

  const mappingBuffer = await streamToBuffer(
    mappingDownloadResponse.readableStreamBody
  );

  const templateMapping = JSON.parse(mappingBuffer.toString());

  let reportData = reporting.reportData;

  try {
    // Fetch appraisal data from CosmosDB based on clientId and orderId
    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.clientId = @clientId AND c.orderId = @orderId",
      parameters: [
        {
          name: "@clientId",
          value: reporting.clientId,
        },
        {
          name: "@orderId",
          value: reporting.orderId,
        },
      ],
    };

    const { resources: appraisalResults } = await appraisalContainer.items
      .query(querySpec)
      .fetchAll();

    if (appraisalResults && appraisalResults.length > 0) {
      const appraisalData = appraisalResults[0].appraisalData;
      context.log(
        `Found appraisal data for clientId: ${reporting.clientId}, orderId: ${reporting.orderId}`
      );

      // Loop through reportData and populate based on templateMapping and appraisalData
      for (const [key, value] of Object.entries(reportData)) {
        // Get the mapping configuration for this report field
        const mappingConfig = templateMapping[key];

        // temporary code for P1_Image
        if (key === "P1_Image") {
          reportData[key] = reporting.propertyData.images.imageUrls[0];
          continue;
        }

        // Skip if no mapping exists or if mapping is empty string
        if (!mappingConfig || mappingConfig === "") {
          continue;
        }

        // If mapping is a JSON object with pageNumber and path
        if (
          typeof mappingConfig === "object" &&
          mappingConfig.pageNumber !== undefined &&
          mappingConfig.path
        ) {
          const { pageNumber, path } = mappingConfig;

          // Find the object in appraisalData array with matching pageNumber
          let pageData = null;

          // Loop through appraisalData array to find matching pageNumber
          if (Array.isArray(appraisalData)) {
            for (const element of appraisalData) {
              if (element.pageNumber === pageNumber) {
                pageData = element;
                break;
              }
            }
          }

          // If page data found, use the path to get the value
          if (pageData) {
            const extractedValue = getValueByPath(pageData, path);
            if (extractedValue !== null && extractedValue !== undefined) {
              reportData[key] = extractedValue;
              context.log(
                `Populated ${key} from appraisal data page ${pageNumber}: ${extractedValue}`
              );
            } else {
              context.log(
                `Path ${path} not found in page ${pageNumber} for field ${key}`
              );
            }
          } else {
            context.log(
              `Page ${pageNumber} not found in appraisal data for field ${key}`
            );
          }
        } else if (typeof mappingConfig === "string" && mappingConfig !== "") {
          // If mapping is a direct path string
          const extractedValue = getValueByPath(appraisalData, mappingConfig);
          if (extractedValue !== null && extractedValue !== undefined) {
            reportData[key] = extractedValue;
            context.log(
              `Populated ${key} from appraisal data: ${extractedValue}`
            );
          } else {
            context.log(
              `Path ${mappingConfig} not found in appraisal data for field ${key}`
            );
          }
        }
      }
    } else {
      context.log(
        `No appraisal data found for clientId: ${reporting.clientId}, orderId: ${reporting.orderId}. Using fallback data.`
      );

      // Fallback: try to populate from reporting.propertyData using templateMapping
      for (const [key, value] of Object.entries(reportData)) {
        const mappingConfig = templateMapping[key];

        if (!mappingConfig || mappingConfig === "") {
          continue;
        }

        if (typeof mappingConfig === "string" && mappingConfig !== "") {
          const extractedValue = getValueByPath(reporting, mappingConfig);
          if (extractedValue !== null && extractedValue !== undefined) {
            reportData[key] = extractedValue;
            context.log(
              `Populated ${key} from fallback data: ${extractedValue}`
            );
          }
        }
      }
    }
  } catch (error) {
    context.log.error(`Error fetching appraisal data: ${error.message}`);

    // Fallback: try to populate from reporting.propertyData using templateMapping
    for (const [key, value] of Object.entries(reportData)) {
      const mappingConfig = templateMapping[key];

      if (!mappingConfig || mappingConfig === "") {
        continue;
      }

      if (typeof mappingConfig === "string" && mappingConfig !== "") {
        const extractedValue = getValueByPath(reporting, mappingConfig);
        if (extractedValue !== null && extractedValue !== undefined) {
          reportData[key] = extractedValue;
          context.log(
            `Populated ${key} from fallback data after error: ${extractedValue}`
          );
        }
      }
    }
  }

  // Page 2
  reportData.P2_Comments =
    "Draft comments. AI generated commets will be placed.";

  // Page 4
  reportData.P4_Comments =
    "Draft comments for page 4. AI generated commets will be placed.";
};

module.exports = {
  fillReportDvr,
};
