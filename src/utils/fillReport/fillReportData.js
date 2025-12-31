const fs = require("fs");
const { SelectedCompData } = require("../../data/ReportData.js");
const { fillReportDvr } = require("./fillReportDvr.js");
const { fillReportBpo } = require("./fillReportBpo.js");
const { fillPdf } = require("./fillPdf.js");
const { report } = require("process");
const { fill } = require("pdf-lib");

/*========================================================================================
    fillCompAnalysis:
    This function fills the compAnalysis section of reportData in the reporting object

    Parameters:
    selectedCompsIds: selected propertyRecordIds of selected comps (Sold and list)
    reporting: reporting object that contains all reporting data, including reportData
  =========================================================================================*/

const fillCompAnalysisDataMapping = (
  selecteCompType,
  selectedCompFlag,
  propData
) => {
  let reportToFill = SelectedCompData;

  reportToFill.dataValues.selecteCompType = selecteCompType;
  reportToFill.dataValues.selectedCompFlag = selectedCompFlag;
  reportToFill.dataValues.percelNumber = propData?.ids?.apn || null;
  reportToFill.dataValues.street = propData?.address?.street || null;
  reportToFill.dataValues.city = propData?.address?.city || null;
  reportToFill.dataValues.state = propData?.address?.state || null;
  reportToFill.dataValues.zip = propData?.address?.zip || null;
  reportToFill.dataValues.latitude = propData?.address?.latitude || null;
  reportToFill.dataValues.longitude = propData?.address?.longitude || null;
  reportToFill.dataValues.lastSalePrice =
    propData?.sale?.lastSale?.price || null;
  reportToFill.dataValues.lastSaleDate =
    propData?.sale?.lastSale?.saleDate || null;
  reportToFill.dataValues.yearBuilt = propData?.building?.yearBuilt || null;
  reportToFill.adjustments.yearBuiltAdj = 0;
  reportToFill.dataValues.bed = propData?.building?.bedroomCount || null;
  reportToFill.adjustments.bedAdj = 0;
  reportToFill.dataValues.bath =
    propData?.building?.calculatedBathroomCount || null;
  reportToFill.adjustments.bathAdj = 0;
  reportToFill.dataValues.livingArea =
    propData?.building?.livingAreaSquareFeet || null;
  reportToFill.adjustments.livingAreaAdj = 0;
  reportToFill.dataValues.basementArea =
    propData?.building?.basementSquareFeet || null;
  reportToFill.adjustments.basementAreaAdj = 0;
  reportToFill.dataValues.heating = propData?.building?.heatSource || null;
  reportToFill.adjustments.heatingAdj = 0;
  reportToFill.dataValues.ac =
    propData?.building?.airConditioningSource || null;
  reportToFill.adjustments.acAdj = 0;
  reportToFill.dataValues.garage =
    String(propData?.building?.garageParkingSpaceCount || "") +
    "/" +
    (propData?.building?.garage || "");
  reportToFill.adjustments.garageAdj = 0;
  reportToFill.dataValues.pool = propData?.building?.pool || null;
  reportToFill.adjustments.poolAdj = 0;
  reportToFill.dataValues.porch = propData?.building?.porch || null;
  reportToFill.adjustments.porchAdj = 0;
  reportToFill.dataValues.patio = propData?.building?.patio || null;
  reportToFill.adjustments.patioAdj = 0;

  reportToFill.adjustments.totalAdj = 0;

  // reportToFill.avm = propData?.valuation;
  // reportToFill.valuation = propData?.valuation;

  return reportToFill;
};

const fillCompAnalysis = (reporting, selectedCompsIds) => {
  // Create compAnalysis to subject property data (propertyData)
  reporting.propertyData.compAnalysis = JSON.parse(
    JSON.stringify(
      fillCompAnalysisDataMapping("Subject", "Subject", reporting.propertyData)
    )
  );

  // Create compAnalysis to each comp data
  reporting.compsData.forEach((comp) => {
    comp.compAnalysis = JSON.parse(
      JSON.stringify(
        fillCompAnalysisDataMapping(
          comp.selectedCompFlag,
          comp.selectedCompFlag,
          comp
        )
      )
    );
  });
};

const fillReportData = async (reporting, context) => {
  // Fill reporting.reportData based on report type
  switch (reporting.productType) {
    case "DVR":
      await fillReportDvr(reporting, context);
      break;
    case "BPO":
      await fillReportBpo(reporting, context);
      break;
    default:
      break;
  }

  // Fill PDF report
  await fillPdf(reporting, context);
};

module.exports = {
  fillCompAnalysis,
  fillReportData,
  fillCompAnalysisDataMapping,
};
