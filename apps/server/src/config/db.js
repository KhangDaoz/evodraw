
const path = require('path');
const dns = require('dns');
const { MongoClient, ServerApiVersion } = require('mongodb');

require('dotenv').config({
  path: path.resolve(__dirname, '../../.env')
});

// Some local DNS resolvers reject SRV queries required by mongodb+srv.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('Missing MONGODB_URI in apps/server/.env');
}
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);