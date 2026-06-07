import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artifacts, network } from "hardhat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connection = await network.create();
  const { ethers } = connection;

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Forum contract with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy the Forum contract (no constructor arguments).
  const Forum = await ethers.getContractFactory("Forum");
  const forum = await Forum.deploy();
  await forum.waitForDeployment();

  const address = await forum.getAddress();
  console.log("Forum deployed to:", address);

  // ── Write deployment info for the frontend ────────────────────────────────
  const deploymentInfo = {
    contractAddress: address,
    network: connection.networkName,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
  };

  const envOut = path.join(__dirname, "../frontend/src/environments/deployment.json");
  fs.mkdirSync(path.dirname(envOut), { recursive: true });
  fs.writeFileSync(envOut, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info written to:", envOut);

  console.log("\nNext steps:");
  console.log("  1. Update frontend/src/environments/environment.ts with the address above.");
  console.log("  2. Copy subgraph/abis/Forum.json and update subgraph/subgraph.yaml with the address.");
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
