const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;

const COLLECTION = "sitecontests";

const submissionSchema = new Schema(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    displayName: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    imageUrl: { type: String, required: true },
    category: { type: String, default: "main" },
    likes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const siteContestSchema = new Schema(
  {
    eventKey: { type: String, required: true, unique: true, index: true },
    submissions: { type: [submissionSchema], default: [] },
    /** voterId → { [submissionId]: "like"|"pass" } */
    votes: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const SiteContest: import("mongoose").Model<import("mongoose").InferSchemaType<typeof siteContestSchema>> = models.SiteContest || model("SiteContest", siteContestSchema, COLLECTION);

export = { COLLECTION, SiteContest, siteContestSchema };
