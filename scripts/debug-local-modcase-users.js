const mongoose = require("mongoose");
require("dotenv").config();

async function main() {
  const url = process.env.MONGO_URL_LOCAL;
  if (!url) {
    console.error("Missing MONGO_URL_LOCAL in .env");
    process.exit(1);
  }

  await mongoose.connect(url, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  const db = mongoose.connection.db;
  const totalDocs = await db.collection("mod_case_users").countDocuments({});

  const agg = await db
    .collection("mod_case_users")
    .aggregate([
      { $unwind: "$cases" },
      {
        $group: {
          _id: null,
          maxCaseId: { $max: "$cases.caseId" },
          minCaseId: { $min: "$cases.caseId" },
          distinct: { $addToSet: "$cases.caseId" },
        },
      },
    ])
    .toArray();

  const countsWanted = {};
  for (const id of [77, 78, 79, 80]) {
    countsWanted[id] = await db
      .collection("mod_case_users")
      .countDocuments({ "cases.caseId": id });
  }

  console.log(
    JSON.stringify(
      {
        dbName: mongoose.connection.name,
        totalDocs,
        agg: agg?.[0] || null,
        countsWanted,
      },
      null,
      2
    )
  );

  await mongoose.disconnect().catch(() => null);
}

main().catch((e) => {
  console.error("LOCAL_CONNECT_FAIL", e?.message || String(e));
  process.exit(0);
});