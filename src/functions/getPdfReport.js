const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

app.http("getPdfReport", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("getPdfReport function triggered");

    try {
      // Get parameters from query or body
      let reportFileName = request.query.get("reportFileName");
      let clientId = request.query.get("clientId");
      let orderId = request.query.get("orderId");

      if (!reportFileName && request.body) {
        const requestBody = await request.json();
        reportFileName = requestBody.reportFileName;
        clientId = requestBody.clientId;
        orderId = requestBody.orderId;
      }

      if (!reportFileName) {
        return {
          status: 400,
          jsonBody: { error: "Please provide a reportFileName parameter" },
        };
      }

      // Azure Blob Storage configuration
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = "orders";

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      // Pull file from Blob Storage
      const blobName = `${clientId}/${orderId}/${reportFileName}`;
      const blobClient = containerClient.getBlobClient(blobName);
      
      // Get blob properties to retrieve content type
      const blobProperties = await blobClient.getProperties();
      const contentType = blobProperties.contentType || getContentTypeFromFileName(reportFileName);
      
      const downloadResponse = await blobClient.download();
      const fileBuffer = await streamToBuffer(
        downloadResponse.readableStreamBody
      );

      // Return the file as base64 for React UI display
      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: {
          file: fileBuffer.toString('base64'),
          fileName: reportFileName,
          contentType: contentType
        }
      };
    } catch (error) {
      context.log("Error retrieving file:", error);
      return {
        status: 500,
        jsonBody: {
          error: "Error processing file",
          details: error.message,
        },
      };
    }
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

// Helper function to determine content type from file extension
function getContentTypeFromFileName(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const contentTypeMap = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'xml': 'application/xml',
    'zip': 'application/zip'
  };
  return contentTypeMap[extension] || 'application/octet-stream';
}