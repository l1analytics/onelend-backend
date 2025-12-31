const fs = require("fs");
// const { AzureOpenAI } = require("@azure/openai");
const { AzureOpenAI } = require("openai");

// Reasoning Q&A function
async function ragQAndAReasoning(query, subject, comps) {
  const azure_client = new AzureOpenAI({
    apiKey:
      "AJoVWAHdt1A90yDAtssUpwqcGiduJYNNxYFXKGnV1pWYhE5BSkgJJQQJ99BEACHYHv6XJ3w3AAAAACOG4q32",
    apiVersion: "2025-04-01-preview",
    endpoint: "https://hiro-maq7gbb0-eastus2.cognitiveservices.azure.com/",
  });

  const newPrompt = `${query} \n <Subject Property>\n${subject} </Subject Property>\n <Comparable Properties>\n${comps} </Comparable Properties>\n `;

  const response = await azure_client.responses.create({
    model: "o4-mini",
    // model: "",
    reasoning: { effort: "medium" },
    input: [{ role: "user", content: newPrompt }],
    max_output_tokens: 25000,
    // temperature: 0,
    // check this: https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/reproducible-output?tabs=pyton
  });

  return response;
}

const assignCompLevel = (compData, subjectData) => {
  // Assign comp_level based on distance to subject

  // Extract subject property data
  const subjectBed = subjectData.building.bedroomCount;
  const subjectBath = subjectData.building.calculatedBathroomCount;
  const subjectGla = subjectData.building.livingAreaSquareFeet;

  // Get current UTC date and helper function
  const today = new Date();

  function daysSince(dateStr) {
    const dt = new Date(dateStr);
    const diffTime = Math.abs(today - dt);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Add comp level 1-4
  compData.forEach((comp, i) => {
    const diffBed = Math.abs(comp.building.bedroomCount - subjectBed);
    const diffBath = Math.abs(
      comp.building.calculatedBathroomCount - subjectBath
    );
    const diffGla =
      (100 * Math.abs(comp.building.livingAreaSquareFeet - subjectGla)) /
      subjectGla;
    const daysSinceSale = daysSince(comp.listing.soldDate);
    const distance = comp.distanceToSubejct;

    let compLevel;

    if (distance === null) {
      compLevel = null;
    } else if (
      distance <= 0.5 &&
      daysSinceSale <= 90 &&
      diffGla <= 5 &&
      diffBed === 0 &&
      diffBath < 1
    ) {
      compLevel = 1;
    } else if (
      distance <= 1 &&
      daysSinceSale <= 180 &&
      diffGla <= 10 &&
      diffBed <= 1 &&
      diffBath <= 1
    ) {
      compLevel = 2;
    } else if (
      distance <= 3 &&
      daysSinceSale <= 365 &&
      diffGla <= 15 &&
      diffBed <= 2 &&
      diffBath <= 2
    ) {
      compLevel = 3;
    } else if (
      distance <= 10 &&
      daysSinceSale <= 730 &&
      diffGla <= 25 &&
      diffBed <= 3 &&
      diffBath <= 3
    ) {
      compLevel = 4;
    } else {
      compLevel = 5;
    }

    console.log("comp_level:", compLevel);
    comp.comp_level = compLevel;
  });

  return compData;
};

const computeValueEstimate_original = (subjectData, selectedComps) => {
  const subjectGla = subjectData.building.livingAreaSquareFeet;
  let compsPricePerSqft = [];
  let compsPricePerSqftMin = [];
  let compsPricePerSqftMax = [];
  let compsConfScore = [];
  let finalvaluation = {};

  selectedComps.forEach((comp) => {
    if (
      comp.valuation &&
      comp.building.livingAreaSquareFeet &&
      !isNaN(comp.building.livingAreaSquareFeet)
    ) {
      // Get AVM value
      if (
        typeof comp.valuation.estimatedValue === "number" &&
        !isNaN(comp.valuation.estimatedValue)
      ) {
        compsPricePerSqft.push(
          comp.valuation.estimatedValue / comp.building.livingAreaSquareFeet
        );
      }
      // Get Minimum AVM value
      if (
        typeof comp.valuation.priceRangeMin === "number" &&
        !isNaN(comp.valuation.priceRangeMin)
      ) {
        compsPricePerSqftMin.push(
          comp.valuation.priceRangeMin / comp.building.livingAreaSquareFeet
        );
      }
      // Get Maximum AVM value
      if (
        typeof comp.valuation.priceRangeMax === "number" &&
        !isNaN(comp.valuation.priceRangeMax)
      ) {
        compsPricePerSqftMax.push(
          comp.valuation.priceRangeMax / comp.building.livingAreaSquareFeet
        );
      }
      // Get confidence score
      if (
        typeof comp.valuation.confidenceScore === "number" &&
        !isNaN(comp.valuation.confidenceScore)
      ) {
        compsConfScore.push(comp.valuation.confidenceScore);
      }
    }
  });

  // Calculate final valuation
  if (compsPricePerSqft.length > 0) {
    const avgPricePerSqft =
      compsPricePerSqft.reduce((a, b) => a + b, 0) / compsPricePerSqft.length;
    finalvaluation.estimatedValue = avgPricePerSqft * subjectGla;
    finalvaluation.estimatedValue = finalvaluation.estimatedValue.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.estimatedValue = null;
  }
  // Caculate lower bound valuation
  if (compsPricePerSqftMin.length > 0) {
    const avgPricePerSqftMin =
      compsPricePerSqftMin.reduce((a, b) => a + b, 0) /
      compsPricePerSqftMin.length;
    finalvaluation.lowerBound = avgPricePerSqftMin * subjectGla;
    finalvaluation.lowerBound = finalvaluation.lowerBound.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.lowerBound = null;
  }
  // Caculate upper bound valuation
  if (compsPricePerSqftMax.length > 0) {
    const avgPricePerSqftMax =
      compsPricePerSqftMax.reduce((a, b) => a + b, 0) /
      compsPricePerSqftMax.length;
    finalvaluation.upperBound = avgPricePerSqftMax * subjectGla;
    finalvaluation.upperBound = finalvaluation.upperBound.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.upperBound = null;
  }

  // Caculate confidence score
  if (compsConfScore.length > 0) {
    finalvaluation.confidenceScore =
      compsConfScore.reduce((a, b) => a + b, 0) / compsConfScore.length;
    finalvaluation.confidenceScore = finalvaluation.confidenceScore.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.confidenceScore = null;
  }

  // Add As-Repair value and rehab estimate
  finalvaluation.estimatedValueAsRepair = finalvaluation.estimatedValue;
  finalvaluation.repairEstimate = 0; // Assuming no rehab

  // Add marketingTime and fairMarketMonthlyRent. TODO HH: Need to make these values dynamic
  finalvaluation.marketingTime = 60;
  finalvaluation.fairMarketMonthlyRent = 2800; // Assuming no rehab

  // Add estimatedValueDate as current date in ISO format
  finalvaluation.valuationEstimateDate = new Date().toISOString();

  return finalvaluation;
};

const computeValueEstimate = (compAnalysis) => {
  const subjectData = compAnalysis.subject;
  const selectedComps = compAnalysis.sold;
  const subjectGla = subjectData.values.livingArea;
  let compsPricePerSqft = [];
  let compsPricePerSqftMin = [];
  let compsPricePerSqftMax = [];
  let compsConfScore = [];
  let finalvaluation = {};

  selectedComps.forEach((comp) => {
    if (
      comp.valuation &&
      // comp.building.livingAreaSquareFeet &&
      !isNaN(comp.values.livingArea)
    ) {
      // Get AVM value
      if (
        typeof comp.valuation.estimatedValue === "number" &&
        !isNaN(comp.valuation.estimatedValue)
      ) {
        compsPricePerSqft.push(
          comp.valuation.estimatedValue / comp.values.livingArea
        );
      }
      // Get Minimum AVM value
      if (
        typeof comp.valuation.priceRangeMin === "number" &&
        !isNaN(comp.valuation.priceRangeMin)
      ) {
        compsPricePerSqftMin.push(
          comp.valuation.priceRangeMin / comp.values.livingArea
        );
      }
      // Get Maximum AVM value
      if (
        typeof comp.valuation.priceRangeMax === "number" &&
        !isNaN(comp.valuation.priceRangeMax)
      ) {
        compsPricePerSqftMax.push(
          comp.valuation.priceRangeMax / comp.values.livingArea
        );
      }
      // Get confidence score
      if (
        typeof comp.valuation.confidenceScore === "number" &&
        !isNaN(comp.valuation.confidenceScore)
      ) {
        compsConfScore.push(comp.valuation.confidenceScore);
      }
    }
  });

  // Calculate final valuation
  if (compsPricePerSqft.length > 0) {
    const avgPricePerSqft =
      compsPricePerSqft.reduce((a, b) => a + b, 0) / compsPricePerSqft.length;
    finalvaluation.estimatedValue = avgPricePerSqft * subjectGla;
    finalvaluation.estimatedValue = finalvaluation.estimatedValue.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.estimatedValue = null;
  }
  // Caculate lower bound valuation
  if (compsPricePerSqftMin.length > 0) {
    const avgPricePerSqftMin =
      compsPricePerSqftMin.reduce((a, b) => a + b, 0) /
      compsPricePerSqftMin.length;
    finalvaluation.lowerBound = avgPricePerSqftMin * subjectGla;
    finalvaluation.lowerBound = finalvaluation.lowerBound.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.lowerBound = null;
  }
  // Caculate upper bound valuation
  if (compsPricePerSqftMax.length > 0) {
    const avgPricePerSqftMax =
      compsPricePerSqftMax.reduce((a, b) => a + b, 0) /
      compsPricePerSqftMax.length;
    finalvaluation.upperBound = avgPricePerSqftMax * subjectGla;
    finalvaluation.upperBound = finalvaluation.upperBound.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.upperBound = null;
  }

  // Caculate confidence score
  if (compsConfScore.length > 0) {
    finalvaluation.confidenceScore =
      compsConfScore.reduce((a, b) => a + b, 0) / compsConfScore.length;
    finalvaluation.confidenceScore = finalvaluation.confidenceScore.toFixed(2); // Round to 2 decimal places
  } else {
    finalvaluation.confidenceScore = null;
  }

  // Add As-Repair value and rehab estimate
  finalvaluation.repairEstimate = 55000; // Assuming no rehab
  finalvaluation.estimatedValueAsRepair = (
    (finalvaluation.estimatedValue + finalvaluation.repairEstimate) *
    1.15
  ).toFixed(2);

  // Add marketingTime and fairMarketMonthlyRent. TODO HH: Need to make these values dynamic
  finalvaluation.marketingTime = 60;
  finalvaluation.fairMarketMonthlyRent = 2800; // Assuming no rehab

  // Add estimatedValueDate as current date in ISO format
  finalvaluation.valuationEstimateDate = new Date().toISOString();

  return finalvaluation;
};

// Main processing function
const selectComps = async (
  subjectDataTemp,
  compsDataTemp,
  saleTypes = ["sold", "list"],
  numCompsRequired = 3
) => {
  // Assign comp level to comps data
  let compsDataTempWithLevels = assignCompLevel(compsDataTemp, subjectDataTemp);

  // Define data categories
  const dataCategories = [
    "propertyRecordId",
    "address",
    "distanceToSubejct",
    "assessment",
    "building",
    "general",
    "legal",
    "lot",
    "sale",
    "tax",
    "valuation",
    "comp_level",
  ];
  const dataCategoriesSub = dataCategories.filter(
    (f) => f !== "distanceToSubejct" && f !== "comp_level"
  );

  // Process subject data
  const subjectData = {};
  dataCategoriesSub.forEach((category, i) => {
    subjectData[category] = subjectDataTemp[category];
  });

  // Process comps data
  const soldCompsData = [];
  const listCompsData = [];

  compsDataTempWithLevels.forEach((comp) => {
    const thisCompsData = {};
    dataCategories.forEach((category) => {
      thisCompsData[category] = comp[category];
    });

    if (comp.listing.status === "Sold") {
      soldCompsData.push(thisCompsData);
    } else if (["Active", "Pending"].includes(comp.listing.status)) {
      listCompsData.push(thisCompsData);
    }
  });

  // Load query and set initial parameters
  const queryOrig = fs.readFileSync(
    "src/utils/queryCompSelection.txt",
    "utf-8"
  );
  let selectedComps = { sold: [], list: [] };
  const dataFieldsForReporting = ["propertyRecordId", "comp_level"];

  for (const saleType of saleTypes) {
    let selectedCompsTemp = [];
    const compsData = saleType === "sold" ? soldCompsData : listCompsData;

    // Process comp levels
    for (let compLevel = 1; compLevel <= 5; compLevel++) {
      const compsDataByLevel = [];
      let query = queryOrig.replace(
        "@NUM_COMPS",
        String(numCompsRequired - selectedCompsTemp.length)
      );

      console.log(
        `Processing comp_level ${compLevel}: required number of comps = ${
          numCompsRequired - selectedCompsTemp.length
        }`
      );

      // Filter comps by level
      compsData.forEach((comp) => {
        if (comp.comp_level === compLevel) {
          compsDataByLevel.push(comp);
        }
      });

      if (compsDataByLevel.length === 0) {
        console.log(
          `No comparable properties found for comp_level ${compLevel}.`
        );
        continue;
      }

      console.log(
        `${compsDataByLevel.length} comparable properties available for comp_level ${compLevel}.`
      );

      // Prepare text data
      // const subjectText = Object.entries(subjectData)
      //   .map(([key, value]) => `${key}: ${value}`)
      //   .join("\n");
      const subjectText = JSON.stringify(subjectData);
      console.log("Subject property data:", subjectText);
      // const compsText = compsDataByLevel
      //   .map(
      //     (comp, i) =>
      //       `\n<Property ${i + 1}>\n${Object.entries(comp)
      //         .map(([key, value]) => `${key}: ${value}`)
      //         .join("\n")}\n</Property ${i + 1}>\n`
      //   )
      //   .join("");
      const compsText = compsDataByLevel
        .map(
          (comp, i) =>
            `\n<Property ${i + 1}>\n${JSON.stringify(comp)}\n</Property ${
              i + 1
            }>\n`
        )
        .join("");
      console.log("Comparable properties data:", compsText);

      // Get and process answer
      try {
        const answer = await ragQAndAReasoning(query, subjectText, compsText);
        console.log(answer.output_text);

        if (typeof answer.output_text === "string") {
          const answerJson = JSON.parse(answer.output_text);
          console.log(answerJson);

          answerJson.forEach((item) => {
            item.comp_level = compLevel;
          });

          selectedCompsTemp.push(...answerJson);

          if (selectedCompsTemp.length >= numCompsRequired) {
            console.log(
              `Selected ${selectedCompsTemp.length} comparable properties for comp_level ${compLevel}.`
            );
            break;
          }
        }
      } catch (error) {
        console.error(`Error processing comp_level ${compLevel}:`, error);
      }
    }

    // Add selected comps to final results
    selectedCompsTemp.forEach((comp, idx) => {
      Object.keys(comp).forEach((key) => {
        if (!dataFieldsForReporting.includes(key)) {
          delete comp[key];
        }
      });
    });

    selectedComps[saleType] = selectedCompsTemp;
  }

  // Compute the final valuation
  const valuationCompType = "sold";
  // Get building and valuation data from comps for the selected comps
  selectedComps[valuationCompType].forEach((comp) => {
    const match = compsDataTemp.find(
      (c) => c.propertyRecordId === comp.propertyRecordId
    );
    if (match) {
      comp.address = match.address;
      comp.building = match.building;
      comp.valuation = match.valuation;
    }
  });

  // TODO HH: maybe take this out of selectComps. Do this in runOrder so that adjustments are available
  // const finalvaluation = computeValueEstimate(
  //   subjectData,
  //   selectedComps[valuationCompType]
  // );
  // selectedComps.finalvaluation = finalvaluation;

  return selectedComps;
};

module.exports = {
  selectComps,
  computeValueEstimate,
};
