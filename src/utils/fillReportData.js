const fs = require("fs");
const { SelectedCompData } = require("../data/ReportData");
const { report } = require("process");

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

  reportToFill.propertyRecordId = propData.propertyRecordId || null;
  reportToFill.values.selecteCompType = selecteCompType;
  reportToFill.values.selectedCompFlag = selectedCompFlag;
  reportToFill.values.percelNumber = propData.ids.apn || null;
  reportToFill.values.street = propData.address.street || null;
  reportToFill.values.city = propData.address.city || null;
  reportToFill.values.state = propData.address.state || null;
  reportToFill.values.zip = propData.address.zip || null;
  reportToFill.values.latitude = propData.address.latitude || null;
  reportToFill.values.longitude = propData.address.longitude || null;
  reportToFill.values.lastSalePrice = propData.sale.lastSale.price || null;
  reportToFill.values.lastSaleDate = propData.sale.lastSale.saleDate || null;
  reportToFill.values.yearBuilt = propData.building.yearBuilt || null;
  reportToFill.adjustments.yearBuiltAdj = 0;
  reportToFill.values.bed = propData.building.bedroomCount || null;
  reportToFill.adjustments.bedAdj = 0;
  reportToFill.values.bath = propData.building.calculatedBathroomCount || null;
  reportToFill.adjustments.bathAdj = 0;
  reportToFill.values.livingArea =
    propData.building.livingAreaSquareFeet || null;
  reportToFill.adjustments.livingAreaAdj = 0;
  reportToFill.values.basementArea =
    propData.building.basementSquareFeet || null;
  reportToFill.adjustments.basementAreaAdj = 0;
  reportToFill.values.heating = propData.building.heatSource || null;
  reportToFill.adjustments.heatingAdj = 0;
  reportToFill.values.ac = propData.building.airConditioningSource || null;
  reportToFill.adjustments.acAdj = 0;
  reportToFill.values.garage =
    String(propData.building.garageParkingSpaceCount) +
    "/" +
    propData.building.garage;
  reportToFill.adjustments.garageAdj = 0;
  reportToFill.values.pool = propData.building.pool || null;
  reportToFill.adjustments.poolAdj = 0;
  reportToFill.values.porch = propData.building.porch || null;
  reportToFill.adjustments.porchAdj = 0;
  reportToFill.values.patio = propData.building.patio || null;
  reportToFill.adjustments.patioAdj = 0;

  reportToFill.adjustments.totalAdj = 0;

  // reportToFill.avm = propData?.valuation;
  reportToFill.valuation = propData?.valuation;

  return reportToFill;
};

const fillCompAnalysis = (reporting, selectedCompsIds) => {
  // Fill in subject property data
  reporting.reportData.compAnalysis.subject = JSON.parse(
          JSON.stringify(fillCompAnalysisDataMapping(
    "Subject",
    "Subject",
    reporting.propertyData
  )));

  // Fill in sold and list comps data
  // const selectedCompsIds = reporting.valuationEstimate.selectedCompsIds;

  const compTypes = ["sold", "list"];

  compTypes.forEach((type) => {
    if (selectedCompsIds[type].length > 0) {
      const foundComps = [];
      for (let i = 0; i < selectedCompsIds[type].length; i++) {
        const selectedComp = selectedCompsIds[type][i];
        const compFlag = Object.keys(selectedComp)[0];
        const compData = reporting.compsData.find(
          (obj) => obj.propertyRecordId === selectedComp[compFlag]
        );
        const filledData = JSON.parse(
          JSON.stringify(
            fillCompAnalysisDataMapping(compFlag, compFlag, compData)
          )
        );
        foundComps.push({ ...filledData });
      }

      // reporting.reportData.compAnalysis[type].push([...foundComps]);
      reporting.reportData.compAnalysis[type] = foundComps;
    }
  });

  return reporting;
};

module.exports = {
  fillCompAnalysis,
};
