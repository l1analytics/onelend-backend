const fs = require("fs");
const { report } = require("process");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument } = require("pdf-lib");
const axios = require("axios");

/*========================================================================================
    fillPdf:
    Takes a reporting object containing report data and populates a PDF template with that data.
    
    This function performs the following steps:
    1. Downloads the appropriate PDF template from Azure Blob Storage based on report type
    2. Loads the PDF and extracts its form fields
    3. Iterates through the reportData object and fills matching PDF form fields
       - Handles text fields, checkboxes, dropdowns, radio buttons, and image buttons
       - For image buttons, fetches images from URLs and embeds them in the PDF
    4. Saves the completed PDF
    5. Uploads the filled PDF back to Blob Storage under the client's order directory
    
    @param {Object} reporting - Object containing report data and metadata
    @param {string} reporting.productType - The type of report product
    @param {string} reporting.productSubType - The subtype of report product
    @param {Object} reporting.reportData - Key-value pairs mapping PDF field names to values
    @param {string} reporting.clientId - Client identifier for storage path
    @param {string} reporting.orderId - Order identifier for storage path
    @param {string} reporting.streetAddress - Property street address
    @param {string} reporting.city - Property city
    @param {Object} context - Azure Function context for logging
    
    @returns {Promise<void>} Updates reporting.productReportFileName with the generated PDF filename
  =========================================================================================*/

const fillPdf = async (reporting, context) => {
  const reportType = `${reporting.productType}_${reporting.productSubType}`;
  let reportData = reporting.reportData;

  // 1. Pull PDF template from Blob Storage
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = "pdf-report-templates";
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);

  let pdfBuffer;
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const pdfBlobName = `${reportType}-template.pdf`;
    const pdfBlobClient = containerClient.getBlobClient(pdfBlobName);

    // Check if blob exists
    const exists = await pdfBlobClient.exists();
    if (!exists) {
      const errorMessage = `PDF template not found: ${pdfBlobName}`;
      context.log(errorMessage);
      throw new Error(errorMessage);
    }

    const pdfDownloadResponse = await pdfBlobClient.download();
    pdfBuffer = await streamToBuffer(pdfDownloadResponse.readableStreamBody);
  } catch (error) {
    const errorMessage = `Failed to retrieve PDF template from blob storage: ${error.message}`;
    context.log(errorMessage);
    throw new Error(errorMessage);
  }

  // 2. Load PDF and fill form fields
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();

  // 3. Loop through mapping template and fill PDF
  for (const [fieldName, fieldValue] of Object.entries(reportData)) {
    try {
      const field = form.getField(fieldName);

      // Handle button fields with images
      if (field.constructor.name === "PDFButton") {
        if (
          fieldValue &&
          fieldValue !== "" //&&
          //typeof fieldValue === "object" &&
          // fieldValue.type === "image" &&
          // fieldValue.url
        ) {
          // Fetch the image from URL
          imageUrl = fieldValue;
          const imageResponse = await axios.get(imageUrl, {
            responseType: "arraybuffer",
          });
          const imageBuffer = Buffer.from(imageResponse.data);

          // Determine format from URL or fieldValue
          let image;
          const imageFormat =
            fieldValue.format ||
            (imageUrl.toLowerCase().endsWith(".jpg") ||
            imageUrl.toLowerCase().endsWith(".jpeg")
              ? "jpg"
              : "png");

          if (imageFormat === "png") {
            image = await pdfDoc.embedPng(imageBuffer);
          } else if (imageFormat === "jpg" || imageFormat === "jpeg") {
            image = await pdfDoc.embedJpg(imageBuffer);
          }

          // Set the image as the button's appearance
          field.setImage(image);
          context.log(
            `Inserted image into button field: ${fieldName} from ${fieldValue.url}`
          );
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
      context.log(`Could not fill field ${fieldName}: ${fieldError.message}`);
    }
  }

  // Flatten the form to make it non-editable (optional)
  // form.flatten();

  // Generate filled PDF
  const filledPdfBytes = await pdfDoc.save();

  // 4. Upload filled PDF to Blob Storage
  const ordersContainerClient = blobServiceClient.getContainerClient("orders");

  try {
    const addressName = `${reporting.streetAddress}_${reporting.city}`;
    const orderPath = `${reporting.clientId}/${reporting.orderId}/`;
    const pdfFileName = `${reportType}_${addressName}.pdf`;
    const filledPdfBlobName = `${orderPath}${pdfFileName}`;
    const filledPdfBlobClient =
      ordersContainerClient.getBlockBlobClient(filledPdfBlobName);
    await filledPdfBlobClient.upload(filledPdfBytes, filledPdfBytes.length);
    reporting.productReportFileName = pdfFileName;
    context.log(`Uploaded filled PDF to Blob Storage: ${filledPdfBlobName}`);
  } catch (uploadError) {
    context.log(`Error uploading filled PDF: ${uploadError.message}`);
  }
};

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

module.exports = {
  fillPdf,
};
