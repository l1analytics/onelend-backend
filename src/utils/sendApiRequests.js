const axios = require("axios");

/**
 * Make a POST request with error handling
 * @param {string} url - The endpoint URL
 * @param {Object} data - The request payload
 * @param {Object} options - Additional axios options (headers, timeout, etc.)
 * @returns {Promise<any>} Response data
 */
const postRequest = async (context, url, data, options = {}) => {
  try {
    const config = {
      method: "post",
      url,
      data,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      timeout: options.timeout || 5000,
      ...options,
    };

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      context.log(
        `Error: ${error.response.status} - ${
          error.response.data.message || error.message
        }`
      );
      throw new Error({
        status: error.response.status,
        message: error.response.data.message || error.message,
        data: error.response.data,
      });
    } else if (error.request) {
      context.log(`Error: No response received from "${request.url}"`);
      throw new Error("Network error: No response received");
    } else {
      context.log(
        `Error: Request failed for "${request.url}. Error: ${error.message}`
      );
      throw new Error(`Request failed: ${error.message}`);
    }
  }
};

module.exports = {
  postRequest,
};
