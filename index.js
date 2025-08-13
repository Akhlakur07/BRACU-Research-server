require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    //
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

        // 📢 Send Notifications to group members
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

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Mongo error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Bracu research server is running!"));
app.listen(port, () => console.log(`Server is running on port ${port}`));
