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

    //register user
    app.post("/users", async (req, res) => {
      const user = {
        ...req.body,
        notifications: [],
        isSeen: true, // default true so no red dot until something new comes
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

    // Get student profile (now using ID parameter)
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

    // Update student profile (now using ID parameter)
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
    // Get supervisor by ID
    app.get("/supervisor/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const supervisor = await userCollection.findOne(
          { _id: new ObjectId(id), role: "supervisor" },
          { projection: { password: 0 } } // hide password
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
    // Update supervisor profile
    app.put("/supervisor/update/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        // Allowed fields for supervisor update
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

        // Basic validations
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
          { projection: { password: 0 } } // hide password
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

    // Post announcement
    app.post("/announcements", async (req, res) => {
      try {
        const announcement = req.body;
        announcement.createdAt = new Date();
        const result = await announcementsCollection.insertOne(announcement);

        // Push notification to all students and supervisors
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

        // Remove this student's pending join requests across ALL groups
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingJoinRequests: { studentId: studentObjId } } }
        );

        // Clear any outstanding invites to the student and invite records in groups
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

    // Submit thesis proposal
    // Submit thesis proposal
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

        // Check if group exists and student is the admin
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

        // 🚫 Block if group already has assigned supervisor
        if (group.assignedSupervisor) {
          return res.status(403).send({
            message:
              "This group already has an assigned supervisor. You cannot submit more proposals.",
          });
        }

        // Insert proposal
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

        // ✅ Update group's proposalsSubmittedTo
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
          // allow Pending / Approved / Rejected
          filter.status = String(status);
        }

        if (!supervisorId && !studentId && !groupId && !status) {
          return res.status(400).send({ message: "Missing query parameter" });
        }

        // Populate supervisor info (name/email) via $lookup
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

    // POST FAQ (Admin only)
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

    // GET all FAQs (Visible to everyone)
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

    // Supervisor approves/rejects a proposal
    app.patch("/proposals/:id/decision", async (req, res) => {
      try {
        const { id } = req.params;
        const { supervisorId, decision } = req.body || {};

        if (!ObjectId.isValid(id) || !ObjectId.isValid(supervisorId)) {
          return res.status(400).send({ message: "Invalid id(s)" });
        }
        if (!["approve", "reject"].includes(String(decision))) {
          return res
            .status(400)
            .send({ message: "Decision must be 'approve' or 'reject'" });
        }

        const proposal = await proposalsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!proposal)
          return res.status(404).send({ message: "Proposal not found" });

        if (String(proposal.supervisor) !== String(supervisorId)) {
          return res
            .status(403)
            .send({ message: "Not authorized to decide this proposal" });
        }

        if (proposal.status !== "Pending") {
          return res
            .status(409)
            .send({ message: "Proposal has already been decided" });
        }

        let newFields = {
          status: decision === "approve" ? "Approved" : "Rejected",
          supervisorapproved: decision === "approve",
          decidedAt: new Date(),
        };

        if (decision === "approve" && ObjectId.isValid(proposal.groupId)) {
          // ✅ Assign supervisor to the group
          await groupsCollection.updateOne(
            { _id: new ObjectId(proposal.groupId) },
            { $set: { assignedSupervisor: new ObjectId(supervisorId) } }
          );

          // ✅ Remove all other proposals from this group
          await proposalsCollection.deleteMany({
            groupId: new ObjectId(proposal.groupId),
            _id: { $ne: new ObjectId(id) }, // keep the approved proposal
          });
        }

        // Update proposal status
        await proposalsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: newFields }
        );

        //  Send Notifications to group members
        if (ObjectId.isValid(proposal.groupId)) {
          const group = await groupsCollection.findOne({
            _id: new ObjectId(proposal.groupId),
          });

          if (group?.members?.length > 0) {
            const supervisor = await userCollection.findOne({
              _id: new ObjectId(supervisorId),
            });

            const notification = {
              message:
                decision === "approve"
                  ? `Your thesis proposal "${
                      proposal.title
                    }" has been approved by ${
                      supervisor?.name || "Supervisor"
                    }.`
                  : `Your thesis proposal "${
                      proposal.title
                    }" has been rejected by ${
                      supervisor?.name || "Supervisor"
                    }.`,
              date: new Date(),
              link: `/proposals/${proposal._id}`,
            };

            await userCollection.updateMany(
              { _id: { $in: group.members.map((m) => new ObjectId(m)) } },
              {
                $push: { notifications: notification },
                $set: { isSeen: false },
              }
            );
          }
        }

        const updated = await proposalsCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, proposal: updated });
      } catch (err) {
        console.error("PATCH /proposals/:id/decision error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ADMIN assigns supervisor to the proposal's group
    app.patch("/admin/assign-supervisor", async (req, res) => {
      try {
        const { proposalId } = req.body || {};
        if (!ObjectId.isValid(proposalId)) {
          return res.status(400).send({ message: "Invalid proposalId" });
        }

        // Load proposal
        const proposal = await proposalsCollection.findOne({
          _id: new ObjectId(proposalId),
        });
        if (!proposal) {
          return res.status(404).send({ message: "Proposal not found" });
        }

        // Load group
        const group = await groupsCollection.findOne({
          _id: new ObjectId(proposal.groupId),
        });
        if (!group) {
          return res.status(404).send({ message: "Group not found" });
        }

        // Already assigned? (idempotency guard)
        const alreadyAssigned =
          group.assignedSupervisor &&
          String(group.assignedSupervisor) === String(proposal.supervisor);

        // 1) Assign supervisor to the group
        await groupsCollection.updateOne(
          { _id: new ObjectId(proposal.groupId) },
          { $set: { assignedSupervisor: new ObjectId(proposal.supervisor) } }
        );

        // 2) Mark this proposal as Approved (+ adminapproved flag)
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

        // 3) Remove all other proposals by this group (keep the approved one)
        await proposalsCollection.deleteMany({
          groupId: new ObjectId(proposal.groupId),
          _id: { $ne: new ObjectId(proposalId) },
        });

        // 4) Notifications
        const supervisorUser = await userCollection.findOne({
          _id: new ObjectId(proposal.supervisor),
        });

        const supName =
          supervisorUser?.name || supervisorUser?.email || "Supervisor";
        const groupMemberIds = (group.members || []).map(
          (m) => new ObjectId(m)
        );

        // Notify group members
        await pushNotificationsToUsers(groupMemberIds, {
          message: `Admin assigned ${supName} as your supervisor for "${proposal.title}".`,
          date: new Date(),
          link: `/proposals/${proposal._id}`,
        });

        // Notify the supervisor
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

    // ADMIN rejects a proposal (does NOT unassign anything)
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

        // Only change if still pending (optional; remove check if you want to force)
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

        // Notifications
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

        // Group members
        await pushNotificationsToUsers(groupMemberIds, {
          message: `Admin rejected your proposal "${proposal.title}"${
            reason ? ` — Reason: ${reason}` : ""
          }.`,
          date: new Date(),
          link: `/proposals/${proposal._id}`,
        });

        // Supervisor
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

    // Reusable helper to push notifications and flip isSeen=false
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

    // GET /users/by-studentId/:studentId
    // Returns the student doc (without password) by their "studentId" field
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

    // GET /groups/check-membership/:userId
    // Returns { inGroup: boolean }
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

    // POST /groups/:groupId/invite
    // Body: { studentId: "<Mongo _id of the student to invite>" }
    // Sends a notification to that student IF they aren't in any group yet.
    // POST /groups/:groupId/invite
    // Body: { studentId: "<Mongo _id of the student>" }
    app.post("/groups/:groupId/invite", async (req, res) => {
      try {
        const { groupId } = req.params;
        const { studentId } = req.body || {};

        if (!ObjectId.isValid(groupId) || !ObjectId.isValid(studentId)) {
          return res
            .status(400)
            .json({ message: "Invalid groupId or studentId" });
        }

        // Load group & student
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

        // Group full?
        const maxMembers = group.maxMembers || 5;
        const currentMembers = Array.isArray(group.members)
          ? group.members.length
          : 0;
        if (currentMembers >= maxMembers) {
          return res.status(409).json({ message: "Group is already full" });
        }

        // Student already in any group?
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

        // Prevent inviting admin himself
        if (String(group.admin) === String(studentId)) {
          return res
            .status(400)
            .json({ message: "Cannot invite the group admin" });
        }

        // Avoid duplicate pending request from same group
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

        // Prepare join request object
        const adminUser = await userCollection.findOne(
          { _id: new ObjectId(group.admin) },
          { projection: { name: 1, email: 1 } }
        );

        const joinRequest = {
          _id: new ObjectId(), // unique id for this request
          groupId: new ObjectId(groupId),
          groupName: group.name || "Unnamed Group",
          invitedBy: new ObjectId(group.admin),
          invitedByName: adminUser?.name || adminUser?.email || "Group Admin",
          date: new Date(),
          status: "pending", // pending | accepted | declined (future use)
        };

        // Push join request to student's user doc
        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          {
            $push: { joinRequests: joinRequest },
            $set: { isSeen: false },
          }
        );

        // Notifications
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

    // REJECT a specific invite
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

        // Find the user and verify the invite exists
        const user = await userCollection.findOne(
          {
            _id: new ObjectId(studentId),
            "joinRequests._id": new ObjectId(requestId),
          },
          { projection: { joinRequests: 1, name: 1, email: 1 } }
        );
        if (!user)
          return res.status(404).json({ message: "Invitation not found" });

        // Get the invite we’re rejecting
        const invite = (user.joinRequests || []).find(
          (r) => String(r._id) === String(requestId)
        );
        if (!invite)
          return res.status(404).json({ message: "Invitation not found" });

        // If caller passed groupId, validate it matches the invite
        if (groupId && String(invite.groupId) !== String(groupId)) {
          return res
            .status(400)
            .json({ message: "Invite does not match groupId" });
        }

        // Remove only this invite
        await userCollection.updateOne(
          { _id: new ObjectId(studentId) },
          { $pull: { joinRequests: { _id: new ObjectId(requestId) } } }
        );

        // Notify the group admin that the student declined
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

    // ACCEPT a specific invite
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

        // Make sure invite exists
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

        // Standard join checks
        const group = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        if (!group) return res.status(404).json({ message: "Group not found" });

        const studentObjId = new ObjectId(studentId);
        const alreadyInGroup = await groupsCollection.findOne({
          $or: [{ admin: studentObjId }, { members: studentObjId }],
        });
        if (alreadyInGroup) {
          // Clear all invites if they already joined somewhere else
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
          // Remove only this invite to avoid dangling
          await userCollection.updateOne(
            { _id: studentObjId },
            { $pull: { joinRequests: { _id: new ObjectId(requestId) } } }
          );
          return res.status(409).json({ message: "This group is full" });
        }

        // Add member and remove all invites
        await groupsCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $addToSet: { members: studentObjId } }
        );

        // Clear this invite and any others
        await userCollection.updateOne(
          { _id: studentObjId },
          { $set: { joinRequests: [] } }
        );

        // Also clear student pendingJoinRequests everywhere, if any
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingJoinRequests: { studentId: studentObjId } } }
        );

        // Notify both sides
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

    // GET /users/:id/join-requests
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

    // Clear ALL join requests for a student
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

    // Is this user already in ANY group (as admin or member)?
    const isUserInAnyGroup = async (studentId) => {
      const _id = new ObjectId(studentId);
      const group = await groupsCollection.findOne({
        $or: [{ admin: _id }, { members: _id }],
      });
      return Boolean(group);
    };

    // GET /groups/check-membership/:studentId
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

        // student must exist and be a student
        const student = await userCollection.findOne({
          _id: new ObjectId(studentId),
          role: "student",
        });
        if (!student)
          return res.status(404).send({ message: "Student not found" });

        // already in ANY group?
        if (await isUserInAnyGroup(studentId)) {
          return res
            .status(409)
            .send({ message: "You already belong to a group" });
        }

        // cannot request own group; cannot request a group you already belong to; cannot request full group
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

        // prevent duplicate pending requests
        const alreadyPending =
          Array.isArray(group.pendingJoinRequests) &&
          group.pendingJoinRequests.some(
            (req) => String(req.studentId) === String(studentId)
          );

        if (alreadyPending) {
          return res.status(409).send({ message: "Join request already sent" });
        }

        // push request
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

        // notify admin
        const notification = {
          message: `${
            student.name || student.email || "A student"
          } requested to join your group "${group.name}".`,
          date: new Date(),
          link: `/find-group/${group.admin}`, // or a dedicated "manage group" page
        };
        await pushNotificationsToUsers([group.admin], notification);

        res.status(201).send({ success: true });
      } catch (err) {
        console.error("POST /groups/:groupId/request-join error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // GET all pending join requests for a group with student details (flat shape)
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

        // Normalize request studentIds -> ObjectIds, skip invalid
        const reqItems = pending
          .map((r) => {
            const raw = r.studentId;
            const sid = typeof raw === "string" ? raw : String(raw); // stringify either way
            const oid = ObjectId.isValid(sid) ? new ObjectId(sid) : null;
            return { sid, oid, requestedAt: r.date || r.requestedAt || null };
          })
          .filter((r) => r.oid); // keep only valid ObjectIds

        if (reqItems.length === 0) return res.send([]);

        // Fetch those students
        const students = await userCollection
          .find(
            { _id: { $in: reqItems.map((r) => r.oid) } },
            { projection: { password: 0 } }
          )
          .toArray();

        // Index by stringified _id for easy merge
        const byId = Object.fromEntries(
          students.map((s) => [String(s._id), s])
        );

        // Build flat response rows
        const out = reqItems
          .map((r) => {
            const s = byId[r.sid];
            return {
              studentId: r.sid, // Mongo _id (string)
              name: s?.name || "Unnamed Student",
              email: s?.email ?? null,
              studentIdStr: s?.studentId ?? null, // university student ID
              photoUrl: s?.photoUrl ?? null,
              requestedAt: r.requestedAt, // when the request was made
            };
          })
          // remove any rows that failed to hydrate (should be rare)
          .filter((x) => x.name)
          // newest first
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

        // ensure that request exists
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
          // remove from pending
          await groupsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            {
              $pull: {
                pendingJoinRequests: { studentId: new ObjectId(studentId) },
              },
            }
          );

          // notify student
          await pushNotificationsToUsers([studentId], {
            message: `Your request to join "${group.name}" was rejected by the group admin.`,
            date: new Date(),
            link: `/find-group/${studentId}`,
          });

          return res.send({ success: true, decision: "rejected" });
        }

        // accept flow:
        // 1) block if student already in any group
        if (await isUserInAnyGroup(studentId)) {
          // also remove the stale pending request
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

        // 2) block if this group is full now
        const membersArr = Array.isArray(group.members) ? group.members : [];
        const maxMembers = group.maxMembers || 5;
        if (membersArr.length >= maxMembers) {
          // still remove pending request to avoid dangling
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

        // 3) add to members + remove pending for this student
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
          // 3.5) Remove this student's other pending join requests from ALL groups
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
          { $set: { joinRequests: [] } } // remove all invites sent TO this student
        );

        //    - Optionally, if you also store "pendingInvites" inside groups (admin→student),
        //      you can cleanup those too to be safe:
        await groupsCollection.updateMany(
          {},
          { $pull: { pendingInvites: { studentId: new ObjectId(studentId) } } }
        );

        // 5) notify both student and group admin
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
          link: `/create-group/${group.admin}`, // or a group management page
        });

        // 6) return updated group
        const updated = await groupsCollection.findOne({
          _id: new ObjectId(groupId),
        });
        res.send({ success: true, decision: "accepted", group: updated });
      } catch (err) {
        console.error("PATCH /groups/:groupId/requests/:studentId error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

   // Search papers from arXiv
app.get("/search-papers", async (req, res) => {
  const { q, start } = req.query;
  const query = q || "computer science"; // default keyword
  const startIndex = parseInt(start) || 0;
  const max_results = 50; // smaller number for testing

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
// Get 5 random papers
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

      // Pick 5 random papers
      const shuffled = formatted.sort(() => 0.5 - Math.random());
      const randomFive = shuffled.slice(0, 5);

      res.json(randomFive);
    });
  } catch (error) {
    console.error("Arxiv API Error:", error.message);
    res.status(500).json({ error: "Failed to fetch random papers" });
  }
});



    // Add a paper to bookmarks
    app.post("/users/:id/bookmarks", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }

      const paper = req.body; // expects {paperId, title, authors, summary, link}

      try {
        // Prevent duplicates
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

    // Get all bookmarks for a user
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
    
// Remove a bookmarked paper
app.delete("/users/:id/bookmarks/:paperId", async (req, res) => {
  const { id } = req.params;
  // paperId may contain slashes, so get it from req.params with decodeURIComponent
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



    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Mongo error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Bracu research server is running!"));
app.listen(port, () => console.log(`Server is running on port ${port}`));
