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
  // Split path by dots, but preserve array indices like [0]
  const keys = path.split(".").flatMap((key) => {
    // Check if key contains array index notation like "items[0]" or "items[0][1]"
    // Handle multiple array indices in one segment
    const result = [];
    let remaining = key;
    
    while (remaining) {
      const arrayMatch = remaining.match(/^(.+?)\[(\d+)\](.*)$/);
      if (arrayMatch) {
        // Add the property name if it exists
        if (arrayMatch[1]) {
          result.push(arrayMatch[1]);
        }
        // Add the array index
        result.push(parseInt(arrayMatch[2]));
        // Continue with remaining part
        remaining = arrayMatch[3].replace(/^\[/, ''); // Remove leading [ if present
        if (!remaining.startsWith('[')) {
          remaining = ''; // No more array indices
        }
      } else {
        // No array notation, just return the key
        result.push(remaining);
        remaining = '';
      }
    }
    
    return result.length > 0 ? result : [key];
  });

  return keys.reduce((current, key) => {
    if (current === null || current === undefined) {
      return null;
    }
    return current[key] !== undefined ? current[key] : null;
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

const fillReportBpo = async (reporting, context) => {
  const reportType = `${reporting.productType}_${reporting.productSubType}`;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = "pdf-report-templates";

  let templateMapping;
  try {
    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const mappingBlobName = `${reportType}-template.json`;
    const mappingBlobClient = containerClient.getBlobClient(mappingBlobName);
    
    // Check if blob exists
    const exists = await mappingBlobClient.exists();
    if (!exists) {
      const errorMessage = `Report template not found: ${mappingBlobName}`;
      context.log(errorMessage);
      throw new Error(errorMessage);
    }
    
    const mappingDownloadResponse = await mappingBlobClient.download();
    const mappingBuffer = await streamToBuffer(
      mappingDownloadResponse.readableStreamBody
    );

    templateMapping = JSON.parse(mappingBuffer.toString());
  } catch (error) {
    const errorMessage = `Failed to retrieve report template from blob storage: ${error.message}`;
    context.log(errorMessage);
    throw new Error(errorMessage);
  }

  let reportData = reporting.reportData;

  if (reportData && Object.keys(reportData).length > 0) {

    // Fallback: try to populate from reporting.propertyData using templateMapping
    for (const [key, value] of Object.entries(reportData)) {
      const mappingConfig = templateMapping[key];

      if (!mappingConfig || mappingConfig === "") {
        continue;
      }

      if (typeof mappingConfig.path === "string" && mappingConfig.path !== "") {
        const extractedValue = getValueByPath(reporting, mappingConfig.path);
        if (extractedValue !== null && extractedValue !== undefined) {
          reportData[key] = extractedValue;
          context.log(`Populated ${key} from fallback data: ${extractedValue}`);
        }
      }
    }
  }
};

module.exports = {
  fillReportBpo,
};
