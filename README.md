# OneLend Backend API Documentation

This repository contains Azure Functions that provide the backend API for the OneLend property valuation system. The API handles property data lookup, order management, transaction processing, and automated valuation modeling (AVM).

## Architecture Overview

The backend system uses:
- **Azure Functions** for serverless compute
- **Azure Cosmos DB** for data storage (containers: transactions, orders, reporting, batchData, comps)
- **External BatchData API** for property information lookup
- **Azure Blob Storage** for file storage

## API Reference

### 1. Batch Data APIs

#### 1.1 Call Batch Data API
**Endpoint:** `POST /api/callBatchDataApi/{action}`
**Description:** Proxy API to interact with external BatchData service for property lookups and searches.

**Parameters:**
- `action` (path parameter): Either "lookup" or "search"

**Request Body:**
- For `lookup`: Array of address objects
- For `search`: Object with `searchCriteria` and optional `options`

**Example Request (Lookup):**
```json
[
  {
    "address": {
      "street": "123 Main St",
      "city": "Anytown", 
      "state": "CA",
      "zip": "90210"
    }
  }
]
```

**Example Request (Search):**
```json
{
  "searchCriteria": {
    "compAddress": {
      "street": "123 Main St",
      "city": "Anytown",
      "state": "CA", 
      "zip": "90210"
    }
  },
  "options": {
    "skip": 0,
    "take": 30,
    "useDistance": true,
    "distanceMiles": 2.0
  }
}
```

**Response:** Property data from BatchData API

#### 1.2 Lookup Batch Data API
**Endpoint:** `POST /api/lookupBatchDataApi`
**Description:** Direct property lookup using BatchData API.

**Request Body:** Array of address objects (same as callBatchDataApi/lookup)

**Response:** Property information for requested addresses

#### 1.3 Query Stored Batch Data
**Endpoint:** `POST /api/queryStoredBatchData`
**Description:** Retrieve previously stored property data from Cosmos DB.

**Request Body:** Array of property record IDs
```json
["property-id-1", "property-id-2"]
```

**Response:** Array of stored property records

### 2. Order Management APIs

#### 2.1 Create Order
**Endpoint:** `POST /api/createOrder`
**Description:** Create a new property valuation order with optional transaction creation.

**Required Fields (new transaction):**
- `clientId` (number)
- `streetAddress` (string)
- `city` (string)
- `state` (string)
- `zip` (string)
- `productType` (string)

**Required Fields (existing transaction):**
- `clientId` (number)
- `transactionId` (number)
- `productType` (string)

**Optional Fields:**
- `clientOrderId` (string)
- `compsOptions` (object):
  - `numComps` (number, default: 20)
  - `compType` (string, default: "Both" - options: "Sold", "List", "Both")

**Example Request:**
```json
{
  "clientId": 123,
  "streetAddress": "123 Main St",
  "city": "Anytown",
  "state": "CA",
  "zip": "90210",
  "productType": "AVM Report",
  "clientOrderId": "CLIENT-ORDER-001",
  "compsOptions": {
    "numComps": 15,
    "compType": "Both"
  }
}
```

**Response:**
```json
{
  "message": "Order successfully created",
  "clientId": 123,
  "transactionId": 1,
  "orderId": 1,
  "productType": "AVM Report",
  "status": "Pending",
  "clientOrderId": "CLIENT-ORDER-001",
  "streetAddress": "123 Main St",
  "city": "Anytown", 
  "state": "CA",
  "zip": "90210",
  "dateCreated": "2024-01-01T12:00:00.000Z",
  "numSoldComps": 10,
  "numActiveComps": 5
}
```

#### 2.2 Get Order
**Endpoint:** `POST /api/getOrder`
**Description:** Retrieve order information by client ID and optional order ID.

**Required Fields:**
- `clientId` (number or array of numbers)

**Optional Fields:**
- `orderId` (number or array of numbers)
- `getPropertyData` (boolean) - if true, includes property and comps data

**Example Request:**
```json
{
  "clientId": 123,
  "orderId": [1, 2, 3],
  "getPropertyData": true
}
```

**Response:** Array of order objects with optional property data

#### 2.3 Run Order
**Endpoint:** `POST /api/runOrder`
**Description:** Execute automated valuation modeling on an existing order.

**Required Fields:**
- `propertyRecordId` (string)
- `compsRecordIds` (array of strings)
- `reportRecordId` (string)
- `clientId` (number)
- `orderId` (number)

**Response:** Complete report data with valuation results

#### 2.4 Get Batch Data
**Endpoint:** `POST /api/getBatchData`
**Description:** Quick BatchData retrieval that creates order and returns property/comps data immediately.

**Required Fields:**
- `clientId` (number)
- `streetAddress` (string)
- `city` (string)
- `state` (string)
- `zip` (string)
- `productType` (string)

**Optional Fields:**
- `transactionId` (number)
- `clientOrderId` (string)
- `compsOptions` (object)

**Response:** Order details with property data and comparables

### 3. Transaction Management APIs

#### 3.1 Create Transaction
**Endpoint:** `POST /api/createTransaction`
**Description:** Create a new transaction record.

**Required Fields:**
- `clientId` (number)
- `streetAddress` (string)
- `city` (string)
- `state` (string)
- `zip` (string)

**Optional Fields:**
- `clientOrderId` (string)

**Example Request:**
```json
{
  "clientId": 123,
  "streetAddress": "123 Main St",
  "city": "Anytown",
  "state": "CA",
  "zip": "90210",
  "clientOrderId": "TX-001"
}
```

**Response:**
```json
{
  "message": "Transaction successfully created",
  "clientId": 123,
  "transactionId": 1,
  "streetAddress": "123 Main St",
  "city": "Anytown",
  "state": "CA",
  "zipCode": "90210",
  "dateCreated": "2024-01-01T12:00:00.000Z"
}
```

#### 3.2 Update Transaction
**Endpoint:** `POST /api/updateTransaction`
**Description:** Update an existing transaction (simple implementation).

**Request Body:** Transaction object to update

**Response:** Updated transaction with `updated: true` flag

#### 3.3 Get Transactions (Demo)
**Endpoint:** `GET /api/getTransactions`
**Description:** Demo endpoint that reads from blob storage.

**Query Parameters:**
- `name` (optional)

**Response:** Sample transaction data from blob storage

#### 3.4 Get Transactions DB (Demo)
**Endpoint:** `GET /api/getTransactionsDB`
**Description:** Demo endpoint that creates and retrieves a fake product record.

**Response:** Generated fake product data

### 4. Reporting APIs

#### 4.1 Get Report
**Endpoint:** `POST /api/getReport`
**Description:** Retrieve a complete valuation report.

**Required Fields:**
- `reportRecordId` (string)

**Example Request:**
```json
{
  "reportRecordId": "report-uuid-123"
}
```

**Response:** Complete report object with property data, comps, and valuation results

#### 4.2 Upsert Report
**Endpoint:** `POST /api/upsertReport`
**Description:** Create or update report data in the database.

**Request Body:** Complete report object

**Response:** Success message with report record ID

#### 4.3 Run Interactive AVM
**Endpoint:** `POST /api/runInteractiveAvm`
**Description:** Run automated valuation with user-selected comparables.

**Request Body:** Report data object with selected comps

**Response:** Updated report with new valuation estimate

## Data Models

### Order Object
```json
{
  "id": "uuid",
  "orderRecordId": "uuid",
  "orderId": 1,
  "clientId": 123,
  "transactionId": 1,
  "clientOrderId": "CLIENT-ORDER-001",
  "streetAddress": "123 Main St",
  "city": "Anytown",
  "state": "CA",
  "zip": "90210",
  "productType": "AVM Report",
  "dateCreated": "2024-01-01T12:00:00.000Z",
  "status": "Pending",
  "fipsCodePlusApn": "12345+67890",
  "propertyRecordId": "property-uuid",
  "propertyRecordDate": "2024-01-01T12:00:00.000Z",
  "compsRecordIds": ["comp1-uuid", "comp2-uuid"],
  "reportRecordId": "report-uuid"
}
```

### Transaction Object
```json
{
  "id": "uuid",
  "transactionId": 1,
  "clientId": 123,
  "clientOrderId": "CLIENT-ORDER-001",
  "streetAddress": "123 Main St",
  "city": "Anytown", 
  "state": "CA",
  "zip": "90210",
  "dateCreated": "2024-01-01T12:00:00.000Z",
  "orderId": [1, 2],
  "productType": ["AVM Report", "Property Data"],
  "fipsCodePlusApn": "12345+67890"
}
```

## Error Responses

All APIs return standardized error responses:

```json
{
  "error": "Error description"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required fields, invalid JSON)
- `500` - Internal Server Error (database connection issues)

## Environment Variables

Required configuration:
- `COSMOSDB_ENDPOINT` - Cosmos DB endpoint URL
- `DATABASE_NAME` - Cosmos DB database name  
- `ENDPOINT_BATCH_DATA` - External BatchData API endpoint
- `KEY_BATCH_DATA` - External BatchData API key
- `AzureWebJobsStorage` - Azure Storage connection string

## Development Setup

1. Install dependencies: `npm install`
2. Configure local.settings.json with required environment variables
3. Start Azure Functions runtime: `func host start --javascript`

## Container Structure

The system uses the following Cosmos DB containers:
- **transactions** - Transaction records
- **orders** - Order records  
- **reporting** - Report and valuation data
- **batchData** - Cached property data
- **comps** - Comparable property data