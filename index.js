#!/usr/bin/env node

"use strict";
import { execSync } from "child_process";
import { getArgs, checkGitRepository } from "./helpers.js";
import { filterApi } from "./filterApi.js";
import { args } from "./config.js";
import axios from "axios";

const REGENERATE_MSG = "♻️ Regenerate Commit Messages";

const language = "english";

const commitType = args["commit-type"];

const processTemplate = ({ template, commitMessage }) => {
  if (!template.includes("COMMIT_MESSAGE")) {
    console.log(`Warning: template doesn't include {COMMIT_MESSAGE}`);

    return commitMessage;
  }

  let finalCommitMessage = template.replaceAll(
    "{COMMIT_MESSAGE}",
    commitMessage
  );

  if (finalCommitMessage.includes("GIT_BRANCH")) {
    const currentBranch = execSync("git branch --show-current")
      .toString()
      .replaceAll("\n", "");

    console.log("Using currentBranch: ", currentBranch);

    finalCommitMessage = finalCommitMessage.replaceAll(
      "{GIT_BRANCH}",
      currentBranch
    );
  }

  return finalCommitMessage;
};

const makeCommit = (input) => {
  console.log("Committing Message... 🚀 ");
  execSync(`git commit -F -`, { input });
  console.log("Commit Successful! 🎉");
};

const sendMessage = async (input) => {
  try {
    const response = await axios.post(
      "http://127.0.0.1:11434/api/generate",
      {
        model: "llama3.2",
        prompt: input,
      },
      {
        responseType: "stream",
      }
    );

    let fullResponse = "";

    response.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      lines.forEach((line) => {
        if (line.trim()) {
          try {
            const jsonResponse = JSON.parse(line);
            fullResponse += jsonResponse.response;
          } catch (error) {
            console.error("Error parsing JSON response:", error);
          }
        }
      });
    });

    // Wait for the end of the stream
    return new Promise((resolve, reject) => {
      response.data.on("end", () => {
        resolve(fullResponse.trim()); // Return the complete response
      });

      response.data.on("error", (error) => {
        console.error("Stream error:", error);
        reject(error);
      });
    });
  } catch (error) {
    console.error("Error communicating with Ollama:", error);
    process.exit(1);
  }
};

const getPromptForSingleCommit = (diff) => {
  return (
    "I want you to act as the author of a commit message in git." +
    ` I'll enter a git diff, and your job is to convert it into a useful commit message in ${language} language` +
    (commitType ? ` with commit type '${commitType}'.` : ".") +
    " Please ensure the commit message follows the conventional commits specification, which includes a type (like 'feat', 'fix', or 'chore') followed by a colon and a brief description. " +
    "Return a single line commit message without any additional text or formatting. All text should be in lowercase." +
    "Here is the git diff:\n" +
    diff
  );
};

const generateSingleCommit = async (diff) => {
  const prompt = getPromptForSingleCommit(diff);

  if (!(await filterApi({ prompt, filterFee: args["filter-fee"] })))
    process.exit(1);

  const text = await sendMessage(prompt); // Get the complete response

  console.log(
    `Proposed Commit:\n------------------------------\n${text}\n------------------------------`
  );

  if (args.force) {
    makeCommit(text); // Use the correct variable here
    return;
  }

  const inquirer = await import("inquirer");
  const answer = await inquirer.default.prompt([
    {
      type: "confirm",
      name: "continue",
      message: "Do you want to continue?",
      default: true,
    },
  ]);

  if (!answer.continue) {
    console.log("Commit aborted by user 🙅‍♂️");
    process.exit(1);
  }

  makeCommit(text); // Use the correct variable here
};

const generateListCommits = async (diff, numOptions = 5) => {
  const prompt =
    "I want you to act as the author of a commit message in git." +
    `I'll enter a git diff, and your job is to convert it into a useful commit message in ${language} language` +
    (commitType ? ` with commit type '${commitType}.', ` : ", ") +
    `and make ${numOptions} options that are separated by ";".` +
    "For each option, use the present tense, return the full sentence, and use the conventional commits specification (<type in lowercase>: <subject>):" +
    diff;

  if (
    !(await filterApi({
      prompt,
      filterFee: args["filter-fee"],
      numCompletion: numOptions,
    }))
  )
    process.exit(1);

  const text = await sendMessage(prompt);

  let msgs = text
    .split(";")
    .map((msg) => msg.trim())
    .map((msg) => processEmoji(msg, args.emoji));

  if (args.template) {
    msgs = msgs.map((msg) =>
      processTemplate({
        template: args.template,
        commitMessage: msg,
      })
    );
  }

  // add regenerate option
  msgs.push(REGENERATE_MSG);

  const inquirer = await import("inquirer");
  const answer = await inquirer.default.prompt([
    {
      type: "list",
      name: "commit",
      message: "Select a commit message",
      choices: msgs,
    },
  ]);

  if (answer.commit === REGENERATE_MSG) {
    await generateListCommits(diff);
    return;
  }

  makeCommit(answer.commit);
};

async function generateAICommit() {
  const isGitRepository = checkGitRepository();

  if (!isGitRepository) {
    console.error("This is not a git repository 🙅‍♂️");
    process.exit(1);
  }

  const diff = execSync("git diff --staged").toString();

  // Handle empty diff
  if (!diff) {
    console.log("No changes to commit 🙅");
    console.log(
      "Maybe you forgot to add the files? Try git add . and then run this script again."
    );
    process.exit(1);
  }

  args.list
    ? await generateListCommits(diff)
    : await generateSingleCommit(diff);
}

await generateAICommit();
