import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval("SLA sweep", { minutes: 1 }, api.myFunctions.slaSweep, {});
crons.interval("Send email notifications", { minutes: 2 }, api.myFunctions.enqueueEmails, {});

export default crons;
