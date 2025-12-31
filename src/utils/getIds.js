export const getMaxId = async (context, clientId, container, idName) => {
  //   let query_string = `SELECT max(f.${idName}) FROM f where f.clientId = ${clientId}`;
  //   let query_string = `SELECT f.${idName} FROM f where f.clientId = ${clientId} order by f.${idName} DESC `;
  let query_string = `SELECT * FROM f where f.clientId = ${clientId}`;
  const querySpec = {
    query: query_string,
  };

  let results;

  try {
    const { resources: output } = await container.items
      .query(querySpec)
      .fetchAll();
    console.log(output);

    if (output) {
      results = output; // Using spread operator to push individual items
    } else {
      context.log(`No results found for requested clientId "${clientId}"`);
    }
  } catch (error) {
    context.log(
      `Error: getMaxId failed for ${idName}. ${error.message}`
    );
    throw error;
  }

  return results.length;
};

const getMax = (arr, prop) => {
    var max;
    for (var i=0 ; i<arr.length ; i++) {
        if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop]))
            max = arr[i];
    }
    return max[prop];
}