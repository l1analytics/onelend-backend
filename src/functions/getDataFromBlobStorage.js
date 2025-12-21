const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

/*==================================================
    Set up connection to Azure Blob Storage
  ==================================================*/

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!connectionString) {
  console.log("AZURE_STORAGE_CONNECTION_STRING could not be retrieved from environment variables.");
}

app.http("getDataFromBlobStorage", {
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
    const { containerName, dataPath } = requestBody;

    if (!containerName) {
      const error_message = JSON.stringify({
        error: "containerName is required in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    if (!dataPath) {
      const error_message = JSON.stringify({
        error: "dataPath is required in request body",
      });
      context.log(error_message);
      return {
        status: 400,
        body: error_message,
      };
    }

    //==============================
    //    Retrieve blob from storage
    //==============================
    try {
      // Create BlobServiceClient from connection string
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      
      // Get container client
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Get blob client
      const blobClient = containerClient.getBlobClient(dataPath);
      
      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        const error_message = JSON.stringify({
          error: `Blob not found at path: ${dataPath} in container: ${containerName}`,
        });
        context.log(error_message);
        return {
          status: 404,
          body: error_message,
        };
      }
      
      // Download blob content
      const downloadResponse = await blobClient.download();
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const blobData = Buffer.concat(chunks);
      
      // Get blob properties
      const properties = await blobClient.getProperties();
      
      context.log(`Successfully retrieved blob: ${dataPath} from container: ${containerName}`);
      
      // Return the blob data and metadata
      return {
        status: 200,
        headers: {
          "Content-Type": properties.contentType || "application/octet-stream",
        },
        body: blobData.toString('utf-8'),
      };
      
    } catch (error) {
      context.log(`Error retrieving blob from storage: ${error.message}`);
      const error_message = JSON.stringify({
        error: `Failed to retrieve blob: ${error.message}`,
      });
      return {
        status: 500,
        body: error_message,
      };
    }
  },
});
