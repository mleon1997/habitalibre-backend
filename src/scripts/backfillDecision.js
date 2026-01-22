// scripts/backfillDecision.js
import mongoose from "mongoose";
import "dotenv/config";
import Lead from "../src/models/Lead.js";
import { leadDecision } from "../src/lib/leadDecision.js";

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("Falta MONGO_URI / MONGODB_URI");

  await mongoose.connect(uri);
  console.log("✅ Conectado a Mongo");

  const cursor = Lead.find({}).cursor();

  let n = 0;
  let updated = 0;

  for await (const lead of cursor) {
    n++;

    try {
      const d = leadDecision(lead.toObject());
      lead.decision = d;
      lead.decisionUpdatedAt = new Date();
      await lead.save();
      updated++;

      if (updated % 50 === 0) console.log(`...updated ${updated}`);
    } catch (e) {
      console.log("⚠️ skip lead", lead?._id?.toString(), e?.message || e);
    }
  }

  console.log(`✅ Done. total=${n} updated=${updated}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});