const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

app.http("uploadPdfReport", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("uploadPdfReport function triggered");

    try {
      // Get parameters from request body
      const requestBody = await request.json();
      const { reportFileName, clientId, orderId, pdfData } = requestBody;

      if (!reportFileName || !clientId || !orderId || !pdfData) {
        return {
          status: 400,
          jsonBody: { 
            error: "Please provide reportFileName, clientId, orderId, and pdfData parameters" 
          },
        };
      }

      // Azure Blob Storage configuration
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = "orders";

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      // Upload file to Blob Storage
      const blobName = `${clientId}/${orderId}/${reportFileName}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Convert base64 to buffer
      const fileBuffer = Buffer.from(pdfData, 'base64');

      // Determine content type from file name
      const contentType = getContentTypeFromFileName(reportFileName);

      // Upload the file
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType
        }
      });

      return {
        status: 200,
        jsonBody: {
          message: "File uploaded successfully",
          blobName: blobName,
          fileName: reportFileName
        }
      };
    } catch (error) {
      context.log("Error uploading file:", error);
      return {
        status: 500,
        jsonBody: {
          error: "Error uploading file",
          details: error.message,
        },
      };
    }
  },
});

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