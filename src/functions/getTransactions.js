// /const { app } = require('@azure/functions');

const { app, input} = require('@azure/functions');

const blobInput = input.storageBlob({
    path: 'auth/cedar-example.json',
    connection: 'AzureWebJobsStorage', 
});


app.http('getTransactions', {
    methods: ['GET'],
    authLevel: 'anonymous',
    extraInputs: [blobInput],
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const name = request.query.get('name') || await request.text() || 'world';

        let transaction = {
            id: 1,
            amount: 100.0,
            date: '2023-10-01',
            description: 'Sample transaction'
        }

        transaction = context.extraInputs.get(blobInput);
        context.log(`Blob input: ${JSON.stringify(transaction)}`);

        return { body: JSON.stringify(transaction) };
    }
});
