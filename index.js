require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bkyaozu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    await client.connect();
    const db = client.db("bracu-admin");
    const userCollection = db.collection("users");
    // const supervisorCollection = db.collection("supervisors");

    // Route for user registration
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log("user added:", user);
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Route for supervisor registration
    // app.post("/supervisors", async (req, res) => { 
    //   const supervisor = req.body;
    //   console.log("Supervisor added:", supervisor);
    //   const result = await supervisorCollection.insertOne(supervisor);
    //   res.send(result);
    // });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

// Start the server after connecting to MongoDB
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Bracu research server is running!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});