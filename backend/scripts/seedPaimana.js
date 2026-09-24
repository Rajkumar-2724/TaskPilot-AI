import mongoose from "mongoose";
import dotenv from "dotenv";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import ActivityLog from "../models/ActivityLog.js";
import { RiskPrediction, RiskHistory, Alert, Recommendation, Simulation } from "../models/RiskModels.js";

dotenv.config();

const PAIMANA_SECTORS = [
  { name: "Roads & Highways", sector: "Transport", ministry: "Ministry of Road Transport & Highways", projects: 50, costRange: [500, 50000] },
  { name: "Railways", sector: "Transport", ministry: "Ministry of Railways", projects: 40, costRange: [1000, 80000] },
  { name: "Coal", sector: "Energy", ministry: "Ministry of Coal", projects: 20, costRange: [200, 15000] },
  { name: "Oil & Gas", sector: "Energy", ministry: "Ministry of Petroleum & Natural Gas", projects: 15, costRange: [500, 40000] },
  { name: "Transmission & Distribution", sector: "Energy", ministry: "Ministry of Power", projects: 15, costRange: [300, 10000] },
  { name: "Water Resources", sector: "Water", ministry: "Ministry of Jal Shakti", projects: 15, costRange: [200, 20000] },
  { name: "Electricity Generation", sector: "Energy", ministry: "Ministry of Power", projects: 15, costRange: [500, 30000] },
  { name: "Education", sector: "Education", ministry: "Ministry of Education", projects: 10, costRange: [100, 5000] },
  { name: "Waste & Water", sector: "Water", ministry: "Ministry of Jal Shakti", projects: 10, costRange: [100, 3000] },
  { name: "Healthcare", sector: "Health", ministry: "Ministry of Health & Family Welfare", projects: 10, costRange: [100, 5000] },
  { name: "Aviation", sector: "Transport", ministry: "Ministry of Civil Aviation", projects: 8, costRange: [500, 20000] },
  { name: "Urban Public Transport", sector: "Urban Development", ministry: "Ministry of Housing & Urban Affairs", projects: 10, costRange: [500, 50000] },
  { name: "Steel", sector: "Other", ministry: "Ministry of Steel", projects: 5, costRange: [200, 8000] },
  { name: "Energy Storage", sector: "Energy", ministry: "Ministry of Power", projects: 8, costRange: [300, 15000] },
  { name: "Telecommunication", sector: "Digital Infrastructure", ministry: "Ministry of Communications", projects: 8, costRange: [200, 10000] },
  { name: "Real Estate", sector: "Housing", ministry: "Ministry of Housing & Urban Affairs", projects: 5, costRange: [300, 12000] },
  { name: "Metals & Mining", sector: "Other", ministry: "Ministry of Mines", projects: 5, costRange: [100, 5000] },
  { name: "Shipping", sector: "Transport", ministry: "Ministry of Ports, Shipping & Waterways", projects: 5, costRange: [200, 10000] },
  { name: "Inland Waterways", sector: "Transport", ministry: "Ministry of Ports, Shipping & Waterways", projects: 3, costRange: [500, 15000] },
  { name: "Construction", sector: "Other", ministry: "Ministry of Housing & Urban Affairs", projects: 3, costRange: [100, 3000] },
  { name: "Tourism & Wellness", sector: "Other", ministry: "Ministry of Tourism", projects: 2, costRange: [100, 2000] },
  { name: "Logistics Infrastructure", sector: "Transport", ministry: "Ministry of Commerce & Industry", projects: 2, costRange: [200, 5000] },
];

const STATES = [
  "Maharashtra", "Uttar Pradesh", "Gujarat", "Rajasthan", "Madhya Pradesh",
  "Tamil Nadu", "Karnataka", "Andhra Pradesh", "West Bengal", "Bihar",
  "Telangana", "Chhattisgarh", "Odisha", "Jharkhand", "Assam",
  "Punjab", "Haryana", "Kerala", "Uttarakhand", "Himachal Pradesh",
  "Goa", "Tripura", "Manipur", "Meghalaya", "Nagaland",
  "Mizoram", "Arunachal Pradesh", "Sikkim", "Jammu & Kashmir", "Ladakh",
  "Delhi", "Chandigarh", "Puducherry", "Andaman & Nicobar", "Lakshadweep", "Dadra & Nagar Haveli",
];

const MINISTRIES = [
  "Ministry of Road Transport & Highways",
  "Ministry of Railways",
  "Ministry of Power",
  "Ministry of Jal Shakti",
  "Ministry of Coal",
  "Ministry of Petroleum & Natural Gas",
  "Ministry of Housing & Urban Affairs",
  "Ministry of Health & Family Welfare",
  "Ministry of Education",
  "Ministry of Civil Aviation",
  "Ministry of Communications",
  "Ministry of Steel",
  "Ministry of Mines",
  "Ministry of Ports, Shipping & Waterways",
  "Ministry of Commerce & Industry",
  "Ministry of Tourism",
  "Ministry of New & Renewable Energy",
];

const AGENCIES = [
  "National Highways Authority of India (NHAI)",
  "Rail Vikas Nigam Limited (RVNL)",
  "National Buildings Construction Corporation",
  "Border Roads Organisation",
  "Central Public Works Department",
  "National Projects Construction Corporation",
  "Hindustan Construction Company",
  "Larsen & Toubro",
  "Tata Projects Limited",
  "Adani Infrastructure",
  "GMR Infrastructure",
  "Megha Engineering & Infrastructures",
  "IRCON International",
  "RVNL",
  "NLC India Limited",
];

const STATUSES = ["Planning", "Active", "Active", "Active", "Active", "Suspended", "Completed"];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateProjectName(sector, state, idx) {
  const prefixes = [
    "Construction of", "Development of", "Upgradation of", "Rehabilitation of",
    "Strengthening of", "Expansion of", "Modernization of", "Maintenance of",
    "Establishment of", "Commissioning of", "Commissioning and Trial Runs for",
  ];
  const suffixes = {
    "Transport": ["Highway Section", "Expressway", "Bridge", "Flyover", "Road Corridor", "Railway Line", "Metro Phase", "Airport Terminal", "Port Terminal"],
    "Energy": ["Power Plant", "Solar Park", "Wind Farm", "Substation", "Transmission Line", "Grid Station", "Gas Pipeline"],
    "Water": ["Dam", "Canal", "Water Treatment Plant", "Irrigation Project", "Flood Protection", "Drainage System"],
    "Housing": ["Housing Complex", "Smart City Project", "Township Development", "Urban Renewal"],
    "Health": ["Hospital", "Medical College", "Health Centre", "District Hospital"],
    "Education": ["University Campus", "Technical Institute", "Research Centre", "Skill Development Centre"],
    "Urban Development": ["Metro Rail", "Bus Rapid Transit", "Urban Infrastructure", "Smart City Mission"],
    "Digital Infrastructure": ["Data Centre", "Broadband Network", "5G Tower Network", "Digital Hub"],
    "Other": ["Industrial Park", "Mining Project", "Steel Plant", "Construction Project"],
  };
  const sectorCategory = ["Transport", "Energy", "Water", "Housing", "Health", "Education", "Urban Development", "Digital Infrastructure"].includes(sector) ? sector : "Other";
  const suffix = pick(suffixes[sectorCategory] || suffixes.Other);
  return `${pick(prefixes)} ${suffix} at ${state} - ${sector} (${idx + 1})`;
}

async function seed() {
  console.log("[Seed] Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("[Seed] Connected.");

  console.log("[Seed] Deleting all existing data...");
  await Promise.all([
    Project.deleteMany({}),
    Task.deleteMany({}),
    InfrastructureProject.deleteMany({}),
    ActivityLog.deleteMany({}),
    RiskPrediction.deleteMany({}),
    RiskHistory.deleteMany({}),
    Alert.deleteMany({}),
    Recommendation.deleteMany({}),
    Simulation.deleteMany({}),
  ]);
  console.log("[Seed] All old data deleted.");

  let totalProjects = 0;
  let totalMilestones = 0;

  for (const sec of PAIMANA_SECTORS) {
    console.log(`[Seed] Creating ${sec.projects} projects for sector: ${sec.name}...`);
    const projectsToInsert = [];

    for (let i = 0; i < sec.projects; i++) {
      const state = pick(STATES);
      const originalCost = rand(sec.costRange[0], sec.costRange[1]);
      const revisedCost = Math.round(originalCost * (0.8 + Math.random() * 0.6));
      const physicalProgress = rand(0, 100);
      const financialProgress = Math.max(0, Math.min(100, physicalProgress + rand(-20, 20)));
      const expenditure = Math.round(revisedCost * financialProgress / 100);

      const startDate = new Date(2020 + rand(0, 4), rand(0, 11), rand(1, 28));
      const durationMonths = rand(12, 60);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);

      const status = physicalProgress === 100 ? "Completed" : pick(STATUSES);
      const riskScore = rand(0, 100);
      const riskCategory = riskScore >= 80 ? "Critical" : riskScore >= 60 ? "High" : riskScore >= 30 ? "Moderate" : "Low";

      const milestoneCount = rand(3, 8);
      const completedMs = Math.floor(milestoneCount * physicalProgress / 100);
      const milestones = [];
      for (let m = 0; m < milestoneCount; m++) {
        const msStart = new Date(startDate);
        msStart.setMonth(msStart.getMonth() + Math.floor((durationMonths / milestoneCount) * m));
        const msEnd = new Date(msStart);
        msEnd.setMonth(msEnd.getMonth() + Math.floor(durationMonths / milestoneCount));
        milestones.push({
          title: `Milestone ${m + 1}: Phase ${m + 1}`,
          plannedStartDate: msStart,
          plannedEndDate: msEnd,
          status: m < completedMs ? "Completed" : m === completedMs ? "In Progress" : "Not Started",
          completionPercentage: m < completedMs ? 100 : m === completedMs ? rand(30, 80) : 0,
          physicalProgress: m < completedMs ? 100 : m === completedMs ? rand(30, 80) : 0,
          financialProgress: m < completedMs ? 100 : m === completedMs ? rand(20, 70) : 0,
        });
      }

      const projectCode = `PAIMANA-${sec.name.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(4, "0")}`;
      const costOverrun = revisedCost > originalCost;
      const timeOverrun = Math.random() > 0.6;

      projectsToInsert.push({
        name: generateProjectName(sec.sector, state, i),
        projectCode,
        description: `${sec.name} project under ${sec.ministry} in ${state}. Original cost: ₹${originalCost} Cr, Revised cost: ₹${revisedCost} Cr. Physical progress: ${physicalProgress}%.`,
        sector: sec.sector,
        ministry: sec.ministry,
        state,
        district: "",
        implementationAgency: pick(AGENCIES),
        originalCost,
        revisedCost,
        expenditure,
        budgetSanctioned: originalCost,
        budgetReleased: Math.round(originalCost * (0.6 + Math.random() * 0.4)),
        plannedDuration: durationMonths,
        actualDuration: timeOverrun ? Math.round(durationMonths * (1.1 + Math.random() * 0.5)) : durationMonths,
        plannedStartDate: startDate,
        plannedEndDate: endDate,
        physicalProgress,
        financialProgress,
        milestoneCompletion: Math.round(completedMs / milestoneCount * 100),
        totalMilestones: milestoneCount,
        completedMilestones: completedMs,
        delayedMilestones: timeOverrun ? rand(1, 3) : 0,
        resourceAvailability: rand(60, 100),
        milestones,
        status,
        riskScore,
        riskCategory,
        costOverrunProbability: costOverrun ? rand(50, 95) : rand(5, 40),
        predictedFinalCost: costOverrun ? Math.round(revisedCost * (1.05 + Math.random() * 0.3)) : revisedCost,
        timeOverrunProbability: timeOverrun ? rand(50, 90) : rand(5, 30),
        predictedDelayDays: timeOverrun ? rand(30, 365) : 0,
        costEscalationDrivers: costOverrun ? ["Material Price Escalation", "Design Changes", "Land Acquisition Delay"] : [],
        isActive: true,
        tags: [sec.name, state, sec.ministry],
      });
    }

    const inserted = await InfrastructureProject.insertMany(projectsToInsert);
    totalProjects += inserted.length;
    totalMilestones += projectsToInsert.reduce((sum, p) => sum + p.totalMilestones, 0);
    console.log(`  -> Inserted ${inserted.length} projects (${sec.name})`);
  }

  console.log(`\n[Seed] Done!`);
  console.log(`  Total Infrastructure Projects: ${totalProjects}`);
  console.log(`  Total Milestones: ${totalMilestones}`);
  console.log(`  Sectors: ${PAIMANA_SECTORS.length}`);
  console.log(`  States: ${STATES.length}`);

  await mongoose.disconnect();
  console.log("[Seed] Disconnected from MongoDB.");
}

seed().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
