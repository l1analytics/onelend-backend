// /const { app } = require('@azure/functions');

const { app, input} = require('@azure/functions');
const { DefaultAzureCredential }  = require('@azure/identity');
const { CosmosClient }  = require('@azure/cosmos');
const { faker } = require('@faker-js/faker');



app.http('getTransactionsDB', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const credential = new DefaultAzureCredential();

        const client = new CosmosClient({
            endpoint: 'https://cosmos-onelend-dev.documents.azure.com:443/',
            aadCredentials: credential
        });

        const database = client.database('cosmicworks');

        const container = database.container('products');

        const uniqueId = faker.string.uuid();
        const category = faker.commerce.product();

        const item = {
            'id': uniqueId,
            'category': category,
            'name': faker.internet.username(),
            'quantity': faker.number.int({ min: 1, max: 100 }),
            'description': faker.lorem.paragraph(),
            'price': faker.finance.amount({ min: 1, max: 1000, dec: 2 }),
            'clearance': faker.number.int({ min: 0, max: 1 }),
        };
        
        let responseContainer = await container.items.upsert(item);


        const partitionKey = category;

        let responseItem = await container.item(uniqueId, partitionKey).read();
        let read_item = responseItem.resource;

        return { body: JSON.stringify(read_item) };
    }
});
