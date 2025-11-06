const logs = require('./exported_data/webhook_logs.json');

const valid = logs.filter(l => l.webhook_id !== null && l.webhook_id !== undefined);

console.log('Total logs:', logs.length);
console.log('Logs válidos (con webhook_id):', valid.length);
console.log('Logs inválidos (webhook_id null):', logs.length - valid.length);
