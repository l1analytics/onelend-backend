const fs = require("fs");
const { report } = require("process");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument } = require("pdf-lib");
const axios = require("axios");

/*========================================================================================
    fillReportDvr:
    Fill reporting.reportData for DVR report type
  =========================================================================================*/

const fillPdf = async (reporting, context) => {
  const reportType = `${reporting.productType}_${reporting.productSubType}`;
  let reportData = reporting.reportData;

  // 1. Pull PDF template from Blob Storage
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = "pdf-report-templates";
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const pdfBlobName = `${reportType}-template.pdf`;
  const pdfBlobClient = containerClient.getBlobClient(pdfBlobName);
  const pdfDownloadResponse = await pdfBlobClient.download();
  const pdfBuffer = await streamToBuffer(
    pdfDownloadResponse.readableStreamBody
  );

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
