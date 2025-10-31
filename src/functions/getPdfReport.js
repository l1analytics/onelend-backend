const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument } = require("pdf-lib");
const axios = require("axios");

app.http("getPdfReport", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("getPdfReport function triggered");

    try {
      // Get reportType from query or body
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

      // Pull report from Blob Storage
      const pdfBlobName = `${clientId}/${orderId}/${reportFileName}`;
      const pdfBlobClient = containerClient.getBlobClient(pdfBlobName);
      const pdfDownloadResponse = await pdfBlobClient.download();
      const pdfBuffer = await streamToBuffer(
        pdfDownloadResponse.readableStreamBody
      );

      // Return the PDF as base64 for React UI display
      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: {
          pdf: pdfBuffer.toString('base64'),
          fileName: reportFileName,
          contentType: 'application/pdf'
        }
      };
    } catch (error) {
      context.log("Error filling PDF:", error);
      return {
        status: 500,
        jsonBody: {
          error: "Error processing PDF report",
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
