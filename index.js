require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bkyaozu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("bracu-admin");
    const userCollection = db.collection("users");

    //register user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //Get all users
    app.get("/users", async (req, res) => {
      const { role } = req.query;
      const filter = role ? { role } : {};
      const result = await userCollection.find(filter).toArray();
      res.send(result);
    });

    //update user class
    // update user class
    app.patch("/users/:studentId/assign-supervisor", async (req, res) => {
      try {
        const { studentId } = req.params;
        const { supervisorId } = req.body;

        if (!ObjectId.isValid(studentId) || !ObjectId.isValid(supervisorId)) {
          return res
            .status(400)
            .send({ message: "Invalid studentId or supervisorId" });
        }

        // Ensure supervisor exists and is a supervisor
        const supervisor = await userCollection.findOne({
          _id: new ObjectId(supervisorId),
          role: "supervisor",
        });
        if (!supervisor)
          return res.status(404).send({ message: "Supervisor not found" });

        // Ensure student exists and is a student
        const student = await userCollection.findOne({
          _id: new ObjectId(studentId),
          role: "student",
        });
        if (!student)
          return res.status(404).send({ message: "Student not found" });

        const prevSupervisorId = student.assignedSupervisor?.toString();

        // 1) Update student's assignedSupervisor
        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          { $set: { assignedSupervisor: new ObjectId(supervisorId) } }
        );

        // 2) Add student to the new supervisor's students array
        await userCollection.updateOne(
          { _id: new ObjectId(supervisorId) },
          { $addToSet: { students: new ObjectId(studentId) } }
        );

        // 3) If reassigned, remove from old supervisor's students list
        if (prevSupervisorId && prevSupervisorId !== supervisorId) {
          await userCollection.updateOne(
            { _id: new ObjectId(prevSupervisorId) },
            { $pull: { students: new ObjectId(studentId) } }
          );
        }

        res.send({ ok: true });
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Unassign supervisor from a student
    app.patch("/users/:studentId/unassign-supervisor", async (req, res) => {
      try {
        const { studentId } = req.params;

        if (!ObjectId.isValid(studentId)) {
          return res.status(400).send({ message: "Invalid studentId" });
        }

        // Ensure student exists and is a student
        const student = await userCollection.findOne({
          _id: new ObjectId(studentId),
          role: "student",
        });
        if (!student) {
          return res.status(404).send({ message: "Student not found" });
        }

        const prevSupervisorId = student.assignedSupervisor?.toString();

        // 1) Unset student's assignedSupervisor
        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          { $unset: { assignedSupervisor: "" } }
        );

        // 2) Remove student from previous supervisor's students list
        if (prevSupervisorId) {
          await userCollection.updateOne(
            { _id: new ObjectId(prevSupervisorId), role: "supervisor" },
            { $pull: { students: new ObjectId(studentId) } }
          );
        }

        res.send({ ok: true });
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Mongo error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Bracu research server is running!"));
app.listen(port, () => console.log(`Server is running on port ${port}`));
