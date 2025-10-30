const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument } = require("pdf-lib");
const axios = require("axios");

app.http("fillPdfReport", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("fillPdfReport function triggered");

    try {
      // Get reportType from query or body
      let reportType = request.query.get("reportType");

      if (!reportType && request.body) {
        const requestBody = await request.json();
        reportType = requestBody.reportType;
      }

      if (!reportType) {
        return {
          status: 400,
          jsonBody: { error: "Please provide a reportType parameter" },
        };
      }

      // Azure Blob Storage configuration
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = "pdf-report-templates";

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      // 1. Pull PDF template from Blob Storage
      const pdfBlobName = `${reportType}-template.pdf`;
      const pdfBlobClient = containerClient.getBlobClient(pdfBlobName);
      const pdfDownloadResponse = await pdfBlobClient.download();
      const pdfBuffer = await streamToBuffer(
        pdfDownloadResponse.readableStreamBody
      );

      // 2. Pull data mapping template (JSON) from Blob Storage
      const mappingBlobName = `${reportType}-template.json`;
      const mappingBlobClient = containerClient.getBlobClient(mappingBlobName);
      const mappingDownloadResponse = await mappingBlobClient.download();
      const mappingBuffer = await streamToBuffer(
        mappingDownloadResponse.readableStreamBody
      );
      const mappingData = JSON.parse(mappingBuffer.toString());

      // 3. Load PDF and fill form fields
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const form = pdfDoc.getForm();

      // Loop through mapping template and fill PDF
      for (const [fieldName, fieldValue] of Object.entries(mappingData)) {
        try {
          const field = form.getField(fieldName);

          // Handle button fields with images
          if (field.constructor.name === "PDFButton") {
            if (
              fieldValue //&&
              //typeof fieldValue === "object" &&
              // fieldValue.type === "image" &&
              // fieldValue.url
            ) {
              // Fetch the image from URL
              imageUrl = "https://imagesp.reicoreapi.com/5/1/fp/3b917e704faa2d437e297a0b0205e10e-cc_ft_960.jpg";
              const imageResponse = await axios.get(imageUrl, {
                responseType: "arraybuffer",
              });
              const imageBuffer = Buffer.from(imageResponse.data);

              // Determine format from URL or fieldValue
              let image;
              const imageFormat = fieldValue.format ||
                (imageUrl.toLowerCase().endsWith('.jpg') ||
                 imageUrl.toLowerCase().endsWith('.jpeg') ? 'jpg' : 'png');

              if (imageFormat === 'png') {
                image = await pdfDoc.embedPng(imageBuffer);
              } else if (imageFormat === 'jpg' || imageFormat === 'jpeg') {
                image = await pdfDoc.embedJpg(imageBuffer);
              }

              // Set the image as the button's appearance
              field.setImage(image);
              context.log(`Inserted image into button field: ${fieldName} from ${fieldValue.url}`);
            }
          }
          // Handle different field types
          else if (field.constructor.name === "PDFTextField") {
            field.setText(String(fieldValue));
          } else if (field.constructor.name === "PDFCheckBox") {
            if (fieldValue) {
              field.check();
            } else {
              field.uncheck();
            }
          } else if (field.constructor.name === "PDFDropdown") {
            field.select(String(fieldValue));
          } else if (field.constructor.name === "PDFRadioGroup") {
            field.select(String(fieldValue));
          }

          context.log(`Filled field: ${fieldName} with value: ${fieldValue}`);
        } catch (fieldError) {
          context.log(
            `Could not fill field ${fieldName}: ${fieldError.message}`
          );
        }
      }

      // Flatten the form to make it non-editable (optional)
      form.flatten();

      // Generate filled PDF
      const filledPdfBytes = await pdfDoc.save();

      // Return the filled PDF
      return {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${reportType}-filled.pdf"`,
        },
        body: Buffer.from(filledPdfBytes),
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
