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
    const announcementsCollection = db.collection("announcements");
    const proposalsCollection = db.collection("proposals");
    const groupsCollection = db.collection("groups");

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
    // Get single user by ObjectId
    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }
      const user = await userCollection.findOne({ _id: new ObjectId(id) });
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send(user);
    });
    // Update only name and photoUrl for a user
    app.patch("/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid user id" });
        }

        const { name, photoUrl } = req.body;

        // validate and prepare update fields (only allow these two fields)
        const updateFields = {};
        if (typeof name === "string" && name.trim() !== "")
          updateFields.name = name.trim();
        if (typeof photoUrl === "string")
          updateFields.photoUrl = photoUrl.trim();

        if (Object.keys(updateFields).length === 0) {
          return res
            .status(400)
            .send({ message: "No valid fields to update." });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found." });
        }

        const updatedUser = await userCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, updatedUser });
      } catch (err) {
        console.error("PATCH /users/:id error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    // Delete user
    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send({ message: "User deleted" });
    });
    // Get only supervisors
    app.get("/supervisors", async (req, res) => {
      try {
        const supervisors = await userCollection
          .find({ role: "supervisor" })
          .toArray();
        res.send(supervisors);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch supervisors" });
      }
    });

    // Post announcement
    app.post("/announcements", async (req, res) => {
      try {
        const announcement = req.body;
        announcement.createdAt = new Date();
        const result = await announcementsCollection.insertOne(announcement);
        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to create announcement" });
      }
    });

    // Get all announcements
    app.get("/announcements", async (req, res) => {
      try {
        const announcements = await announcementsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(announcements);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch announcements" });
      }
    });

    // Group

    // Get single user by ObjectId
    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }
      const user = await userCollection.findOne({ _id: new ObjectId(id) });
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send(user);
    });

    // Get a group by admin (for the UI gate)
    app.get("/groups/by-admin/:adminId", async (req, res) => {
      try {
        const { adminId } = req.params;
        if (!ObjectId.isValid(adminId)) {
          return res.status(400).send({ message: "Invalid adminId" });
        }
        const group = await groupsCollection.findOne({
          admin: new ObjectId(adminId),
        });
        if (!group) return res.status(404).send({ message: "Not found" });
        res.send(group);
      } catch (err) {
        console.error("GET /groups/by-admin/:adminId error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/groups", async (req, res) => {
      try {
        const { name, adminId, researchInterests } = req.body || {};

        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).send({ message: "Group name is required" });
        }
        if (!ObjectId.isValid(adminId)) {
          return res.status(400).send({ message: "Invalid adminId" });
        }
        if (
          !Array.isArray(researchInterests) ||
          researchInterests.length === 0
        ) {
          return res
            .status(400)
            .send({ message: "At least one research interest is required" });
        }

        // ensure admin exists and is a student
        const admin = await userCollection.findOne({
          _id: new ObjectId(adminId),
          role: "student",
        });
        if (!admin) {
          return res.status(404).send({ message: "Admin (student) not found" });
        }

        // normalize interests
        const normInterests = Array.from(
          new Set(
            researchInterests
              .filter((x) => typeof x === "string")
              .map((x) => x.trim())
              .filter(Boolean)
          )
        );

        const doc = {
          name: name.trim(),
          admin: new ObjectId(adminId),
          members: [new ObjectId(adminId)], // creator is the first member
          researchInterests: normInterests,
          assignedSupervisor: null,
          proposalsSubmittedTo: [],
          maxMembers: 5,
        };
        const existing = await groupsCollection.findOne({
          admin: new ObjectId(adminId),
        });
        if (existing) {
          return res
            .status(409)
            .send({ message: "You have already created a group." });
        }
        const result = await groupsCollection.insertOne(doc);
        const created = await groupsCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({ success: true, group: created });
      } catch (err) {
        console.error("POST /groups error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // find groups

    // List all groups (lightweight projection if you want)
    app.get("/groups", async (req, res) => {
      try {
        const groups = await groupsCollection
          .find({})
          .project({
            name: 1,
            admin: 1,
            members: 1,
            researchInterests: 1,
            assignedSupervisor: 1,
            proposalsSubmittedTo: 1,
            maxMembers: 1,
          })
          .toArray();
        res.send(groups);
      } catch (err) {
        console.error("GET /groups error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/groups/:groupId/join", async (req, res) => {
      try {
        const { groupId } = req.params;
        const { studentId } = req.body || {};

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(studentId)) {
          return res
            .status(400)
            .send({ message: "Invalid groupId or studentId" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).send({ message: "Group not found" });

        const studentObjId = new ObjectId(studentId);

        // Ensure student exists & is a student
        const student = await userCollection.findOne({
          _id: studentObjId,
          role: "student",
        });
        if (!student)
          return res.status(404).send({ message: "Student not found" });

        // Block admin from joining their own group
        if (String(group.admin) === String(studentObjId)) {
          return res.status(403).send({
            message: "Group admin cannot join the group they created",
          });
        }

        // Already a member?
        if (group.members.some((m) => String(m) === String(studentObjId))) {
          return res
            .status(409)
            .send({ message: "You are already a member of this group" });
        }

        // Full?
        if ((group.members?.length || 0) >= (group.maxMembers || 5)) {
          return res.status(409).send({ message: "This group is full" });
        }

        // Add to members
        const upd = await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $addToSet: { members: studentObjId } }
        );

        if (!upd.matchedCount) {
          return res.status(500).send({ message: "Failed to join group" });
        }

        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.send({ success: true, group: updated });
      } catch (err) {
        console.error("PATCH /groups/:groupId/join error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/groups/by-member/:studentId", async (req, res) => {
      try {
        const { studentId } = req.params;
        if (!ObjectId.isValid(studentId)) {
          return res.status(400).send({ message: "Invalid studentId" });
        }
        const group = await groupsCollection.findOne({
          members: new ObjectId(studentId),
        });
        if (!group) return res.status(404).send({ message: "Not found" });
        res.send(group);
      } catch (err) {
        console.error("GET /groups/by-member/:studentId error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/groups", async (req, res) => {
      try {
        const { name, adminId, researchInterests } = req.body || {};

        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).send({ message: "Group name is required" });
        }
        if (!ObjectId.isValid(adminId)) {
          return res.status(400).send({ message: "Invalid adminId" });
        }
        if (
          !Array.isArray(researchInterests) ||
          researchInterests.length === 0
        ) {
          return res
            .status(400)
            .send({ message: "At least one research interest is required" });
        }

        // ensure admin exists and is a student
        const admin = await userCollection.findOne({
          _id: new ObjectId(adminId),
          role: "student",
        });
        if (!admin) {
          return res.status(404).send({ message: "Admin (student) not found" });
        }

        // already created a group?
        const existingAsAdmin = await groupsCollection.findOne({
          admin: new ObjectId(adminId),
        });
        if (existingAsAdmin) {
          return res
            .status(409)
            .send({ message: "You have already created a group." });
        }

        // already member of any group?
        const existingAsMember = await groupsCollection.findOne({
          members: new ObjectId(adminId),
        });
        if (existingAsMember) {
          return res
            .status(409)
            .send({ message: "You already belong to a group." });
        }

        const normInterests = Array.from(
          new Set(
            researchInterests
              .filter((x) => typeof x === "string")
              .map((x) => x.trim())
              .filter(Boolean)
          )
        );

        const doc = {
          name: name.trim(),
          admin: new ObjectId(adminId),
          members: [new ObjectId(adminId)],
          researchInterests: normInterests,
          assignedSupervisor: null,
          proposalsSubmittedTo: [],
          maxMembers: 5,
        };

        const result = await groupsCollection.insertOne(doc);
        const created = await groupsCollection.findOne({
          _id: result.insertedId,
        });
        res.status(201).send({ success: true, group: created });
      } catch (err) {
        console.error("POST /groups error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/groups/:groupId/join", async (req, res) => {
      try {
        const { groupId } = req.params;
        const { studentId } = req.body || {};

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(studentId)) {
          return res
            .status(400)
            .send({ message: "Invalid groupId or studentId" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).send({ message: "Group not found" });

        const studentObjId = new ObjectId(studentId);

        const student = await userCollection.findOne({
          _id: studentObjId,
          role: "student",
        });
        if (!student)
          return res.status(404).send({ message: "Student not found" });

        // already belongs to any group?
        const belongsSomewhere = await groupsCollection.findOne({
          members: studentObjId,
        });
        if (belongsSomewhere) {
          return res
            .status(409)
            .send({ message: "You already belong to a group." });
        }

        if (String(group.admin) === String(studentObjId)) {
          return res
            .status(403)
            .send({
              message: "Group admin cannot join the group they created",
            });
        }

        if (group.members.some((m) => String(m) === String(studentObjId))) {
          return res
            .status(409)
            .send({ message: "You are already a member of this group" });
        }

        if ((group.members?.length || 0) >= (group.maxMembers || 5)) {
          return res.status(409).send({ message: "This group is full" });
        }

        const upd = await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $addToSet: { members: studentObjId } }
        );

        if (!upd.matchedCount) {
          return res.status(500).send({ message: "Failed to join group" });
        }

        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.send({ success: true, group: updated });
      } catch (err) {
        console.error("PATCH /groups/:groupId/join error:", err);
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
