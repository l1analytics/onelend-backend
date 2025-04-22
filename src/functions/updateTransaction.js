const { app } = require('@azure/functions');

app.http('updateTransaction', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const body =  await request.json();
        body['updated'] = true; // Simulate an update
        context.log(`Updated transaction: ${JSON.stringify(body)}`);

        return { body: JSON.stringify(body) };
    }
});
