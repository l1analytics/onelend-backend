const { app } = require('@azure/functions');

app.http('getTransactions', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const name = request.query.get('name') || await request.text() || 'world';

        let transaction = {
            id: 1,
            amount: 100.0,
            date: '2023-10-01',
            description: 'Sample transaction'
        }

        return { body: JSON.stringify(transaction) };
    }
});
