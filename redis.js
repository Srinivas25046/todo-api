const { createClient } = require('redis');

const client = createClient({
  url: process.env.REDIS_URL,
});

client.on('error', (err) => console.error('Redis Client Error', err));

async function init() {
  await client.connect();
  const result = await client.ping();
  console.log('Redis PING response:', result);
}

init();

module.exports = client;