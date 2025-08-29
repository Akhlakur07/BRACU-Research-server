require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const axios = require("axios");
const xml2js = require("xml2js");

const app = express();
const port = process.env.PORT || 3000;

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
    const faqsCollection = db.collection("faqs");
    const meetingsCollection = db.collection("meetings");

    //register user
    app.post("/users", async (req, res) => {
      const user = {
        ...req.body,
        notifications: [],
        isSeen: true,
        joinRequests: [],
      };
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

    app.get("/profile/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const student = await userCollection.findOne(
          { _id: new ObjectId(id) },
          { projection: { password: 0 } }
        );

        if (!student)
          return res.status(404).json({ message: "Profile not found" });

        res.json(student);
      } catch (err) {
        console.error("Profile fetch error:", err);
        res.status(500).json({ message: "Error fetching profile" });
      }
    });

    app.put("/profile/update/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const allowedFields = [
          "name",
          "studentId",
          "department",
          "phone",
          "cgpa",
          "creditsCompleted",
          "researchInterest",
          "photoUrl",
        ];
        const updateData = {};

        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
          }
        }

        if (updateData.name && updateData.name.trim().length < 2) {
          return res
            .status(400)
            .json({ message: "Name must be at least 2 characters" });
        }

        if (updateData.cgpa && (updateData.cgpa < 0 || updateData.cgpa > 4)) {
          return res
            .status(400)
            .json({ message: "CGPA must be between 0 and 4" });
        }

        if (updateData.creditsCompleted && updateData.creditsCompleted < 0) {
          return res
            .status(400)
            .json({ message: "Credits must be a positive number" });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Profile not found" });
        }

        const updated = await userCollection.findOne(
          { _id: new ObjectId(id) },
          { projection: { password: 0 } }
        );

        res.json(updated);
      } catch (err) {
        console.error("Profile update error:", err);
        res.status(500).json({ message: "Error updating profile" });
      }
    });

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

    app.get("/supervisor/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const supervisor = await userCollection.findOne(
          { _id: new ObjectId(id), role: "supervisor" },
          { projection: { password: 0 } } 
        );

        if (!supervisor) {
          return res.status(404).json({ message: "Supervisor not found" });
        }

        res.json(supervisor);
      } catch (err) {
        console.error("Error fetching supervisor:", err);
        res.status(500).json({ message: "Error fetching supervisor" });
      }
    });

    app.put("/supervisor/update/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }
        const allowedFields = [
          "name",
          "department",
          "phone",
          "researchArea",
          "photoUrl",
        ];

        const updateData = {};
        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
          }
        }

        if (updateData.name && updateData.name.trim().length < 2) {
          return res
            .status(400)
            .json({ message: "Name must be at least 2 characters" });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id), role: "supervisor" },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ message: "Supervisor profile not found" });
        }

        const updatedSupervisor = await userCollection.findOne(
          { _id: new ObjectId(id) },
          { projection: { password: 0 } }
        );

        res.json(updatedSupervisor);
      } catch (err) {
        console.error("Supervisor profile update error:", err);
        res.status(500).json({ message: "Error updating supervisor profile" });
      }
    });
    app.put("/users/:id/notifications/seen", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isSeen: true } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update notifications" });
      }
    });

    app.post("/announcements", async (req, res) => {
      try {
        const announcement = req.body;
        announcement.createdAt = new Date();
        const result = await announcementsCollection.insertOne(announcement);
        const notification = {
          message: `New announcement: ${announcement.title}`,
          date: new Date(),
          link: "/view-announcement",
        };

        await userCollection.updateMany(
          { role: { $in: ["student", "supervisor"] } },
          {
            $push: { notifications: notification },
            $set: { isSeen: false },
          }
        );

        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to create announcement" });
      }
    });

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

        const admin = await userCollection.findOne({
          _id: new ObjectId(adminId),
          role: "student",
        });
        if (!admin) {
          return res.status(404).send({ message: "Admin (student) not found" });
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

    app.get("/groups/:id", async (req, res) => {
      try {
        const groupId = req.params.id;

        if (!ObjectId.isValid(groupId)) {
          return res.status(400).send({ message: "Invalid group ID" });
        }

        const group = await groupsCollection.findOne(
          { _id: new ObjectId(groupId) },
          {
            projection: {
              name: 1,
              admin: 1,
              members: 1,
              researchInterests: 1,
              assignedSupervisor: 1,
              proposalsSubmittedTo: 1,
              maxMembers: 1,
            },
          }
        );

        if (!group) {
          return res.status(404).send({ message: "Group not found" });
        }

        res.send(group);
      } catch (err) {
        console.error("GET /groups/:id error:", err);
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

        const admin = await userCollection.findOne({
          _id: new ObjectId(adminId),
          role: "student",
        });
        if (!admin) {
          return res.status(404).send({ message: "Admin (student) not found" });
        }

        const existingAsAdmin = await groupsCollection.findOne({
          admin: new ObjectId(adminId),
        });
        if (existingAsAdmin) {
          return res
            .status(409)
            .send({ message: "You have already created a group." });
        }

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
        const belongsSomewhere = await groupsCollection.findOne({
          members: studentObjId,
        });
        if (belongsSomewhere) {
          return res
            .status(409)
            .send({ message: "You already belong to a group." });
        }

        if (String(group.admin) === String(studentObjId)) {
          return res.status(403).send({
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
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingJoinRequests: { studentId: studentObjId } } }
        );
        await userCollection.updateOne(
          { _id: studentObjId },
          { $set: { joinRequests: [] } }
        );
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingInvites: { studentId: studentObjId } } }
        );

        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.send({ success: true, group: updated });
      } catch (err) {
        console.error("PATCH /groups/:groupId/join error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/proposals", async (req, res) => {
      try {
        const {
          title,
          abstract,
          domain,
          supervisor,
          driveLink,
          studentId,
          groupId,
          adminapproved,
          supervisorapproved,
          groupName,
        } = req.body;

        if (
          !ObjectId.isValid(studentId) ||
          !ObjectId.isValid(groupId) ||
          !ObjectId.isValid(supervisor)
        ) {
          return res.status(400).send({ message: "Invalid IDs provided" });
        }
        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) {
          return res.status(404).send({ message: "Group not found" });
        }
        if (String(group.admin) !== String(studentId)) {
          return res
            .status(403)
            .send({ message: "Only group creators can submit proposals" });
        }
        if (group.assignedSupervisor) {
          return res.status(403).send({
            message:
              "This group already has an assigned supervisor. You cannot submit more proposals.",
          });
        }
        const proposal = {
          title: title.trim(),
          abstract: abstract.trim(),
          domain,
          supervisor: new ObjectId(supervisor),
          driveLink,
          studentId: new ObjectId(studentId),
          groupId: new ObjectId(groupId),
          createdAt: new Date(),
          status: "Pending",
          adminapproved: adminapproved || false,
          supervisorapproved: supervisorapproved || false,
          groupName: groupName,
        };

        const result = await proposalsCollection.insertOne(proposal);
        await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $addToSet: { proposalsSubmittedTo: new ObjectId(supervisor) } }
        );

        res.status(201).send({
          success: true,
          proposalId: result.insertedId,
          message: "Proposal submitted successfully",
        });
      } catch (err) {
        console.error("POST /proposals error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/proposals", async (req, res) => {
      try {
        const { supervisorId, studentId, groupId, status } = req.query;
        const filter = {};

        if (supervisorId) {
          if (!ObjectId.isValid(supervisorId)) {
            return res.status(400).send({ message: "Invalid supervisorId" });
          }
          filter.supervisor = new ObjectId(supervisorId);
        }

        if (studentId) {
          if (!ObjectId.isValid(studentId)) {
            return res.status(400).send({ message: "Invalid studentId" });
          }
          filter.studentId = new ObjectId(studentId);
        }

        if (groupId) {
          if (!ObjectId.isValid(groupId)) {
            return res.status(400).send({ message: "Invalid groupId" });
          }
          filter.groupId = new ObjectId(groupId);
        }

        if (status) {
          filter.status = String(status);
        }

        if (!supervisorId && !studentId && !groupId && !status) {
          return res.status(400).send({ message: "Missing query parameter" });
        }
        const proposals = await proposalsCollection
          .aggregate([
            { $match: filter },
            { $sort: { createdAt: -1 } },
            {
              $lookup: {
                from: "users",
                localField: "supervisor",
                foreignField: "_id",
                as: "supervisorInfo",
              },
            },
            {
              $addFields: {
                supervisorName: {
                  $ifNull: [
                    { $arrayElemAt: ["$supervisorInfo.name", 0] },
                    null,
                  ],
                },
                supervisorEmail: {
                  $ifNull: [
                    { $arrayElemAt: ["$supervisorInfo.email", 0] },
                    null,
                  ],
                },
              },
            },
            { $project: { supervisorInfo: 0 } },
          ])
          .toArray();

        res.status(200).send(proposals);
      } catch (err) {
        console.error("GET /proposals error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/proposals/:id/decision", async (req, res) => {
      try {
        const { id } = req.params;
        const { supervisorId, decision } = req.body || {};

        if (!ObjectId.isValid(id) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }
        if (!["approve", "reject"].includes(String(decision))) {
          return res.status(400).send({ message: "Decision must be 'approve' or 'reject'" });
        }

        const proposal = await proposalsCollection.findOne({ _id: new ObjectId(id) });
        if (!proposal) return res.status(404).send({ message: "Proposal not found" });

        if (String(proposal.supervisor) !== String(supervisorId)) {
          return res.status(403).send({ message: "Not authorized to decide this proposal" });
        }

        if (proposal.status !== "Pending") {
          return res.status(409).send({ message: "Proposal has already been decided" });
        }

        let newFields = {
          status: decision === "approve" ? "Approved" : "Rejected",
          supervisorapproved: decision === "approve",
          decidedAt: new Date(),
        };

        if (decision === "approve" && ObjectId.isValid(proposal.groupId)) {
          await groupsCollection.updateOne(
            { _id: new ObjectId(proposal.groupId) },
            { $set: { assignedSupervisor: new ObjectId(supervisorId) } }
          );
          await proposalsCollection.deleteMany({
            groupId: new ObjectId(proposal.groupId),
            _id: { $ne: new ObjectId(id) },
          });
        }

        await proposalsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: newFields }
        );

        const updated = await proposalsCollection.findOne({ _id: new ObjectId(id) });
        res.send({ success: true, proposal: updated });
      } catch (err) {
        console.error("PATCH /proposals/:id/decision error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // PATCH: Supervisor feedback (new)
    app.patch("/proposals/:id/feedback", async (req, res) => {
      try {
        const { id } = req.params;
        const { supervisorId, text } = req.body || {};

        if (!ObjectId.isValid(id) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }
        if (!text || !text.trim()) {
          return res.status(400).send({ message: "Feedback cannot be empty" });
        }

        const proposal = await proposalsCollection.findOne({ _id: new ObjectId(id) });
        if (!proposal) return res.status(404).send({ message: "Proposal not found" });

        if (String(proposal.supervisor) !== String(supervisorId)) {
          return res.status(403).send({ message: "Not authorized to give feedback" });
        }

        const feedbackEntry = {
          text: text.trim(),
          date: new Date(),
        };

        await proposalsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { feedback: feedbackEntry } }
        );

        const updated = await proposalsCollection.findOne({ _id: new ObjectId(id) });
        res.send({ success: true, proposal: updated });
      } catch (err) {
        console.error("PATCH /proposals/:id/feedback error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });


    app.post("/faqs", async (req, res) => {
      try {
        const { question, answer } = req.body;

        if (typeof question !== "string" || !question.trim()) {
          return res.status(400).send({ message: "Question is required" });
        }
        if (typeof answer !== "string" || !answer.trim()) {
          return res.status(400).send({ message: "Answer is required" });
        }

        const faq = {
          question: question.trim(),
          answer: answer.trim(),
          createdAt: new Date(),
        };

        const result = await faqsCollection.insertOne(faq);
        res.status(201).send({ success: true, faqId: result.insertedId });
      } catch (err) {
        console.error("POST /faqs error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/faqs", async (req, res) => {
      try {
        const faqs = await faqsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).send(faqs);
      } catch (err) {
        console.error("GET /faqs error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });


    app.patch("/admin/assign-supervisor", async (req, res) => {
      try {
        const { proposalId } = req.body || {};
        if (!ObjectId.isValid(proposalId)) {
          return res.status(400).send({ message: "Invalid proposalId" });
        }

        const proposal = await proposalsCollection.findOne({
          _id: new ObjectId(proposalId),
        });
        if (!proposal) {
          return res.status(404).send({ message: "Proposal not found" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(proposal.groupId),
        });
        if (!group) {
          return res.status(404).send({ message: "Group not found" });
        }

        const alreadyAssigned =
          group.assignedSupervisor &&
          String(group.assignedSupervisor) === String(proposal.supervisor);

        await groupsCollection.updateOne(
          { _id: new ObjectId(proposal.groupId) },
          { $set: { assignedSupervisor: new ObjectId(proposal.supervisor) } }
        );

        await proposalsCollection.updateOne(
          { _id: new ObjectId(proposalId) },
          {
            $set: {
              status: "Approved",
              supervisorapproved: true,
              adminapproved: true,
              decidedAt: new Date(),
            },
          }
        );

        await proposalsCollection.deleteMany({
          groupId: new ObjectId(proposal.groupId),
          _id: { $ne: new ObjectId(proposalId) },
        });

        const supervisorUser = await userCollection.findOne({
          _id: new ObjectId(proposal.supervisor),
        });

        const supName =
          supervisorUser?.name || supervisorUser?.email || "Supervisor";
        const groupMemberIds = (group.members || []).map(
          (m) => new ObjectId(m)
        );

        await pushNotificationsToUsers(groupMemberIds, {
          message: `Admin assigned ${supName} as your supervisor for "${proposal.title}".`,
          date: new Date(),
          link: `/proposals/${proposal._id}`,
        });

        await pushNotificationsToUsers([proposal.supervisor], {
          message: `You have been assigned to supervise group "${group.name}" (proposal: "${proposal.title}").`,
          date: new Date(),
          link: `/supervisor-dashboard`,
        });

        res.send({
          success: true,
          assigned: true,
          alreadyAssigned,
          proposalId,
          groupId: proposal.groupId,
          supervisorId: proposal.supervisor,
        });
      } catch (err) {
        console.error("PATCH /admin/assign-supervisor error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/admin/reject-proposal", async (req, res) => {
      try {
        const { proposalId, reason } = req.body || {};
        if (!ObjectId.isValid(proposalId)) {
          return res.status(400).send({ message: "Invalid proposalId" });
        }

        const proposal = await proposalsCollection.findOne({
          _id: new ObjectId(proposalId),
        });
        if (!proposal) {
          return res.status(404).send({ message: "Proposal not found" });
        }

        if (proposal.status !== "Pending") {
          return res
            .status(409)
            .send({ message: "Proposal has already been decided" });
        }

        await proposalsCollection.updateOne(
          { _id: new ObjectId(proposalId) },
          {
            $set: {
              status: "Rejected",
              supervisorapproved: false,
              adminapproved: false,
              decidedAt: new Date(),
              rejectedReason: typeof reason === "string" ? reason : undefined,
            },
          }
        );

        const group = await groupsCollection.findOne({
          _id: new ObjectId(proposal.groupId),
        });

        const supervisorUser = await userCollection.findOne({
          _id: new ObjectId(proposal.supervisor),
        });

        const supName =
          supervisorUser?.name || supervisorUser?.email || "Supervisor";
        const groupMemberIds = (group?.members || []).map(
          (m) => new ObjectId(m)
        );

        await pushNotificationsToUsers(groupMemberIds, {
          message: `Admin rejected your proposal "${proposal.title}"${
            reason ? ` — Reason: ${reason}` : ""
          }.`,
          date: new Date(),
          link: `/proposals/${proposal._id}`,
        });

        await pushNotificationsToUsers([proposal.supervisor], {
          message: `Admin rejected the proposal "${
            proposal.title
          }" that was submitted to you by group "${group?.name || "Unknown"}".`,
          date: new Date(),
          link: `/supervisor-dashboard`,
        });

        res.send({ success: true, rejected: true, proposalId });
      } catch (err) {
        console.error("PATCH /admin/reject-proposal error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    async function pushNotificationsToUsers(userIds = [], notif = {}) {
      try {
        const ids = (userIds || [])
          .map((id) => (ObjectId.isValid(id) ? new ObjectId(id) : null))
          .filter(Boolean);
        if (ids.length === 0) return;

        const notification = {
          message: String(notif.message || ""),
          date: notif.date ? new Date(notif.date) : new Date(),
          link: String(notif.link || ""),
        };

        await userCollection.updateMany(
          { _id: { $in: ids } },
          { $push: { notifications: notification }, $set: { isSeen: false } }
        );
      } catch (err) {
        console.error("pushNotificationsToUsers error:", err);
      }
    }

    app.get("/users/by-studentId/:studentId", async (req, res) => {
      try {
        const { studentId } = req.params;
        if (!studentId || typeof studentId !== "string") {
          return res.status(400).json({ message: "studentId is required" });
        }

        const student = await userCollection.findOne(
          { studentId: studentId.trim(), role: "student" },
          { projection: { password: 0 } }
        );

        if (!student) {
          return res.status(404).json({ message: "Student not found" });
        }

        res.json(student);
      } catch (err) {
        console.error("GET /users/by-studentId error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/groups/check-membership/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        if (!ObjectId.isValid(userId)) {
          return res.status(400).json({ message: "Invalid userId" });
        }
        const uid = new ObjectId(userId);

        const found = await groupsCollection.findOne({
          $or: [{ admin: uid }, { members: uid }],
        });

        res.json({ inGroup: Boolean(found) });
      } catch (err) {
        console.error("GET /groups/check-membership error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post("/groups/:groupId/invite", async (req, res) => {
      try {
        const { groupId } = req.params;
        const { studentId } = req.body || {};

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(studentId)) {
          return res
            .status(400)
            .json({ message: "Invalid groupId or studentId" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).json({ message: "Group not found" });

        const student = await userCollection.findOne(
          { _id: new ObjectId(studentId), role: "student" },
          { projection: { password: 0 } }
        );
        if (!student)
          return res.status(404).json({ message: "Student not found" });

        const maxMembers = group.maxMembers || 5;
        const currentMembers = Array.isArray(group.members)
          ? group.members.length
          : 0;
        if (currentMembers >= maxMembers) {
          return res.status(409).json({ message: "Group is already full" });
        }

        const alreadyInGroup = await groupsCollection.findOne({
          $or: [
            { admin: new ObjectId(studentId) },
            { members: new ObjectId(studentId) },
          ],
        });
        if (alreadyInGroup) {
          return res
            .status(409)
            .json({ message: "Student already belongs to a group" });
        }

        if (String(group.admin) === String(studentId)) {
          return res
            .status(400)
            .json({ message: "Cannot invite the group admin" });
        }

        const pendingExists = await userCollection.findOne({
          _id: new ObjectId(studentId),
          "joinRequests.groupId": new ObjectId(groupId),
          "joinRequests.status": "pending",
        });
        if (pendingExists) {
          return res
            .status(409)
            .json({ message: "An invite from this group is already pending" });
        }

        const adminUser = await userCollection.findOne(
          { _id: new ObjectId(group.admin) },
          { projection: { name: 1, email: 1 } }
        );

        const joinRequest = {
          _id: new ObjectId(),
          groupId: new ObjectId(groupId),
          groupName: group.name || "Unnamed Group",
          invitedBy: new ObjectId(group.admin),
          invitedByName: adminUser?.name || adminUser?.email || "Group Admin",
          date: new Date(),
          status: "pending",
        };

        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          {
            $push: { joinRequests: joinRequest },
            $set: { isSeen: false },
          }
        );

        await pushNotificationsToUsers([student._id], {
          message: `You’ve been invited to join group "${group.name}".`,
          link: `/find-group/${student._id}`,
        });

        await pushNotificationsToUsers([group.admin], {
          message: `Invite sent to ${
            student.name || student.email || "a student"
          } to join "${group.name}".`,
          link: `/find-group/${group.admin}`,
        });

        res.json({ success: true, invited: true, joinRequest });
      } catch (err) {
        console.error("POST /groups/:groupId/invite error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.patch("/groups/invite/:requestId/reject", async (req, res) => {
      try {
        const { requestId } = req.params;
        const { studentId, groupId } = req.body || {};

        if (!ObjectId.isValid(requestId) || !ObjectId.isValid(studentId)) {
          return res.status(400).json({ message: "Invalid id(s)" });
        }
        if (groupId && !ObjectId.isValid(groupId)) {
          return res.status(400).json({ message: "Invalid groupId" });
        }

        const user = await userCollection.findOne(
          {
            _id: new ObjectId(studentId),
            "joinRequests._id": new ObjectId(requestId),
          },
          { projection: { joinRequests: 1, name: 1, email: 1 } }
        );
        if (!user)
          return res.status(404).json({ message: "Invitation not found" });

        const invite = (user.joinRequests || []).find(
          (r) => String(r._id) === String(requestId)
        );
        if (!invite)
          return res.status(404).json({ message: "Invitation not found" });

        if (groupId && String(invite.groupId) !== String(groupId)) {
          return res
            .status(400)
            .json({ message: "Invite does not match groupId" });
        }

        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          { $pull: { joinRequests: { _id: new ObjectId(requestId) } } }
        );

        try {
          const group = await groupsCollection.findOne({
            _id: new ObjectId(invite.groupId),
          });
          if (group) {
            await pushNotificationsToUsers([group.admin], {
              message: `${
                user.name || user.email || "A student"
              } declined your invite to "${group.name}".`,
              date: new Date(),
              link: `/find-group/${group.admin}`,
            });
          }
        } catch (e) {
          console.error("Notify admin on reject failed:", e);
        }

        res.json({ success: true, rejected: true, requestId });
      } catch (err) {
        console.error("PATCH /groups/invite/:requestId/reject error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.patch("/groups/invite/:requestId/accept", async (req, res) => {
      try {
        const { requestId } = req.params;
        const { studentId, groupId } = req.body || {};
        if (
          !ObjectId.isValid(requestId) ||
          !ObjectId.isValid(studentId) ||
          !ObjectId.isValid(groupId)
        ) {
          return res.status(400).json({ message: "Invalid id(s)" });
        }

        const user = await userCollection.findOne(
          {
            _id: new ObjectId(studentId),
            "joinRequests._id": new ObjectId(requestId),
          },
          { projection: { joinRequests: 1, name: 1, email: 1 } }
        );
        if (!user)
          return res.status(404).json({ message: "Invitation not found" });

        const invite = (user.joinRequests || []).find(
          (r) => String(r._id) === String(requestId)
        );
        if (!invite || String(invite.groupId) !== String(groupId)) {
          return res
            .status(400)
            .json({ message: "Invite does not match groupId" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).json({ message: "Group not found" });

        const studentObjId = new ObjectId(studentId);
        const alreadyInGroup = await groupsCollection.findOne({
          $or: [{ admin: studentObjId }, { members: studentObjId }],
        });
        if (alreadyInGroup) {
          await userCollection.updateOne(
            { _id: studentObjId },
            { $set: { joinRequests: [] } }
          );
          return res
            .status(409)
            .json({ message: "Student already belongs to a group" });
        }

        const maxMembers = group.maxMembers || 5;
        const membersArr = Array.isArray(group.members) ? group.members : [];
        if (membersArr.length >= maxMembers) {
          await userCollection.updateOne(
            { _id: studentObjId },
            { $pull: { joinRequests: { _id: new ObjectId(requestId) } } }
          );
          return res.status(409).json({ message: "This group is full" });
        }

        await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $addToSet: { members: studentObjId } }
        );

        await userCollection.updateOne(
          { _id: studentObjId },
          { $set: { joinRequests: [] } }
        );
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingJoinRequests: { studentId: studentObjId } } }
        );

        await pushNotificationsToUsers([studentObjId], {
          message: `You joined "${group.name}".`,
          date: new Date(),
          link: `/find-group/${studentId}`,
        });
        await pushNotificationsToUsers([group.admin], {
          message: `${
            user.name || user.email || "A student"
          } accepted your invite to "${group.name}".`,
          date: new Date(),
          link: `/create-group/${group.admin}`,
        });

        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.json({ success: true, accepted: true, group: updated });
      } catch (err) {
        console.error("PATCH /groups/invite/:requestId/accept error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/users/:id/join-requests", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid id" });

        const user = await userCollection.findOne(
          { _id: new ObjectId(id) },
          { projection: { joinRequests: 1, _id: 0 } }
        );

        res.json(user?.joinRequests || []);
      } catch (err) {
        console.error("GET /users/:id/join-requests error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.patch("/users/:id/join-requests/clear", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid user id" });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { joinRequests: [] } }
        );

        if (!result.matchedCount) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send({ success: true });
      } catch (err) {
        console.error("PATCH /users/:id/join-requests/clear error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    const isUserInAnyGroup = async (studentId) => {
      const _id = new ObjectId(studentId);
      const group = await groupsCollection.findOne({
        $or: [{ admin: _id }, { members: _id }],
      });
      return Boolean(group);
    };

    app.get("/groups/check-membership/:studentId", async (req, res) => {
      try {
        const { studentId } = req.params;
        if (!ObjectId.isValid(studentId)) {
          return res.status(400).send({ message: "Invalid studentId" });
        }
        const inGroup = await isUserInAnyGroup(studentId);
        res.send({ inGroup });
      } catch (err) {
        console.error("GET /groups/check-membership error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/groups/:groupId/request-join", async (req, res) => {
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

        const student = await userCollection.findOne({
          _id: new ObjectId(studentId),
          role: "student",
        });
        if (!student)
          return res.status(404).send({ message: "Student not found" });

        if (await isUserInAnyGroup(studentId)) {
          return res
            .status(409)
            .send({ message: "You already belong to a group" });
        }

        const membersArr = Array.isArray(group.members) ? group.members : [];
        const maxMembers = group.maxMembers || 5;
        const isAdmin = String(group.admin) === String(studentId);
        const isMember = membersArr.some(
          (m) => String(m) === String(studentId)
        );
        const full = membersArr.length >= maxMembers;

        if (isAdmin)
          return res
            .status(403)
            .send({ message: "You are the admin of this group" });
        if (isMember)
          return res
            .status(409)
            .send({ message: "You are already a member of this group" });
        if (full)
          return res.status(409).send({ message: "This group is full" });

        const alreadyPending =
          Array.isArray(group.pendingJoinRequests) &&
          group.pendingJoinRequests.some(
            (req) => String(req.studentId) === String(studentId)
          );

        if (alreadyPending) {
          return res.status(409).send({ message: "Join request already sent" });
        }

        await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          {
            $push: {
              pendingJoinRequests: {
                studentId: new ObjectId(studentId),
                date: new Date(),
              },
            },
          }
        );

        const notification = {
          message: `${
            student.name || student.email || "A student"
          } requested to join your group "${group.name}".`,
          date: new Date(),
          link: `/find-group/${group.admin}`, 
        };
        await pushNotificationsToUsers([group.admin], notification);

        res.status(201).send({ success: true });
      } catch (err) {
        console.error("POST /groups/:groupId/request-join error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/groups/:groupId/requests", async (req, res) => {
      try {
        const { groupId } = req.params;
        if (!ObjectId.isValid(groupId)) {
          return res.status(400).send({ message: "Invalid groupId" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).send({ message: "Group not found" });

        const pending = Array.isArray(group.pendingJoinRequests)
          ? group.pendingJoinRequests
          : [];

        if (pending.length === 0) return res.send([]);

        const reqItems = pending
          .map((r) => {
            const raw = r.studentId;
            const sid = typeof raw === "string" ? raw : String(raw); 
            const oid = ObjectId.isValid(sid) ? new ObjectId(sid) : null;
            return { sid, oid, requestedAt: r.date || r.requestedAt || null };
          })
          .filter((r) => r.oid);

        if (reqItems.length === 0) return res.send([]);

        const students = await userCollection
          .find(
            { _id: { $in: reqItems.map((r) => r.oid) } },
            { projection: { password: 0 } }
          )
          .toArray();

        const byId = Object.fromEntries(
          students.map((s) => [String(s._id), s])
        );

        const out = reqItems
          .map((r) => {
            const s = byId[r.sid];
            return {
              studentId: r.sid, 
              name: s?.name || "Unnamed Student",
              email: s?.email ?? null,
              studentIdStr: s?.studentId ?? null,
              photoUrl: s?.photoUrl ?? null,
              requestedAt: r.requestedAt,
            };
          })
          .filter((x) => x.name)
          .sort(
            (a, b) =>
              new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0)
          );

        res.send(out);
      } catch (err) {
        console.error("GET /groups/:groupId/requests error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/groups/:groupId/requests/:studentId", async (req, res) => {
      try {
        const { groupId, studentId } = req.params;
        const { decision } = req.body || {};

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(studentId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }
        if (!["accept", "reject"].includes(String(decision))) {
          return res
            .status(400)
            .send({ message: "Decision must be 'accept' or 'reject'" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).send({ message: "Group not found" });

        const pending = Array.isArray(group.pendingJoinRequests)
          ? group.pendingJoinRequests
          : [];
        const hasRequest = pending.some(
          (r) => String(r.studentId) === String(studentId)
        );
        if (!hasRequest) {
          return res.status(404).send({ message: "No such pending request" });
        }

        const student = await userCollection.findOne({
          _id: new ObjectId(studentId),
          role: "student",
        });
        if (!student)
          return res.status(404).send({ message: "Student not found" });

        if (decision === "reject") {
          await groupsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            {
              $pull: {
                pendingJoinRequests: { studentId: new ObjectId(studentId) },
              },
            }
          );

          await pushNotificationsToUsers([studentId], {
            message: `Your request to join "${group.name}" was rejected by the group admin.`,
            date: new Date(),
            link: `/find-group/${studentId}`,
          });

          return res.send({ success: true, decision: "rejected" });
        }

        if (await isUserInAnyGroup(studentId)) {
          await groupsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            {
              $pull: {
                pendingJoinRequests: { studentId: new ObjectId(studentId) },
              },
            }
          );
          return res
            .status(409)
            .send({ message: "Student already belongs to a group" });
        }

        const membersArr = Array.isArray(group.members) ? group.members : [];
        const maxMembers = group.maxMembers || 5;
        if (membersArr.length >= maxMembers) {
          await groupsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            {
              $pull: {
                pendingJoinRequests: { studentId: new ObjectId(studentId) },
              },
            }
          );
          return res.status(409).send({ message: "This group is full" });
        }

        await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          {
            $addToSet: { members: new ObjectId(studentId) },
            $pull: {
              pendingJoinRequests: { studentId: new ObjectId(studentId) },
            },
          }
        );

        +(
          (await groupsCollection.updateMany(
            {},
            {
              $pull: {
                pendingJoinRequests: { studentId: new ObjectId(studentId) },
              },
            }
          ))
        );

        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          { $set: { joinRequests: [] } }
        );
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingInvites: { studentId: new ObjectId(studentId) } } }
        );
        await pushNotificationsToUsers([studentId], {
          message: `Your request to join "${group.name}" was accepted. You are now a member.`,
          date: new Date(),
          link: `/find-group/${studentId}`,
        });

        await pushNotificationsToUsers([group.admin], {
          message: `${
            student.name || student.email || "A student"
          } has joined your group "${group.name}".`,
          date: new Date(),
          link: `/create-group/${group.admin}`,
        });

        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.send({ success: true, decision: "accepted", group: updated });
      } catch (err) {
        console.error("PATCH /groups/:groupId/requests/:studentId error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/search-papers", async (req, res) => {
      const { q, start } = req.query;
      const query = q || "computer science"; 
      const startIndex = parseInt(start) || 0;
      const max_results = 50; 

      try {
        const response = await axios.get(
          `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
            query
          )}&start=${startIndex}&max_results=${max_results}`
        );

        xml2js.parseString(response.data, (err, result) => {
          if (err) return res.status(500).json({ error: "XML parsing failed" });

          const papers = result.feed.entry || [];
          const formatted = papers.map((paper) => ({
            id: paper.id[0],
            title: paper.title[0].replace(/\n/g, " ").trim(),
            summary: paper.summary[0].replace(/\n/g, " ").trim(),
            authors: paper.author.map((a) => a.name[0]),
            published: paper.published[0],
            link: paper.id[0],
          }));

          res.json(formatted);
        });
      } catch (error) {
        console.error("Arxiv API Error:", error.message);
        res.status(500).json({ error: "Failed to fetch papers from arXiv" });
      }
    });

    app.get("/random-papers", async (req, res) => {
      try {
        const response = await axios.get(
          `http://export.arxiv.org/api/query?search_query=all:computer%20science&start=0&max_results=50`
        );

        xml2js.parseString(response.data, (err, result) => {
          if (err) return res.status(500).json({ error: "XML parsing failed" });

          const papers = result.feed.entry || [];
          const formatted = papers.map((paper) => ({
            id: paper.id[0],
            title: paper.title[0].replace(/\n/g, " ").trim(),
            summary: paper.summary[0].replace(/\n/g, " ").trim(),
            authors: paper.author.map((a) => a.name[0]),
            published: paper.published[0],
            link: paper.id[0],
          }));

          const shuffled = formatted.sort(() => 0.5 - Math.random());
          const randomFive = shuffled.slice(0, 5);

          res.json(randomFive);
        });
      } catch (error) {
        console.error("Arxiv API Error:", error.message);
        res.status(500).json({ error: "Failed to fetch random papers" });
      }
    });

    app.post("/users/:id/bookmarks", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }

      const paper = req.body;

      try {
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).send({ message: "User not found" });

        const alreadyBookmarked = user.bookmarks?.find(
          (b) => b.paperId === paper.paperId
        );
        if (alreadyBookmarked) {
          return res.status(400).send({ message: "Paper already bookmarked" });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { bookmarks: paper } }
        );

        res.send({ success: true, message: "Paper bookmarked" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/users/:id/bookmarks", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }

      try {
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).send({ message: "User not found" });

        res.send(user.bookmarks || []);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.delete("/users/:id/bookmarks/:paperId", async (req, res) => {
      const { id } = req.params;
      const paperId = decodeURIComponent(req.params.paperId);

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid user id" });

      try {
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $pull: { bookmarks: { paperId: paperId } } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Bookmark not found" });
        }

        res.send({ success: true, message: "Bookmark removed" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/groups/:groupId/recommend-paper", async (req, res) => {
      try {
        const { groupId } = req.params;
        const { supervisorId, paper } = req.body || {};

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).json({ message: "Invalid id(s)" });
        }
        const { paperId, title, authors, summary, link } = paper || {};
        if (!paperId || !title || !link) {
          return res
            .status(400)
            .json({ message: "paperId, title, and link are required" });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).json({ message: "Group not found" });

        if (String(group.assignedSupervisor) !== String(supervisorId)) {
          return res
            .status(403)
            .json({ message: "Not authorized to recommend to this group" });
        }
        const already = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
          "recommendedFeatures.paperId": paperId,
        });
        if (already) {
          return res
            .status(409)
            .json({ message: "Paper already recommended to this group" });
        }

        const payload = {
          paperId: String(paperId),
          title: String(title),
          authors: Array.isArray(authors) ? authors : [],
          summary: typeof summary === "string" ? summary : "",
          link: String(link),
          recommendedBy: new ObjectId(supervisorId),
          recommendedAt: new Date(),
        };

        const upd = await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $push: { recommendedFeatures: payload } }
        );

        if (!upd.matchedCount) {
          return res.status(500).json({ message: "Failed to recommend paper" });
        }

        try {
          const memberIds = (group.members || []).map((m) => new ObjectId(m));
          await pushNotificationsToUsers(memberIds, {
            message: `A new paper was recommended to your group "${group.name}": ${title}`,
            date: new Date(),
            link: payload.link,
          });
        } catch (e) {
          console.error("Notify members on recommend failed:", e);
        }

        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.json({ success: true, group: updated });
      } catch (err) {
        console.error("POST /groups/:groupId/recommend-paper error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post("/meetings", async (req, res) => {
      try {
        const { title, date, time, groupId, meetingLink, supervisorId } = req.body;
        if (!title || !date || !time || !groupId || !supervisorId) {
          return res.status(400).send({ 
            message: "Title, date, time, groupId, and supervisorId are required" 
          });
        }

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid groupId or supervisorId" });
        }
        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
          assignedSupervisor: new ObjectId(supervisorId)
        });

        if (!group) {
          return res.status(403).send({ 
            message: "You are not authorized to schedule meetings for this group" 
          });
        }

        const meeting = {
          title: title.trim(),
          date,
          time,
          groupId: new ObjectId(groupId),
          supervisorId: new ObjectId(supervisorId),
          meetingLink: meetingLink?.trim() || null,
          createdAt: new Date(),
          status: "scheduled"
        };

        const result = await meetingsCollection.insertOne(meeting);
        const createdMeeting = await meetingsCollection.findOne({ _id: result.insertedId });

        const memberIds = (group.members || []).map(m => new ObjectId(m));
        const supervisor = await userCollection.findOne({ _id: new ObjectId(supervisorId) });
        
        await pushNotificationsToUsers(memberIds, {
          message: `New meeting scheduled: "${title}" on ${date} at ${time} by ${supervisor?.name || 'your supervisor'}`,
          date: new Date(),
          link: `/student-dashboard`
        });

        res.status(201).send({ 
          success: true, 
          meeting: createdMeeting,
          message: "Meeting scheduled successfully" 
        });
      } catch (err) {
        console.error("POST /meetings error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });


    app.get("/meetings", async (req, res) => {
      try {
        const { supervisorId, groupId, studentId } = req.query;
        let filter = {};

        if (supervisorId) {
          if (!ObjectId.isValid(supervisorId)) {
            return res.status(400).send({ message: "Invalid supervisorId" });
          }
          filter.supervisorId = new ObjectId(supervisorId);
        }

        if (groupId) {
          if (!ObjectId.isValid(groupId)) {
            return res.status(400).send({ message: "Invalid groupId" });
          }
          filter.groupId = new ObjectId(groupId);
        }

        if (studentId) {
          if (!ObjectId.isValid(studentId)) {
            return res.status(400).send({ message: "Invalid studentId" });
          }
          
          const studentGroups = await groupsCollection.find({
            members: new ObjectId(studentId)
          }).toArray();
          
          const groupIds = studentGroups.map(g => g._id);
          filter.groupId = { $in: groupIds };
        }

        const meetings = await meetingsCollection
          .find(filter)
          .sort({ date: 1, time: 1 })
          .toArray();
        const enrichedMeetings = await Promise.all(
          meetings.map(async (meeting) => {
            const group = await groupsCollection.findOne({ _id: meeting.groupId });
            const supervisor = await userCollection.findOne(
              { _id: meeting.supervisorId },
              { projection: { password: 0 } }
            );

            return {
              ...meeting,
              groupName: group?.name || "Unknown Group",
              supervisorName: supervisor?.name || "Unknown Supervisor"
            };
          })
        );

        res.send(enrichedMeetings);
      } catch (err) {
        console.error("GET /meetings error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.put("/meetings/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { title, date, time, groupId, meetingLink, supervisorId } = req.body;

        if (!ObjectId.isValid(id) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }
        if (!title || !date || !time || !groupId) {
          return res.status(400).send({ 
            message: "Title, date, time, and groupId are required" 
          });
        }
        if (!ObjectId.isValid(groupId)) {
          return res.status(400).send({ message: "Invalid groupId" });
        }

        const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
        if (!meeting) {
          return res.status(404).send({ message: "Meeting not found" });
        }

        if (String(meeting.supervisorId) !== String(supervisorId)) {
          return res.status(403).send({ 
            message: "Not authorized to update this meeting" 
          });
        }

        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
          assignedSupervisor: new ObjectId(supervisorId)
        });

        if (!group) {
          return res.status(403).send({ 
            message: "You are not authorized to schedule meetings for this group" 
          });
        }

        const updateData = {
          title: title.trim(),
          date,
          time,
          groupId: new ObjectId(groupId),
          meetingLink: meetingLink?.trim() || null,
          updatedAt: new Date()
        };

        const result = await meetingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Meeting not found" });
        }

        const updatedMeeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });

        const memberIds = (group.members || []).map(m => new ObjectId(m));
        const supervisor = await userCollection.findOne({ _id: new ObjectId(supervisorId) });
        
        await pushNotificationsToUsers(memberIds, {
          message: `Meeting "${title}" has been updated by ${supervisor?.name || 'your supervisor'}`,
          date: new Date(),
          link: `/student-dashboard`
        });

        res.send({ 
          success: true, 
          meeting: updatedMeeting,
          message: "Meeting updated successfully" 
        });
      } catch (err) {
        console.error("PUT /meetings/:id error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.delete("/meetings/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { supervisorId } = req.body;

        if (!ObjectId.isValid(id) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }

        const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
        if (!meeting) {
          return res.status(404).send({ message: "Meeting not found" });
        }
        if (String(meeting.supervisorId) !== String(supervisorId)) {
          return res.status(403).send({ 
            message: "Not authorized to delete this meeting" 
          });
        }

        const group = await groupsCollection.findOne({ _id: meeting.groupId });
        
        const result = await meetingsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Meeting not found" });
        }

        if (group) {
          const memberIds = (group.members || []).map(m => new ObjectId(m));
          const supervisor = await userCollection.findOne({ _id: new ObjectId(supervisorId) });
          
          await pushNotificationsToUsers(memberIds, {
            message: `Meeting "${meeting.title}" has been cancelled by ${supervisor?.name || 'your supervisor'}`,
            date: new Date(),
            link: `/student-dashboard`
          });
        }

        res.send({ 
          success: true, 
          message: "Meeting deleted successfully" 
        });
      } catch (err) {
        console.error("DELETE /meetings/:id error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/meetings/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status, supervisorId } = req.body;

        if (!ObjectId.isValid(id) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }

        if (!["scheduled", "completed", "cancelled"].includes(status)) {
          return res.status(400).send({ 
            message: "Status must be 'scheduled', 'completed', or 'cancelled'" 
          });
        }

        const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
        if (!meeting) {
          return res.status(404).send({ message: "Meeting not found" });
        }

        if (String(meeting.supervisorId) !== String(supervisorId)) {
          return res.status(403).send({ 
            message: "Not authorized to update this meeting" 
          });
        }

        const result = await meetingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { 
            $set: { 
              status,
              updatedAt: new Date()
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Meeting not found" });
        }

        const updatedMeeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
        res.send({ success: true, meeting: updatedMeeting });
      } catch (err) {
        console.error("PATCH /meetings/:id/status error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

        // Get all theses (for all users)
    app.get("/theses", async (req, res) => {
      try {
        const { status } = req.query;
        const filter = {};
        if (status) filter.status = status; // allow filtering

        const theses = await proposalsCollection.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: "users",
              localField: "supervisor",
              foreignField: "_id",
              as: "supervisorInfo"
            }
          },
          {
            $lookup: {
              from: "groups",
              localField: "groupId",
              foreignField: "_id",
              as: "groupInfo"
            }
          },
          { $unwind: "$groupInfo" },
          {
            $lookup: {
              from: "users",
              localField: "groupInfo.members",
              foreignField: "_id",
              as: "studentMembers"
            }
          },
          {
            $project: {
              title: 1,
              status: 1,
              createdAt: 1,
              domain: 1, // <--- include domain
              supervisor: { $arrayElemAt: ["$supervisorInfo", 0] },
              students: "$studentMembers",
              groupName: "$groupInfo.name"
            }
          },
          { $sort: { createdAt: -1 } }
        ]).toArray();

        res.status(200).send(theses);
      } catch (err) {
        console.error("GET /theses error:", err);
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