import fs from "fs";
import { spawn } from "child_process";

const pidFile = ".pid";

/**
 * Function to terminate an existing child process based on PID file
 */
const terminateExistingProcess = () => {
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Terminated previous process with PID: ${pid}`);
      } catch (e) {
        console.log(
          `No previous process found or unable to terminate PID ${pid}: ${e.message}`
        );
      }
    }
  }
};

/**
 * Function to start the new child process
 * @returns {ChildProcess} - The spawned child process
 */
const startChildProcess = () => {
  const child = spawn("node", ["dist/index.js"], {
    stdio: "inherit"
  });

  child.on("spawn", () => {
    console.log(`Started new process with PID: ${child.pid}`);
    fs.writeFileSync(pidFile, String(child.pid));
  });

  child.on("error", (err) => {
    console.error("Failed to start child process:", err);
  });

  child.on("exit", (code, signal) => {
    console.log(`Child process exited with code ${code} and signal ${signal}`);
  });

  return child;
};

// Main execution flow
const main = async () => {
  // Terminate any existing process from PID file
  terminateExistingProcess();

  // Start the new child process
  const childProcess = startChildProcess();

  // Handle termination signals
  const handleExit = () => {
    if (childProcess && childProcess.pid) {
      console.log(`Terminating child process with PID: ${childProcess.pid}`);
      try {
        process.kill(childProcess.pid, "SIGTERM");
        console.log("Child process terminated successfully.");
      } catch (err) {
        console.error("Error terminating child process:", err.message);
      }
    }
    process.exit();
  };

  // Handle termination signals
  process.on("SIGTERM", handleExit);
  process.on("SIGINT", handleExit);
  process.on("SIGHUP", handleExit);
  process.on("SIGQUIT", handleExit);
  process.on("SIGBREAK", handleExit);
};

// Execute the main function
main().catch((err) => {
  console.error("Error in restart script:", err);
  process.exit(1);
});
